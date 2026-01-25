import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/** Size of grid cells for entrance placement (in blocks) */
const GRID_SIZE = 64

/** Noise frequency for entrance location selection */
const LOCATION_NOISE_FREQUENCY = 0.005

/** Step size for worm movement */
const STEP_SIZE = 2

/** How far to search for entrance worms from nearby regions */
const REGION_SEARCH_RADIUS = 3

/**
 * Represents a segment of an entrance tunnel.
 */
interface TunnelSegment {
  x: number
  y: number
  z: number
  radius: number
}

/**
 * Generates cave entrances using tunnel worms that start at the surface
 * and trend downward, creating natural-looking cave openings.
 */
export class NoiseEntranceCarver {
  private readonly locationNoise: SimplexNoise
  private readonly directionNoise: SimplexNoise
  private readonly radiusNoise: SimplexNoise
  private readonly jitterNoise: SimplexNoise

  constructor(seed: number) {
    this.locationNoise = new SimplexNoise(seed + 400)
    this.directionNoise = new SimplexNoise(seed + 401)
    this.radiusNoise = new SimplexNoise(seed + 402)
    this.jitterNoise = new SimplexNoise(seed + 403)
  }

  /**
   * Carve entrance tunnels into the chunk.
   */
  async carve(
    chunk: IChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): Promise<void> {
    if (!settings.noiseEntranceEnabled) return

    const coord = chunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Collect all tunnel segments that could affect this chunk
    const segments = this.collectSegmentsForChunk(
      chunkWorldX,
      chunkWorldZ,
      settings,
      getHeightAt
    )

    // Carve each segment
    for (const segment of segments) {
      this.carveSegmentInChunk(chunk, segment, chunkWorldX, chunkWorldZ)
    }
  }

  /**
   * Carve entrance tunnels within a sub-chunk's Y range.
   */
  async carveSubChunk(
    subChunk: ISubChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    minWorldY: number,
    maxWorldY: number
  ): Promise<void> {
    if (!settings.noiseEntranceEnabled) return

    const coord = subChunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Collect all tunnel segments that could affect this chunk
    const segments = this.collectSegmentsForChunk(
      chunkWorldX,
      chunkWorldZ,
      settings,
      getHeightAt
    )

    // Carve each segment within sub-chunk Y range
    for (const segment of segments) {
      this.carveSegmentInSubChunk(
        subChunk,
        segment,
        chunkWorldX,
        chunkWorldZ,
        minWorldY,
        maxWorldY
      )
    }
  }

