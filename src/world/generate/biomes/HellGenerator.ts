import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { HellPillarFeature } from '../features/HellPillarFeature.ts'
import { MagmaSlimeEntity } from '../../../entities/animals/magma_slime/index.ts'
import { SkeletonEntity } from '../../../entities/enemies/skeleton/index.ts'
import { EmberRoachEntity } from '../../../entities/enemies/ember_roach/index.ts'

/**
 * Hell biome - the first true underground biome.
 *
 * Structure (Layer 0: Y=0-127):
 * - Y=0-63: Hell Rock terrain with noise-based surface around Y=48-58
 * - Y=64-127: Air gap with massive pillars reaching up to Y=127
 *
 * Features:
 * - Hell Rock terrain with fractal noise
 * - Lava pools in terrain depressions
 * - Massive pillars shooting up through the air gap
 * - Complete darkness (no skylight)
 */
export class HellGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'hell',
    frequency: 1.0, // Only layer 0 biome, so 100% of underground
    treeDensity: 0, // No trees underground
    layer: 0, // Underground layer (Y=0-127)
    skylightValue: 0, // Complete darkness
    features: [
      // Massive pillars in the air gap
      new HellPillarFeature({
        gridSize: 20,
        density: 0.15,
        minRadius: 2,
        maxRadius: 5,
        targetTopY: 127,
      }),
    ],
    // No caves in Hell - the layer itself is one giant cavern
    caves: undefined,
    // Lava fills all terrain depressions below waterLevel
    water: {
      enabled: true,
      liquidBlock: BlockIds.LAVA,
      waterLevel: 46,
      frequency: 0,
      minDepth: 0,
    },
    terrainConfig: {
      layers: [
        {
          type: 'fractal',
          octaves: 3,
          persistence: 0.5,
          scale: 0.02,
          weight: 1.0,
        },
      ],
      baseHeight: 48,      // Actual world Y coordinate
      heightScale: 10,
      combineMode: 'add',
      absoluteHeight: true, // Skip seaLevel for underground biome
    } as TerrainConfig,
    // Magma slimes and skeletons spawn in Hell
    entitySpawns: [
      {
        entityType: 'magma_slime',
        spawnRate: 0.25, // Fairly common in Hell
        minY: 48, // On the Hell terrain surface
        maxY: 120, // Up through the air gap (below ceiling)
        maxNearby: 10,
        createEntity: (pos: THREE.Vector3) => new MagmaSlimeEntity({ position: pos }),
      },
      {
        entityType: 'skeleton',
        spawnRate: 0.12, // Less common than magma slimes
        minY: 48, // On the Hell terrain surface
        maxY: 120, // Up through the air gap (below ceiling)
        maxNearby: 5,
        createEntity: (pos: THREE.Vector3) => new SkeletonEntity({ position: pos }),
      },
      {
        entityType: 'ember_roach',
        spawnRate: 0.18, // Flying cockroaches around pillars
        minY: 48, // In the air gap above terrain
        maxY: 120, // Below ceiling
        maxNearby: 6,
        createEntity: (pos: THREE.Vector3) => new EmberRoachEntity({ position: pos }),
      },
    ],
  }

  /**
   * Fill the Hell terrain with Hell Rock from Y=0 up to the noise-based surface.
   * The area above the surface (up to Y=127) is left as air for pillars to fill.
   *
   * @param chunk The chunk data to fill
   * @param minY Minimum world Y coordinate of this sub-chunk
   * @param maxY Maximum world Y coordinate of this sub-chunk
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    _maxY: number,
    _noise: SimplexNoise,
    _getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const coord = chunk.coordinate

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Get surface height at this position
        const surfaceHeight = this.getHeightAt(worldX, worldZ)

        // Fill from minY to surfaceHeight with Hell Rock
        for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
          const worldY = minY + localY

          // Only fill below or at surface level
          if (worldY <= surfaceHeight) {
            chunk.setBlockId(localX, localY, localZ, BlockIds.HELL_ROCK)
          }
          // Above surface is air (default, no need to set)
        }
      }
    }
  }
}
