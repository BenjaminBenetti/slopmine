import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Settings for cattail (water-edge reed) generation.
 */
export interface CattailFeatureSettings {
  /** Water level Y coordinate */
  readonly waterLevel: number
  /** Maximum height above water level a shore block may sit and still grow reeds */
  readonly maxHeightAboveWater: number
  /** Large-scale noise frequency for reedy zones (stretches of bank with reeds) */
  readonly zoneFrequency: number
  /** Zone noise threshold (0-1, lower = more of the bank is reedy) */
  readonly zoneThreshold: number
  /** Per-block placement chance within a reedy zone (0-1) */
  readonly density: number
  /** Valid ground blocks for cattail placement (defaults to grass/dirt/mud/clay) */
  readonly validGroundBlocks?: number[]
}

const DEFAULT_GROUND_BLOCKS = [BlockIds.GRASS, BlockIds.DIRT, BlockIds.MUD, BlockIds.CLAY]

/**
 * Cattail feature that places tall reed plants on shore blocks bordering water.
 * Zone noise groups the reeds into natural stretches of overgrown bank rather
 * than a uniform fringe around every pool.
 */
export class CattailFeature extends Feature {
  readonly settings: CattailFeatureSettings

  constructor(settings: CattailFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, noise } = context
    const { waterLevel, maxHeightAboveWater, zoneFrequency, zoneThreshold, density } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Cattails only ever sit within a couple of blocks of the water line
    const potentialMinY = waterLevel - 2
    const potentialMaxY = waterLevel + maxHeightAboveWater + 1
    if (potentialMaxY < subChunkMinY || potentialMinY > subChunkMaxY) return

    const validBlocks = this.settings.validGroundBlocks ?? DEFAULT_GROUND_BLOCKS

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Skip columns that are open water at the water line - reeds grow on the bank
        const waterLocalY = waterLevel - subChunkMinY
        if (waterLocalY >= 0 && waterLocalY < SUB_CHUNK_HEIGHT) {
          if (chunk.getBlockId(localX, waterLocalY, localZ) === BlockIds.WATER) continue
        }

        // Only shore columns: some directly adjacent column must hold water
        if (!this.hasAdjacentWater(chunk, localX, localZ, waterLevel, subChunkMinY)) continue

        // Large-scale zone noise groups reeds into overgrown stretches of bank
        const zoneNoise = (noise.noise2D((worldX + 2000) * zoneFrequency, (worldZ + 2000) * zoneFrequency) + 1) * 0.5
        if (zoneNoise < zoneThreshold) continue

        // Per-block density within a reedy zone
        if (this.positionHash(worldX, worldZ) > density) continue

        // Find the shore surface block near the water line
        let surfaceY = -1
        const searchStartY = Math.min(waterLevel + maxHeightAboveWater, subChunkMaxY)
        const searchEndY = Math.max(waterLevel - 1, subChunkMinY)

        for (let worldY = searchStartY; worldY >= searchEndY; worldY--) {
          const localY = worldY - subChunkMinY
          if (localY < 0 || localY >= SUB_CHUNK_HEIGHT) continue

          const block = chunk.getBlockId(localX, localY, localZ)
          if (validBlocks.includes(block)) {
            surfaceY = worldY
            break
          }
          // Anything solid but invalid (stone, sand, logs) ends the search - no
          // reeds on it, and nothing valid can be the surface beneath it
          if (block !== BlockIds.AIR && block !== BlockIds.WATER) break
        }

        if (surfaceY === -1) continue

        // Place the 2-block cattail in the air above the shore surface -
        // both halves must fit in this sub-chunk and be air
        const plantY = surfaceY + 1
        const bottomLocalY = plantY - subChunkMinY
        const topLocalY = bottomLocalY + 1
        if (bottomLocalY < 0 || topLocalY >= SUB_CHUNK_HEIGHT) continue

        if (
          chunk.getBlockId(localX, bottomLocalY, localZ) === BlockIds.AIR &&
          chunk.getBlockId(localX, topLocalY, localZ) === BlockIds.AIR
        ) {
          chunk.setBlockId(localX, bottomLocalY, localZ, BlockIds.CATTAIL)
          chunk.setBlockId(localX, topLocalY, localZ, BlockIds.CATTAIL_TOP)
        }
      }
    }
  }

  /**
   * Check if any adjacent column has water at the water level.
   */
  private hasAdjacentWater(
    chunk: { getBlockId: (x: number, y: number, z: number) => number },
    localX: number,
    localZ: number,
    waterLevel: number,
    subChunkMinY: number
  ): boolean {
    const waterLocalY = waterLevel - subChunkMinY
    if (waterLocalY < 0 || waterLocalY >= SUB_CHUNK_HEIGHT) return false

    const offsets = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1],
    ]

    for (const [dx, dz] of offsets) {
      const nx = localX + dx
      const nz = localZ + dz
      if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) continue

      if (chunk.getBlockId(nx, waterLocalY, nz) === BlockIds.WATER) {
        return true
      }
    }

    return false
  }

  /**
   * Deterministic hash based on position for consistent randomness.
   */
  private positionHash(x: number, z: number): number {
    const n = Math.sin(x * 41.5261 + z * 23.6179) * 74183.2431
    return n - Math.floor(n)
  }
}
