import type { CaveSettings } from '../BiomeGenerator.ts'
import type { BlockId } from '../../interfaces/IBlock.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { CavePredictionService } from './CavePredictionService.ts'

/**
 * Height getter function type.
 */
export type HeightGetter = (worldX: number, worldZ: number) => number

/**
 * Function to set a block at world coordinates.
 */
export type WorldBlockSetter = (worldX: number, worldY: number, worldZ: number, blockId: BlockId) => void

/**
 * Specification for an entrance location.
 */
export interface EntranceLocation {
  worldX: number
  worldZ: number
  surfaceY: number
  caveY: number
  direction: { dx: number; dz: number }
  width: number
}

/**
 * Generates cave entrances using noise-based prediction.
 * Instead of searching for existing air blocks, predicts where caves will be
 * using the same noise functions that generate them.
 */
export class EntranceGenerator {
  private readonly locationNoise: SimplexNoise
  private readonly cavePrediction: CavePredictionService

  constructor(seed: number) {
    this.locationNoise = new SimplexNoise(seed + 2000)
    this.cavePrediction = new CavePredictionService(seed)
  }

  /**
   * Find all entrance locations for a chunk column.
   * Returns entrance specs that can be carved independently of chunk generation state.
   */
  findEntranceLocations(
    chunkX: bigint,
    chunkZ: bigint,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): EntranceLocation[] {
    const entrances: EntranceLocation[] = []
    const gridSize = 16
    const entranceFrequency = 0.01
    const entranceThreshold = settings.entranceThreshold ?? 0.7

    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldX = Number(chunkX) * CHUNK_SIZE_X + localX
        const worldZ = Number(chunkZ) * CHUNK_SIZE_Z + localZ

        // Deterministic location selection using noise
        const entranceNoise = this.locationNoise.noise2D(
          worldX * entranceFrequency,
          worldZ * entranceFrequency
        )

        if (entranceNoise < entranceThreshold) {
          continue
        }

        // Find best entrance point using prediction (not block search!)
        const entrance = this.findBestEntrancePoint(
          worldX,
          worldZ,
          8, // search radius
          settings,
          getHeightAt
        )

        if (entrance) {
          entrances.push(entrance)
        }
      }
    }

    return entrances
  }

  /**
   * Search for best entrance point using noise prediction.
   * Finds a location where a cave is guaranteed to exist.
   */
  private findBestEntrancePoint(
    centerX: number,
    centerZ: number,
    searchRadius: number,
    settings: CaveSettings,
    getHeightAt: HeightGetter
  ): EntranceLocation | null {
    let bestCaveY = -1
    let bestWorldX = centerX
    let bestWorldZ = centerZ
    let bestSurfaceY = 0

    // Search in a grid pattern for efficiency
    for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
      for (let dz = -searchRadius; dz <= searchRadius; dz += 2) {
        const checkX = centerX + dx
        const checkZ = centerZ + dz
        const surfaceY = getHeightAt(checkX, checkZ)

        // Use prediction to find caves - no block access needed!
        const caveY = this.cavePrediction.findCaveBelow(
          checkX,
          checkZ,
          Math.min(settings.maxY, surfaceY - 1),
          settings
        )

        // Prefer caves closer to surface (shorter entrance tunnel)
        if (caveY !== null && caveY > bestCaveY) {
          const radius = Math.max(2, Math.floor(settings.entranceMinWidth / 2))

          // Verify this is a substantial cave, not just a single block
          if (this.cavePrediction.verifyCaveVolume(checkX, caveY, checkZ, settings, radius)) {
            bestCaveY = caveY
            bestWorldX = checkX
            bestWorldZ = checkZ
            bestSurfaceY = surfaceY
          }
        }
      }
    }

    if (bestCaveY === -1) {
      return null
    }

    // Calculate entrance direction deterministically
    const dirSeed = (bestWorldX * 73856093) ^ (bestWorldZ * 19349663)
    const angle = (dirSeed % 360) * (Math.PI / 180)

    return {
      worldX: bestWorldX,
      worldZ: bestWorldZ,
      surfaceY: bestSurfaceY,
      caveY: bestCaveY,
      direction: { dx: Math.cos(angle), dz: Math.sin(angle) },
      width: settings.entranceMinWidth,
    }
  }

  /**
   * Carve an entrance from surface down to the predicted cave.
   * Creates a walkable sloped tunnel.
   */
  carveEntrance(entrance: EntranceLocation, worldBlockSetter: WorldBlockSetter): void {
    const radius = Math.max(2, Math.floor(entrance.width / 2))
    const slopeRatio = 2.0 // Move 2 blocks horizontally per 1 block down

    let currentX = entrance.worldX
    let currentZ = entrance.worldZ

    // Carve from surface down to cave
    for (let y = entrance.surfaceY; y >= entrance.caveY; y--) {
      // Carve 3-block-tall cross section for walking
      for (let dy = 0; dy < 3; dy++) {
        const carveY = y + dy
        if (carveY > entrance.surfaceY) continue

        // Carve circular tunnel cross-section
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx * dx + dz * dz > radius * radius) continue

            const worldX = Math.floor(currentX) + dx
            const worldZ = Math.floor(currentZ) + dz

            worldBlockSetter(worldX, carveY, worldZ, BlockIds.AIR)
          }
        }
      }

      // Move horizontally as we descend (creates gentle slope)
      currentX += entrance.direction.dx * slopeRatio
      currentZ += entrance.direction.dz * slopeRatio
    }
  }
}