  /**
   * Collect all entrance tunnel segments from nearby grid cells.
   */
  private collectSegmentsForChunk(
    chunkWorldX: number,
    chunkWorldZ: number,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): TunnelSegment[] {
    const segments: TunnelSegment[] = []

    const density = settings.noiseEntranceDensity ?? 0.15
    const minRadius = settings.noiseEntranceMinRadius ?? 3
    const maxRadius = settings.noiseEntranceMaxRadius ?? 6
    const minDepth = settings.noiseEntranceMinDepth ?? 20
    const maxDepth = settings.noiseEntranceMaxDepth ?? 50

    // Determine which grid cells to search
    const searchRadius = maxDepth + CHUNK_SIZE_X
    const gridStartX = Math.floor((chunkWorldX - searchRadius) / GRID_SIZE) * GRID_SIZE
    const gridEndX = Math.floor((chunkWorldX + CHUNK_SIZE_X + searchRadius) / GRID_SIZE) * GRID_SIZE
    const gridStartZ = Math.floor((chunkWorldZ - searchRadius) / GRID_SIZE) * GRID_SIZE
    const gridEndZ = Math.floor((chunkWorldZ + CHUNK_SIZE_Z + searchRadius) / GRID_SIZE) * GRID_SIZE

    for (let gridX = gridStartX; gridX <= gridEndX; gridX += GRID_SIZE) {
      for (let gridZ = gridStartZ; gridZ <= gridEndZ; gridZ += GRID_SIZE) {
        // Use 2D noise to determine if this cell has an entrance
        const spawnNoise = this.locationNoise.noise2D(
          gridX * LOCATION_NOISE_FREQUENCY,
          gridZ * LOCATION_NOISE_FREQUENCY
        )
        const normalizedNoise = (spawnNoise + 1) / 2

        if (normalizedNoise >= density) continue

        // Calculate jittered position within cell
        const margin = GRID_SIZE * 0.15
        const jitterX = this.jitterNoise.noise2D(gridX * 0.1, gridZ * 0.1 + 500)
        const jitterZ = this.jitterNoise.noise2D(gridX * 0.1 + 500, gridZ * 0.1)
        const entranceX = gridX + margin + (jitterX + 1) / 2 * (GRID_SIZE - margin * 2)
        const entranceZ = gridZ + margin + (jitterZ + 1) / 2 * (GRID_SIZE - margin * 2)

        // Get surface height at entrance
        const surfaceY = getHeightAt(entranceX, entranceZ)

        // Calculate entrance parameters from noise
        const radiusNoise = (this.radiusNoise.noise2D(entranceX * 0.02, entranceZ * 0.02) + 1) / 2
        const radius = minRadius + radiusNoise * (maxRadius - minRadius)

        const depthNoise = (this.radiusNoise.noise2D(entranceX * 0.015 + 100, entranceZ * 0.015 + 100) + 1) / 2
        const depth = minDepth + depthNoise * (maxDepth - minDepth)

        // Generate the entrance tunnel worm
        const tunnelSegments = this.traceEntranceTunnel(
          entranceX,
          surfaceY,
          entranceZ,
          depth,
          radius,
          settings
        )

        for (const seg of tunnelSegments) {
          segments.push(seg)
        }
      }
    }

    return segments
  }

  /**
   * Trace an entrance tunnel from surface downward.
   * Uses the same worm algorithm as regular caves but biased downward.
   */
  private traceEntranceTunnel(
    startX: number,
    startY: number,
    startZ: number,
    depth: number,
    baseRadius: number,
    settings: CaveSettings
  ): TunnelSegment[] {
    const segments: TunnelSegment[] = []
    const maxSteps = Math.floor(depth / STEP_SIZE) * 2 // Extra steps for winding

    let x = startX
    let y = startY + 1 // Start just above surface
    let z = startZ

    // Initial direction: random horizontal with strong downward bias
    let dx = this.directionNoise.noise3D(startX * 0.1, startY * 0.1, startZ * 0.1)
    let dy = -0.7 // Strong downward bias
    let dz = this.directionNoise.noise3D(startX * 0.1 + 100, startY * 0.1, startZ * 0.1)

    // Normalize
    let len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    dx /= len
    dy /= len
    dz /= len

    const targetY = startY - depth

    for (let step = 0; step < maxSteps; step++) {
      // Stop if we've reached target depth
      if (y <= targetY) break

      // Calculate radius with variation
      const radiusVariation = this.radiusNoise.noise3D(x * 0.05, y * 0.05, z * 0.05)
      const radius = baseRadius * (0.7 + radiusVariation * 0.3)

      // Add segment
      segments.push({ x, y, z, radius })

      // Sample noise for direction change
      const noiseX = this.directionNoise.noise3D(x * 0.03, y * 0.03, z * 0.03)
      const noiseY = this.directionNoise.noise3D(x * 0.03 + 50, y * 0.03, z * 0.03)
      const noiseZ = this.directionNoise.noise3D(x * 0.03, y * 0.03 + 50, z * 0.03)

      // Update direction with noise influence
      const turnRate = 0.25
      dx = dx * (1 - turnRate) + noiseX * turnRate
      // Keep strong downward bias, but allow some variation
      dy = dy * (1 - turnRate) + (noiseY * 0.3 - 0.5) * turnRate
      dz = dz * (1 - turnRate) + noiseZ * turnRate

      // Ensure we're still trending downward
      if (dy > -0.3) dy = -0.3

      // Renormalize
      len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len > 0) {
        dx /= len
        dy /= len
        dz /= len
      }

      // Move to next position
      x += dx * STEP_SIZE
      y += dy * STEP_SIZE
      z += dz * STEP_SIZE
    }

