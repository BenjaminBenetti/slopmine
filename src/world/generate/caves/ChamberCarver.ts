import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/** Size of a region for chamber placement (in blocks) */
const GRID_SIZE = 128

/** How far to extend region search for cross-chunk chambers */
const REGION_SEARCH_RADIUS = 2

/**
 * Represents a cave chamber's position and dimensions.
 */
interface Chamber {
  centerX: number
  centerY: number
  centerZ: number
  radiusX: number
  radiusY: number
  radiusZ: number
  // Rotation angle for elongated chambers (radians)
  rotationAngle: number
  // How elongated the chamber is (1.0 = circular, 2.0+ = very elongated)
  elongation: number
}

/**
 * Generates large underground cave chambers using grid-based placement
 * with noise filtering. Chambers are ellipsoid-shaped with noise
 * perturbation for organic blob-like appearances.
 */
export class ChamberCarver {
  private readonly locationNoise: SimplexNoise
  private readonly shapeNoise: SimplexNoise
  private readonly sizeNoise: SimplexNoise

  constructor(seed: number) {
    this.locationNoise = new SimplexNoise(seed + 500)
    this.shapeNoise = new SimplexNoise(seed + 501)
    this.sizeNoise = new SimplexNoise(seed + 502)
  }

  /**
   * Carve cave chambers into the chunk terrain.
   */
  async carve(
    chunk: IChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): Promise<void> {
    if (!settings.chamberEnabled) return

    const coord = chunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Collect chambers that could intersect this chunk
    const chambers = this.collectChambersForChunk(
      chunkWorldX,
      chunkWorldZ,
      settings,
      getHeightAt
    )

    // Carve all chambers that intersect this chunk
    for (const chamber of chambers) {
      this.carveChamberInChunk(chunk, chamber, chunkWorldX, chunkWorldZ, 0, 1023, getHeightAt)
    }
  }

  /**
   * Carve cave chambers within a sub-chunk's Y range.
   */
  async carveSubChunk(
    subChunk: ISubChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    minWorldY: number,
    maxWorldY: number
  ): Promise<void> {
    if (!settings.chamberEnabled) return

    const coord = subChunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Collect chambers for nearby regions
    const chambers = this.collectChambersForChunk(
      chunkWorldX,
      chunkWorldZ,
      settings,
      getHeightAt
    )

    // Carve chambers within the sub-chunk Y range
    for (const chamber of chambers) {
      this.carveChamberInSubChunk(
        subChunk,
        chamber,
        chunkWorldX,
        chunkWorldZ,
        minWorldY,
        maxWorldY,
        getHeightAt
      )
    }
  }

  /**
   * Collect all chambers from nearby grid cells that might intersect a chunk.
   */
  private collectChambersForChunk(
    chunkWorldX: number,
    chunkWorldZ: number,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): Chamber[] {
    const chambers: Chamber[] = []
    const density = settings.chamberDensity ?? 0.25
    const minRadius = settings.chamberMinRadius ?? 12
    const maxRadius = settings.chamberMaxRadius ?? 28
    const minY = settings.chamberMinY ?? 170
    const maxY = settings.chamberMaxY ?? 200

    // Determine which grid cells to search
    const gridX = Math.floor(chunkWorldX / GRID_SIZE)
    const gridZ = Math.floor(chunkWorldZ / GRID_SIZE)

    // Search nearby grid cells (chambers can extend beyond their grid cell)
    for (let gx = gridX - REGION_SEARCH_RADIUS; gx <= gridX + REGION_SEARCH_RADIUS; gx++) {
      for (let gz = gridZ - REGION_SEARCH_RADIUS; gz <= gridZ + REGION_SEARCH_RADIUS; gz++) {
        const cellWorldX = gx * GRID_SIZE
        const cellWorldZ = gz * GRID_SIZE

        // Use noise to determine if this grid cell has a chamber
        const spawnNoise = this.locationNoise.noise2D(cellWorldX * 0.007, cellWorldZ * 0.007)
        const normalizedNoise = (spawnNoise + 1) / 2
        if (normalizedNoise >= density) continue

        // Calculate chamber center position with jitter within grid cell
        const jitterX = (this.sizeNoise.noise2D(cellWorldX * 0.03 + 100, cellWorldZ * 0.03) + 1) / 2
        const jitterZ = (this.sizeNoise.noise2D(cellWorldX * 0.03, cellWorldZ * 0.03 + 100) + 1) / 2
        const centerX = cellWorldX + jitterX * (GRID_SIZE - maxRadius * 2) + maxRadius
        const centerZ = cellWorldZ + jitterZ * (GRID_SIZE - maxRadius * 2) + maxRadius

        // Get surface height to ensure chamber is underground
        const surfaceY = getHeightAt(centerX, centerZ)
        const effectiveMaxY = Math.min(maxY, surfaceY - 10)

        if (effectiveMaxY <= minY) continue

        // Calculate center Y with noise
        const yNoise = (this.sizeNoise.noise2D(centerX * 0.02, centerZ * 0.02) + 1) / 2
        const centerY = minY + (effectiveMaxY - minY) * yNoise

        // Calculate base radius with wide variation
        const radiusNoise = (this.sizeNoise.noise3D(centerX * 0.04, centerY * 0.04, centerZ * 0.04) + 1) / 2
        const baseRadius = minRadius + radiusNoise * (maxRadius - minRadius)

        // Determine elongation (1.0 to 2.5) - some chambers are very stretched
        const elongationNoise = (this.sizeNoise.noise2D(centerX * 0.05 + 300, centerZ * 0.05) + 1) / 2
        const elongation = 1.0 + elongationNoise * 1.5

        // Random rotation angle for elongated direction
        const rotationNoise = (this.sizeNoise.noise2D(centerX * 0.06 + 400, centerZ * 0.06 + 400) + 1) / 2
        const rotationAngle = rotationNoise * Math.PI // 0 to PI radians

        // Calculate radii - elongated in one horizontal direction, compressed in other
        const radiusX = baseRadius * elongation
        const radiusZ = baseRadius / Math.sqrt(elongation) // Keep area roughly consistent

        // Vertical radius is always flatter (0.3 to 0.6 of horizontal)
        const verticalNoise = (this.sizeNoise.noise2D(centerX * 0.07 + 500, centerZ * 0.07) + 1) / 2
        const radiusY = baseRadius * (0.3 + verticalNoise * 0.3)

        chambers.push({
          centerX,
          centerY,
          centerZ,
          radiusX,
          radiusY,
          radiusZ,
          rotationAngle,
          elongation
        })
      }
    }

    return chambers
  }

