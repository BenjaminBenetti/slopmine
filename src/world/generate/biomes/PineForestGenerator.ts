import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { HerbFeature } from '../features/HerbFeature.ts'
import { FlowerPatchFeature } from '../features/FlowerPatchFeature.ts'
import { PineTreeFeature } from '../features/PineTreeFeature.ts'
import { FoxEntity } from '../../../entities/animals/fox/index.ts'
import { RabbitEntity } from '../../../entities/animals/rabbit/index.ts'
import { CaveSlimeEntity } from '../../../entities/animals/cave_slime/index.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Classic evergreen forest: rolling terrain densely covered in conical pine
 * trees over a floor of grass broken by wide patches of needle-littered podzol.
 */
export class PineForestGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'pine-forest',
    frequency: 0.9,
    treeDensity: 6.0,
    features: [
      // Same ore distribution as the other surface biomes
      new OreFeature({
        blockId: BlockIds.COAL_BLOCK,
        frequency: 20,
        veinSize: 12,
        minY: 156,
        maxY: 256,
        peakY: 214,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE],
      }),
      new OreFeature({
        blockId: BlockIds.IRON_BLOCK,
        frequency: 12,
        veinSize: 8,
        minY: 156,
        maxY: 220,
        peakY: 188,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE],
      }),
      new OreFeature({
        blockId: BlockIds.COPPER_BLOCK,
        frequency: 10,
        veinSize: 10,
        minY: 156,
        maxY: 236,
        peakY: 204,
        ySpread: 20,
        replaceableBlocks: [BlockIds.STONE],
      }),
      new OreFeature({
        blockId: BlockIds.GOLD_BLOCK,
        frequency: 4,
        veinSize: 6,
        minY: 156,
        maxY: 188,
        peakY: 168,
        ySpread: 8,
        replaceableBlocks: [BlockIds.STONE],
      }),
      new OreFeature({
        blockId: BlockIds.DIAMOND_BLOCK,
        frequency: 2,
        veinSize: 4,
        minY: 156,
        maxY: 172,
        peakY: 164,
        ySpread: 4,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // The forest itself: dense conical pines
      new PineTreeFeature({
        gridSize: 5,
        density: 5.5,
        minTrunkHeight: 7,
        maxTrunkHeight: 13,
        logBlockId: BlockIds.PINE_LOG,
        leafBlockId: BlockIds.PINE_NEEDLES,
        validGroundBlocks: [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL],
      }),
      // Sparse forest-floor herbs
      new HerbFeature({
        density: 1.5,
        minPatchSize: 2,
        maxPatchSize: 3,
        gridSize: 16,
      }),
      // Occasional wildflowers in clearings
      new FlowerPatchFeature({
        density: 1.0,
        minPatchSize: 2,
        maxPatchSize: 4,
        gridSize: 16,
        flowerBlockIds: [BlockIds.YELLOW_FLOWER, BlockIds.RED_FLOWER],
      }),
    ],
    caves: {
      enabled: true,
      minY: 146,                  // just above the terrain stone floor (140)
      maxY: 320,                  // above max terrain so entrances can breach
      floorFadeDepth: 10,
      surfaceFalloffDepth: 18,
      // Balanced caverns - same baseline feel as plains
      cheese: { enabled: true, threshold: 0.42, scale: 0.012, verticalScale: 1.5 },
      spaghetti: { enabled: true, thickness: 0.08, thicknessVariance: 0.6, scale: 0.012, verticalSquash: 1.5 },
      ravine: { enabled: true, scale: 0.003, width: 0.03, depth: 50, taper: 0.75, density: 0.3 },
      entrance: { enabled: true, scale: 0.012, threshold: 0.8, boost: 0.55, depth: 50 },
      floodLevel: 152,            // deep caves flood with lava
      floodBlockId: BlockIds.LAVA,
      liquidSurfaceGuardY: 240,   // waterLevel 238 + 2: guards entrance mouths, pipes, and (partially) ravines under pools and shores
    },
    water: {
      enabled: true,
      liquidBlock: BlockIds.WATER,
      waterLevel: 238,        // Same water level as plains for consistency
      frequency: 0.2,
      minDepth: 2,
      sandBlock: BlockIds.SAND,
      sandDepth: 3,
      shoreRadius: 1,
    },
    terrainConfig: {
      layers: [
        {
          type: 'fractal',
          octaves: 4,
          persistence: 0.5,
          scale: 0.008,
          weight: 1.0,
        },
        {
          type: 'fractal',
          octaves: 2,
          persistence: 0.55,
          scale: 0.02,
          weight: 0.3,
        },
      ],
      baseHeight: 6,
      heightScale: 14,
      combineMode: 'add',
    } as TerrainConfig,
    skybox: {
      brightness: 0.95,
      tint: { r: 0.9, g: 0.95, b: 1.0 },  // crisp, slightly cool mountain air
    },
    entitySpawns: [
      {
        entityType: 'fox',
        spawnRate: 0.06,
        maxNearby: 8,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new FoxEntity({ position: pos }),
      },
      {
        entityType: 'rabbit',
        spawnRate: 0.15,
        maxNearby: 12,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new RabbitEntity({ position: pos }),
      },
      {
        entityType: 'cave_slime',
        spawnRate: 0.15,
        maxNearby: 8,
        maxLightLevel: 7, // Only spawn in dark areas
        createEntity: (pos: THREE.Vector3) => new CaveSlimeEntity({ position: pos }),
      },
    ],
  }

  /**
   * Fill terrain: grass surface broken by noise-driven podzol patches under
   * the pines, then dirt and stone layers.
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const coord = chunk.coordinate
    const terrainFloor = this.config.seaLevel - this.config.terrainThickness

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const height = getHeightAt(worldX, worldZ)

        // Calculate layer boundaries (world Y)
        const surfaceY = height
        const dirtStartY = height - 1
        const dirtEndY = height - 4  // 4 blocks of dirt
        const stoneStartY = dirtEndY - 1
        const stoneEndY = terrainFloor

        // Surface: podzol patches where the needle-litter noise runs high,
        // grass elsewhere (offset coordinates decorrelate from terrain noise)
        if (surfaceY >= minY && surfaceY <= maxY) {
          const localY = surfaceY - minY
          const podzolNoise = noise.noise2D(worldX * 0.045 + 3000, worldZ * 0.045 + 3000)
          const surfaceBlock = podzolNoise > 0.2 ? BlockIds.PODZOL : BlockIds.GRASS
          chunk.setBlockId(localX, localY, localZ, surfaceBlock)
        }

        // Subsurface: dirt (only blocks within Y range)
        for (let worldY = Math.min(dirtStartY, maxY); worldY >= Math.max(dirtEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.DIRT)
          }
        }

        // Base: stone (only blocks within Y range)
        for (let worldY = Math.min(stoneStartY, maxY); worldY >= Math.max(stoneEndY, minY); worldY--) {
          const localY = worldY - minY
          chunk.setBlockId(localX, localY, localZ, BlockIds.STONE)
        }
      }
    }
  }
}