    return segments
  }

  /**
   * Carve a tunnel segment into a chunk.
   */
  private carveSegmentInChunk(
    chunk: IChunkData,
    segment: TunnelSegment,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { x, y, z, radius } = segment
    const radiusCeil = Math.ceil(radius)

    // Check if segment could intersect this chunk
    if (
      x + radiusCeil < chunkWorldX ||
      x - radiusCeil >= chunkWorldX + CHUNK_SIZE_X ||
      z + radiusCeil < chunkWorldZ ||
      z - radiusCeil >= chunkWorldZ + CHUNK_SIZE_Z
    ) {
      return
    }

    // Carve a sphere at this position
    for (let dx = -radiusCeil; dx <= radiusCeil; dx++) {
      for (let dy = -radiusCeil; dy <= radiusCeil; dy++) {
        for (let dz = -radiusCeil; dz <= radiusCeil; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz
          if (distSq > radius * radius) continue

          const worldX = Math.floor(x + dx)
          const worldY = Math.floor(y + dy)
          const worldZ = Math.floor(z + dz)

          const localX = worldX - chunkWorldX
          const localZ = worldZ - chunkWorldZ

          if (
            localX < 0 || localX >= CHUNK_SIZE_X ||
            localZ < 0 || localZ >= CHUNK_SIZE_Z ||
            worldY < 0 || worldY >= 1024
          ) {
            continue
          }

          const currentBlock = chunk.getBlockId(localX, worldY, localZ)
          if (
            currentBlock !== BlockIds.AIR &&
            currentBlock !== BlockIds.WATER &&
            currentBlock !== BlockIds.LAVA
          ) {
            chunk.setBlockId(localX, worldY, localZ, BlockIds.AIR)
          }
        }
      }
    }
  }

  /**
   * Carve a tunnel segment into a sub-chunk.
   */
  private carveSegmentInSubChunk(
    subChunk: ISubChunkData,
    segment: TunnelSegment,
    chunkWorldX: number,
    chunkWorldZ: number,
    minWorldY: number,
    maxWorldY: number
  ): void {
    const { x, y, z, radius } = segment
    const radiusCeil = Math.ceil(radius)

    // Check Y range
    if (y + radiusCeil < minWorldY || y - radiusCeil > maxWorldY) {
      return
    }

    // Check XZ range
    if (
      x + radiusCeil < chunkWorldX ||
      x - radiusCeil >= chunkWorldX + CHUNK_SIZE_X ||
      z + radiusCeil < chunkWorldZ ||
      z - radiusCeil >= chunkWorldZ + CHUNK_SIZE_Z
    ) {
      return
    }

    // Carve a sphere at this position
    for (let dx = -radiusCeil; dx <= radiusCeil; dx++) {
      for (let dy = -radiusCeil; dy <= radiusCeil; dy++) {
        for (let dz = -radiusCeil; dz <= radiusCeil; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz
          if (distSq > radius * radius) continue

          const worldX = Math.floor(x + dx)
          const worldY = Math.floor(y + dy)
          const worldZ = Math.floor(z + dz)

          if (worldY < minWorldY || worldY > maxWorldY) continue

          const localX = worldX - chunkWorldX
          const localZ = worldZ - chunkWorldZ
          const localY = worldY - minWorldY

          if (
            localX < 0 || localX >= CHUNK_SIZE_X ||
            localZ < 0 || localZ >= CHUNK_SIZE_Z ||
            localY < 0 || localY >= 64
          ) {
            continue
          }

          const currentBlock = subChunk.getBlockId(localX, localY, localZ)
          if (
            currentBlock !== BlockIds.AIR &&
            currentBlock !== BlockIds.WATER &&
            currentBlock !== BlockIds.LAVA
          ) {
            subChunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
          }
        }
      }
    }
  }
}
