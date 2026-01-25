import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import type { FrameBudget } from '../../../core/FrameBudget.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/** Size of a region for spawning tunnel worms (in blocks) */
const REGION_SIZE = 64

/** Step size for worm movement (blocks per step) */
const STEP_SIZE = 3

/** Noise frequency for direction sampling */
const DIRECTION_NOISE_FREQUENCY = 0.02

/** Noise frequency for radius variation */
const RADIUS_NOISE_FREQUENCY = 0.05

/** How far to extend region search for cross-chunk worms */
const REGION_SEARCH_RADIUS = 2

/** Maximum branch depth to prevent runaway branching */
const MAX_BRANCH_DEPTH = 3

/**
 * Represents a point along a tunnel worm's path.
 */
interface WormSegment {
  x: number
  y: number
  z: number
  radius: number
}

/**
 * Work item for iterative worm tracing.
 */
interface WormWorkItem {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  depth: number
  maxLength: number
  step: number
}

/**
 * Generates interconnected tunnel networks using Perlin worm algorithm.
 * Worms trace paths through 3D space using noise to guide direction,
 * creating guaranteed connected cave systems.
 */
export class TunnelNetworkCarver {
  private readonly directionNoise: SimplexNoise
  private readonly radiusNoise: SimplexNoise
  private readonly spawnNoise: SimplexNoise

  constructor(seed: number) {
    this.directionNoise = new SimplexNoise(seed)
    this.radiusNoise = new SimplexNoise(seed + 100)
    this.spawnNoise = new SimplexNoise(seed + 200)
  }