  /**
   * Carve a chamber into a chunk.
   */
  private carveChamberInChunk(
    chunk: IChunkData,
    chamber: Chamber,
    chunkWorldX: number,
    chunkWorldZ: number,
    minY: number,
    maxY: number,
    getHeightAt: HeightGetter
  ): void {
    const { centerX, centerY, centerZ, radiusX, radiusY, radiusZ, rotationAngle } = chamber
    const maxRadiusCeil = Math.ceil(Math.max(radiusX, radiusZ) * 1.5) // Extra margin for rotation

    // Quick bounds check
    if (
      centerX + maxRadiusCeil < chunkWorldX ||
      centerX - maxRadiusCeil >= chunkWorldX + CHUNK_SIZE_X ||
      centerZ + maxRadiusCeil < chunkWorldZ ||
      centerZ - maxRadiusCeil >= chunkWorldZ + CHUNK_SIZE_Z
    ) {
      return
    }

    // Precompute rotation values
    const cosAngle = Math.cos(rotationAngle)
    const sinAngle = Math.sin(rotationAngle)

    // Determine carving bounds (with extra margin for rotation)
    const startX = Math.max(0, Math.floor(centerX - maxRadiusCeil) - chunkWorldX)
    const endX = Math.min(CHUNK_SIZE_X - 1, Math.ceil(centerX + maxRadiusCeil) - chunkWorldX)
    const startZ = Math.max(0, Math.floor(centerZ - maxRadiusCeil) - chunkWorldZ)
    const endZ = Math.min(CHUNK_SIZE_Z - 1, Math.ceil(centerZ + maxRadiusCeil) - chunkWorldZ)
    const startY = Math.max(minY, Math.floor(centerY - radiusY * 1.5))
    const endY = Math.min(maxY, Math.ceil(centerY + radiusY * 1.5))

    // Carve the rotated ellipsoid with multi-octave noise perturbation
    for (let localX = startX; localX <= endX; localX++) {
      for (let localZ = startZ; localZ <= endZ; localZ++) {
        const worldX = chunkWorldX + localX
        const worldZ = chunkWorldZ + localZ

        // Get surface height to prevent carving too close to surface
        const surfaceY = getHeightAt(worldX, worldZ)

        for (let worldY = startY; worldY <= endY; worldY++) {
          // Don't carve at or near surface
          if (worldY >= surfaceY - 4) continue

          // Calculate offset from chamber center
          const dx = worldX - centerX
          const dy = worldY - centerY
          const dz = worldZ - centerZ

          // Apply 2D rotation in XZ plane for elongated chambers
          const rotatedX = dx * cosAngle - dz * sinAngle
          const rotatedZ = dx * sinAngle + dz * cosAngle

          // Calculate normalized distance in rotated space
          const normalizedDist = Math.sqrt(
            (rotatedX / radiusX) * (rotatedX / radiusX) +
            (dy / radiusY) * (dy / radiusY) +
            (rotatedZ / radiusZ) * (rotatedZ / radiusZ)
          )

          // Multi-octave noise for organic blob shape
          const noise1 = this.shapeNoise.noise3D(worldX * 0.08, worldY * 0.06, worldZ * 0.08) * 0.25
          const noise2 = this.shapeNoise.noise3D(worldX * 0.15 + 100, worldY * 0.12, worldZ * 0.15) * 0.15
          const noise3 = this.shapeNoise.noise3D(worldX * 0.25 + 200, worldY * 0.2, worldZ * 0.25) * 0.08
          const totalNoise = noise1 + noise2 + noise3

          // Carve if inside perturbed ellipsoid
          if (normalizedDist + totalNoise < 1.0) {
            const currentBlock = chunk.getBlockId(localX, worldY, localZ)
            if (currentBlock !== BlockIds.AIR && currentBlock !== BlockIds.WATER) {
              chunk.setBlockId(localX, worldY, localZ, BlockIds.AIR)
            }
          }
        }
      }
    }
  }

