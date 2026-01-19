import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { LAYER_BOUNDARY_Y } from '../GenerationConfig.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Rocky underground biome - a solid stone layer beneath the surface.
 * This biome generates in Layer 0 (Y=0-127) and fills with stone,
 * with caves carved through for exploration.
 */
// Height of the magma floor for testing
const FLOOR_HEIGHT = 16

export class RockyGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'rocky',
    frequency: 1.0, // Only layer 0 biome for now, so 100% of underground
    treeDensity: 0, // No trees underground
    layer: 0, // Underground layer
    features: [
      // Future: Add deep ores, crystals, special underground features
    ],
    caves: {
      enabled: false, // Disabled for testing - thin floor
      frequency: 0.004,
      threshold: 0.008,
      minY: 0,
      maxY: FLOOR_HEIGHT,
      layerCount: 1,
      layerSpacing: 8,
      layerPeakY: 8,
      cheeseEnabled: false,
      cheeseFrequency: 0.003,
      cheeseThreshold: 0.85,
      entrancesEnabled: false, // No surface entrances - we're underground
      entranceMinWidth: 0,
    },
    skylightValue: 0, // No skylight underground - completely dark
    terrainConfig: {
      layers: [], // No noise layers - just fill solid
      baseHeight: 0,
      heightScale: 0,
      combineMode: 'add',
    } as TerrainConfig,
  }

  /**
   * Get terrain height for the underground layer.
   * Returns the floor height since we only fill a thin layer at the bottom.
   */
  override getHeightAt(_worldX: number, _worldZ: number): number {
    return FLOOR_HEIGHT - 1 // 15 - magma floor height
  }

  /**
   * Fill the underground layer with magma blocks near the bottom.
   * Creates a floor at Y=0-15 with an air gap above for testing visibility.
   *
   * @param chunk The chunk data to fill
   * @param minY Minimum world Y coordinate of this sub-chunk
   * @param maxY Maximum world Y coordinate of this sub-chunk
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    maxY: number,
    _noise: SimplexNoise,
    _getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
          const worldY = minY + localY

          // Only fill Y=0 to FLOOR_HEIGHT-1 with magma blocks
          if (worldY >= 0 && worldY < FLOOR_HEIGHT) {
            chunk.setBlockId(localX, localY, localZ, BlockIds.MAGMA)
          }
        }
      }
    }
  }
}