  /**
   * Carve tunnel networks into the chunk.
   */
  async carve(
    chunk: IChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    frameBudget?: FrameBudget
  ): Promise<void> {
    const coord = chunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    frameBudget?.startFrame()

    // Find all regions that could have worms passing through this chunk
    const segments = this.collectSegmentsForChunk(
      chunkWorldX,
      chunkWorldZ,
      settings,
      getHeightAt
    )

    // Carve all segments that intersect this chunk
    for (const segment of segments) {
      this.carveSegmentInChunk(chunk, segment, chunkWorldX, chunkWorldZ, getHeightAt)
    }

    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Carve tunnel networks within a sub-chunk's Y range.
   */
  async carveSubChunk(
    subChunk: ISubChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    minWorldY: number,
    maxWorldY: number
  ): Promise<void> {
    const coord = subChunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Collect segments for nearby regions
    const segments = this.collectSegmentsForChunk(
      chunkWorldX,
      chunkWorldZ,
      settings,
      getHeightAt
    )

    // Carve segments within the sub-chunk Y range
    for (const segment of segments) {
      this.carveSegmentInSubChunk(
        subChunk,
        segment,
        chunkWorldX,
        chunkWorldZ,
        minWorldY,
        maxWorldY,
        getHeightAt
      )
    }
  }

  /**
   * Collect all tunnel segments from nearby regions that might pass through a chunk.
   */
  private collectSegmentsForChunk(
    chunkWorldX: number,
    chunkWorldZ: number,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): WormSegment[] {
    const segments: WormSegment[] = []

    // Determine which regions to search for regular tunnels
    const regionX = Math.floor(chunkWorldX / REGION_SIZE)
    const regionZ = Math.floor(chunkWorldZ / REGION_SIZE)

    // Search nearby regions (worms can extend beyond their spawn region)
    for (let rx = regionX - REGION_SEARCH_RADIUS; rx <= regionX + REGION_SEARCH_RADIUS; rx++) {
      for (let rz = regionZ - REGION_SEARCH_RADIUS; rz <= regionZ + REGION_SEARCH_RADIUS; rz++) {
        const regionSegments = this.generateRegionWorms(rx, rz, settings, getHeightAt)
        // Use loop instead of spread to avoid stack overflow with large arrays
        for (let i = 0; i < regionSegments.length; i++) {
          segments.push(regionSegments[i])
        }
      }
    }

    return segments
  }

  /**
   * Generate all worm segments for a given region.
   */
  private generateRegionWorms(
    regionX: number,
    regionZ: number,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): WormSegment[] {
    const segments: WormSegment[] = []
    const { tunnelDensity, minY, maxY } = settings

    // Deterministic spawn points based on region coordinates
    const spawnPoints = this.getSpawnPointsForRegion(regionX, regionZ, tunnelDensity, minY, maxY, getHeightAt)

    for (const spawn of spawnPoints) {
      // Generate the worm path starting from this spawn point (iterative)
      const wormSegments = this.traceWormIterative(spawn.x, spawn.y, spawn.z, settings, getHeightAt)
      // Use loop instead of spread to avoid stack overflow with large arrays
      for (let i = 0; i < wormSegments.length; i++) {
        segments.push(wormSegments[i])
      }
    }

    return segments
  }

  /**
   * Get deterministic spawn points for worms in a region.
   */
  private getSpawnPointsForRegion(
    regionX: number,
    regionZ: number,
    density: number,
    minY: number,
    maxY: number,
    getHeightAt: HeightGetter
  ): { x: number; y: number; z: number }[] {
    const points: { x: number; y: number; z: number }[] = []

    // Use noise to deterministically distribute spawn points
    const regionWorldX = regionX * REGION_SIZE
    const regionWorldZ = regionZ * REGION_SIZE

    // Create a grid of potential spawn points and use noise to select which ones spawn
    const gridSize = Math.ceil(Math.sqrt(density * 2)) // Oversample to get desired density
    const cellSize = REGION_SIZE / gridSize

    for (let gx = 0; gx < gridSize; gx++) {
      for (let gz = 0; gz < gridSize; gz++) {
        const cellX = regionWorldX + gx * cellSize + cellSize / 2
        const cellZ = regionWorldZ + gz * cellSize + cellSize / 2

        // Use noise to determine if this cell spawns a worm
        const spawnChance = this.spawnNoise.noise2D(cellX * 0.01, cellZ * 0.01)
        const threshold = 1 - (density / (gridSize * gridSize))

        if (spawnChance > threshold) {
          // Jitter the position within the cell
          const jitterX = this.spawnNoise.noise2D(cellX * 0.1 + 100, cellZ * 0.1) * cellSize * 0.4
          const jitterZ = this.spawnNoise.noise2D(cellX * 0.1, cellZ * 0.1 + 100) * cellSize * 0.4

          const x = cellX + jitterX
          const z = cellZ + jitterZ

          // Get surface height and spawn below it
          const surfaceY = getHeightAt(x, z)
          const caveRangeTop = Math.min(maxY, surfaceY - 10)

          if (caveRangeTop > minY) {
            // Spawn at random Y within cave range
            const yNoise = (this.spawnNoise.noise2D(cellX * 0.05, cellZ * 0.05) + 1) / 2
            const y = minY + (caveRangeTop - minY) * yNoise

            points.push({ x, y, z })
          }
        }
      }
    }

    return points
  }

  /**
   * Trace worm paths iteratively using a work queue (avoids stack overflow).
   */
  private traceWormIterative(
    startX: number,
    startY: number,
    startZ: number,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): WormSegment[] {
    const {
      tunnelMinRadius,
      tunnelMaxRadius,
      tunnelMaxLength,
      tunnelBranchChance,
      tunnelTurnRate,
      tunnelVerticalBias,
      minY,
      maxY
    } = settings

    const segments: WormSegment[] = []

    // Work queue for iterative processing
    const workQueue: WormWorkItem[] = []

    // Initialize first worm with direction from noise
    const initDx = this.directionNoise.noise3D(startX * 0.1, startY * 0.1, startZ * 0.1)
    const initDy = this.directionNoise.noise3D(startX * 0.1 + 50, startY * 0.1, startZ * 0.1)
    const initDz = this.directionNoise.noise3D(startX * 0.1, startY * 0.1 + 50, startZ * 0.1)
    const initLen = Math.sqrt(initDx * initDx + initDy * initDy + initDz * initDz)

    workQueue.push({
      x: startX,
      y: startY,
      z: startZ,
      dx: initLen > 0 ? initDx / initLen : 1,
      dy: initLen > 0 ? initDy / initLen : 0,
      dz: initLen > 0 ? initDz / initLen : 0,
      depth: 0,
      maxLength: tunnelMaxLength,
      step: 0
    })

    // Process work queue iteratively
    while (workQueue.length > 0) {
      const work = workQueue.pop()!

      let { x, y, z, dx, dy, dz, depth, maxLength, step } = work

      // Continue tracing this worm
      while (step < maxLength) {
        // Get surface height at current position
        const surfaceY = getHeightAt(x, z)
        const effectiveMaxY = Math.min(maxY, surfaceY - 5)

        // Stop if we've gone out of bounds
        if (y < minY || y > effectiveMaxY) {
          break
        }

        // Calculate radius using noise for variation
        const radiusNoise = (this.radiusNoise.noise3D(
          x * RADIUS_NOISE_FREQUENCY,
          y * RADIUS_NOISE_FREQUENCY,
          z * RADIUS_NOISE_FREQUENCY
        ) + 1) / 2
        const radius = tunnelMinRadius + radiusNoise * (tunnelMaxRadius - tunnelMinRadius)

        // Add segment
        segments.push({ x, y, z, radius })

        // Sample noise for new direction
        const noiseX = this.directionNoise.noise3D(
          x * DIRECTION_NOISE_FREQUENCY,
          y * DIRECTION_NOISE_FREQUENCY,
          z * DIRECTION_NOISE_FREQUENCY
        )
        const noiseY = this.directionNoise.noise3D(
          x * DIRECTION_NOISE_FREQUENCY + 1000,
          y * DIRECTION_NOISE_FREQUENCY,
          z * DIRECTION_NOISE_FREQUENCY
        )
        const noiseZ = this.directionNoise.noise3D(
          x * DIRECTION_NOISE_FREQUENCY,
          y * DIRECTION_NOISE_FREQUENCY + 1000,
          z * DIRECTION_NOISE_FREQUENCY
        )

        // Lerp towards noise direction
        dx = dx * (1 - tunnelTurnRate) + noiseX * tunnelTurnRate
        dy = dy * (1 - tunnelTurnRate) + (noiseY + tunnelVerticalBias) * tunnelTurnRate
        dz = dz * (1 - tunnelTurnRate) + noiseZ * tunnelTurnRate

        // Re-normalize
        const newLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (newLen > 0) {
          dx /= newLen
          dy /= newLen
          dz /= newLen
        }

        // Check for branching (add to queue instead of recursive call)
        if (depth < MAX_BRANCH_DEPTH && step > 20) {
          const branchNoise = this.spawnNoise.noise3D(x * 0.05, y * 0.05, z * 0.05)
          if ((branchNoise + 1) / 2 < tunnelBranchChance) {
            // Create a branch with a perpendicular direction
            const branchDx = dz
            const branchDz = -dx
            // Use deterministic noise instead of Math.random()
            const branchDyOffset = this.spawnNoise.noise3D(x * 0.1, y * 0.1, z * 0.1) * 0.25
            const branchDy = dy + branchDyOffset

            // Normalize branch direction
            const branchLen = Math.sqrt(branchDx * branchDx + branchDy * branchDy + branchDz * branchDz)

            // Add branch to work queue
            workQueue.push({
              x: x + branchDx * STEP_SIZE * 2,
              y: y + branchDy * STEP_SIZE * 2,
              z: z + branchDz * STEP_SIZE * 2,
              dx: branchLen > 0 ? branchDx / branchLen : branchDx,
              dy: branchLen > 0 ? branchDy / branchLen : branchDy,
              dz: branchLen > 0 ? branchDz / branchLen : branchDz,
              depth: depth + 1,
              maxLength: Math.floor(maxLength * 0.6), // Branches are shorter
              step: 0
            })
          }
        }

        // Move to next position
        x += dx * STEP_SIZE
        y += dy * STEP_SIZE
        z += dz * STEP_SIZE
        step++
      }
    }

    return segments
  }

  /**
   * Carve a segment sphere into a chunk if it intersects.
   */
  private carveSegmentInChunk(
    chunk: IChunkData,
    segment: WormSegment,
    chunkWorldX: number,
    chunkWorldZ: number,
    getHeightAt: HeightGetter
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
          // Check if within sphere
          const distSq = dx * dx + dy * dy + dz * dz
          if (distSq > radius * radius) continue

          const worldX = Math.floor(x + dx)
          const worldY = Math.floor(y + dy)
          const worldZ = Math.floor(z + dz)

          // Check if within this chunk
          const localX = worldX - chunkWorldX
          const localZ = worldZ - chunkWorldZ

          if (
            localX < 0 || localX >= CHUNK_SIZE_X ||
            localZ < 0 || localZ >= CHUNK_SIZE_Z ||
            worldY < 0 || worldY >= 1024
          ) {
            continue
          }

          // Don't carve at or above surface
          const surfaceY = getHeightAt(worldX, worldZ)
          if (worldY >= surfaceY - 2) continue

          // Carve
          const currentBlock = chunk.getBlockId(localX, worldY, localZ)
          if (currentBlock !== BlockIds.AIR && currentBlock !== BlockIds.WATER) {
            chunk.setBlockId(localX, worldY, localZ, BlockIds.AIR)
          }
        }
      }
    }
  }

  /**
   * Carve a segment sphere into a sub-chunk if it intersects.
   */
  private carveSegmentInSubChunk(
    subChunk: ISubChunkData,
    segment: WormSegment,
    chunkWorldX: number,
    chunkWorldZ: number,
    minWorldY: number,
    maxWorldY: number,
    getHeightAt: HeightGetter
  ): void {
    const { x, y, z, radius } = segment
    const radiusCeil = Math.ceil(radius)

    // Check if segment could intersect this sub-chunk's Y range
    if (y + radiusCeil < minWorldY || y - radiusCeil > maxWorldY) {
      return
    }

    // Check if segment could intersect this chunk's XZ range
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
          // Check if within sphere
          const distSq = dx * dx + dy * dy + dz * dz
          if (distSq > radius * radius) continue

          const worldX = Math.floor(x + dx)
          const worldY = Math.floor(y + dy)
          const worldZ = Math.floor(z + dz)

          // Check Y range for sub-chunk
          if (worldY < minWorldY || worldY > maxWorldY) continue

          // Check if within this chunk's XZ
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

          // Don't carve at or above surface
          const surfaceY = getHeightAt(worldX, worldZ)
          if (worldY >= surfaceY - 2) continue

          // Carve
          const currentBlock = subChunk.getBlockId(localX, localY, localZ)
          if (currentBlock !== BlockIds.AIR && currentBlock !== BlockIds.WATER) {
            subChunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
          }
        }
      }
    }
  }
}