  /**
   * Carve a chamber into a sub-chunk.
   */
  private carveChamberInSubChunk(
    subChunk: ISubChunkData,
    chamber: Chamber,
    chunkWorldX: number,
    chunkWorldZ: number,
    minWorldY: number,
    maxWorldY: number,
    getHeightAt: HeightGetter
  ): void {
    const { centerX, centerY, centerZ, radiusX, radiusY, radiusZ, rotationAngle } = chamber
    const maxRadiusCeil = Math.ceil(Math.max(radiusX, radiusZ) * 1.5) // Extra margin for rotation
    const radiusYCeil = Math.ceil(radiusY * 1.5)

    // Check if chamber could intersect this sub-chunk's Y range
    if (centerY + radiusYCeil < minWorldY || centerY - radiusYCeil > maxWorldY) {
      return
    }

    // Quick XZ bounds check
    if (
      centerX + maxRadiusCeil < chunkWorldX ||
      centerX - maxRadiusCeil >= chunkWorldX + CHUNK_SIZE_X ||
      centerZ + maxRadiusCeil < chunkWorldZ ||
      centerZ - maxRadiusCeil >= chunkWorldZ + CHUNK_SIZE_Z
    ) {
      return
    }

    // Precompute rotation values
    const cosAngle = Math.cos(rotationAngle)
    const sinAngle = Math.sin(rotationAngle)

    // Determine carving bounds (with extra margin for rotation)
    const startX = Math.max(0, Math.floor(centerX - maxRadiusCeil) - chunkWorldX)
    const endX = Math.min(CHUNK_SIZE_X - 1, Math.ceil(centerX + maxRadiusCeil) - chunkWorldX)
    const startZ = Math.max(0, Math.floor(centerZ - maxRadiusCeil) - chunkWorldZ)
    const endZ = Math.min(CHUNK_SIZE_Z - 1, Math.ceil(centerZ + maxRadiusCeil) - chunkWorldZ)
    const startY = Math.max(minWorldY, Math.floor(centerY - radiusYCeil))
    const endY = Math.min(maxWorldY, Math.ceil(centerY + radiusYCeil))

    // Carve the rotated ellipsoid with multi-octave noise perturbation
    for (let localX = startX; localX <= endX; localX++) {
      for (let localZ = startZ; localZ <= endZ; localZ++) {
        const worldX = chunkWorldX + localX
        const worldZ = chunkWorldZ + localZ

        // Get surface height to prevent carving too close to surface
        const surfaceY = getHeightAt(worldX, worldZ)

        for (let worldY = startY; worldY <= endY; worldY++) {
          // Don't carve at or near surface
          if (worldY >= surfaceY - 4) continue

          // Calculate local Y in sub-chunk
          const localY = worldY - minWorldY
          if (localY < 0 || localY >= 64) continue

          // Calculate offset from chamber center
          const dx = worldX - centerX
          const dy = worldY - centerY
          const dz = worldZ - centerZ

          // Apply 2D rotation in XZ plane for elongated chambers
          const rotatedX = dx * cosAngle - dz * sinAngle
          const rotatedZ = dx * sinAngle + dz * cosAngle

          // Calculate normalized distance in rotated space
          const normalizedDist = Math.sqrt(
            (rotatedX / radiusX) * (rotatedX / radiusX) +
            (dy / radiusY) * (dy / radiusY) +
            (rotatedZ / radiusZ) * (rotatedZ / radiusZ)
          )

          // Multi-octave noise for organic blob shape
          const noise1 = this.shapeNoise.noise3D(worldX * 0.08, worldY * 0.06, worldZ * 0.08) * 0.25
          const noise2 = this.shapeNoise.noise3D(worldX * 0.15 + 100, worldY * 0.12, worldZ * 0.15) * 0.15
          const noise3 = this.shapeNoise.noise3D(worldX * 0.25 + 200, worldY * 0.2, worldZ * 0.25) * 0.08
          const totalNoise = noise1 + noise2 + noise3

          // Carve if inside perturbed ellipsoid
          if (normalizedDist + totalNoise < 1.0) {
            const currentBlock = subChunk.getBlockId(localX, localY, localZ)
            if (currentBlock !== BlockIds.AIR && currentBlock !== BlockIds.WATER) {
              subChunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
            }
          }
        }
      }
    }
  }
}
