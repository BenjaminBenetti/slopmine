import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { CrabEntity } from '../../../entities/animals/crab/index.ts'
import { SeaStarEntity } from '../../../entities/animals/sea_star/index.ts'
import { SeaShellEntity } from '../../../entities/animals/sea_shell/index.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { coastalRainforestGroundCover } from '../features/natureGroundCover.ts'
import { overworldMineshafts } from '../features/overworldMineshafts.ts'
import { seaPlants } from '../features/waterPlants.ts'
import { WATER_SURFACE_Y } from '../water/Hydrology.ts'

/** Seabed patches: gravel beds and clay flats in the sand (noise thresholds). */
const SEABED_SCALE = 0.035
const GRAVEL_THRESHOLD = 0.42
const CLAY_THRESHOLD = 0.5

/**
 * The open sea. Not picked by the regions' weighted roll like the other
 * surface biomes: a region whose centre lies far out at sea (Hydrology's
 * continent field below OCEAN_REGION_CONTINENT - BiomeRegistry) is ocean, so
 * the biome map of every other region stays as it was. Hydrology itself
 * sinks the land into the sea floor (in this biome and in the coastal waters
 * of the land biomes around it alike); this biome gives the deep its own
 * seabed (sand, gravel beds, clay flats), its islands sandy shores and the
 * weather, sounds and life of the open sea.
 */
export class OceanGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'ocean',
    frequency: 0,
    treeDensity: 0,
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
      // The sea's plants: kelp forests and seagrass meadows on the shelf
      seaPlants(),
      overworldMineshafts(),
      // Island shores: grass, flowers and shells on the open ground (last)
      coastalRainforestGroundCover(),
    ],
    caves: {
      enabled: true,
      minY: 146,
      maxY: 320,
      floorFadeDepth: 10,
      surfaceFalloffDepth: 18,
      cheese: { enabled: true, threshold: 0.44, scale: 0.012, verticalScale: 1.5 },
      spaghetti: { enabled: true, thickness: 0.08, thicknessVariance: 0.6, scale: 0.012, verticalSquash: 1.5 },
      // No ravine may cut the sea floor open (it would drain the sea into the caves)
      ravine: { enabled: true, scale: 0.003, width: 0.03, depth: 50, taper: 0.75, density: 0.3, poolCrossDensity: 0 },
      entrance: { enabled: true, scale: 0.012, threshold: 0.8, boost: 0.55, depth: 50 },
      floodLevel: 152,
      floodBlockId: BlockIds.LAVA,
      liquidSurfaceGuardY: WATER_SURFACE_Y + 2,
    },
    water: {
      enabled: true,
      liquidBlock: BlockIds.WATER,
      waterLevel: WATER_SURFACE_Y,
      frequency: 1,
      minDepth: 1,
      // The seabed is laid by fillChunk (sand with gravel beds and clay flats)
      sandDepth: 3,
      shoreRadius: 2,
    },
    terrainConfig: {
      // The land under the sea and its islands: gentle swells (Hydrology lays the sea floor over it)
      layers: [
        { type: 'fractal', octaves: 4, persistence: 0.5, scale: 0.006, weight: 1.0 },
        { type: 'fractal', octaves: 3, persistence: 0.5, scale: 0.02, weight: 0.3 },
      ],
      baseHeight: 1,
      heightScale: 11,
      combineMode: 'add',
    } as TerrainConfig,
    skybox: {
      tint: { r: 0.9, g: 0.96, b: 1.04 }, // open sky, a little bluer over the water
      fogColor: { r: 0.78, g: 0.87, b: 0.96 }, // salt haze
      fogDensity: 1.1,
      lightTint: { r: 1.0, g: 1.0, b: 1.02 },
      clouds: { coverage: 0.38 },
    },
    entitySpawns: [
      // Beach life on the islands' sand
      {
        entityType: 'crab',
        spawnRate: 0.1,
        maxNearby: 6,
        minLightLevel: 8,
        validGroundBlocks: [BlockIds.SAND],
        createEntity: (pos: THREE.Vector3) => new CrabEntity({ position: pos }),
      },
      {
        entityType: 'sea_star',
        spawnRate: 0.06,
        maxNearby: 4,
        minLightLevel: 8,
        validGroundBlocks: [BlockIds.SAND],
        createEntity: (pos: THREE.Vector3) => new SeaStarEntity({ position: pos }),
      },
      {
        entityType: 'sea_shell',
        spawnRate: 0.08,
        maxNearby: 8,
        minLightLevel: 8,
        validGroundBlocks: [BlockIds.SAND],
        createEntity: (pos: THREE.Vector3) => new SeaShellEntity({ position: pos }),
      },
    ],
  }

  /**
   * Fill terrain: the seabed (sand, gravel beds, clay flats) under the
   * water, sandy shores at the waterline, grass on the islands, then sand or
   * dirt and stone layers.
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
        const underwater = height < WATER_SURFACE_Y
        const shore = !underwater && height <= WATER_SURFACE_Y + 2

        let surfaceBlock: number = BlockIds.GRASS
        let subsurfaceBlock: number = BlockIds.DIRT
        if (underwater) {
          const bed = noise.noise2D(worldX * SEABED_SCALE + 4100, worldZ * SEABED_SCALE - 2300)
          const flat = noise.noise2D(worldX * SEABED_SCALE * 0.7 - 900, worldZ * SEABED_SCALE * 0.7 + 1700)
          surfaceBlock = bed > GRAVEL_THRESHOLD ? BlockIds.GRAVEL : flat > CLAY_THRESHOLD ? BlockIds.CLAY : BlockIds.SAND
          subsurfaceBlock = surfaceBlock === BlockIds.GRAVEL ? BlockIds.GRAVEL : BlockIds.SAND
        } else if (shore) {
          surfaceBlock = BlockIds.SAND
          subsurfaceBlock = BlockIds.SAND
        }

        if (height >= minY && height <= maxY) chunk.setBlockId(localX, height - minY, localZ, surfaceBlock)
        // Three blocks of sand or dirt, then stone
        for (let worldY = Math.min(height - 1, maxY); worldY >= Math.max(height - 3, minY); worldY--) {
          if (worldY >= terrainFloor) chunk.setBlockId(localX, worldY - minY, localZ, subsurfaceBlock)
        }
        for (let worldY = Math.min(height - 4, maxY); worldY >= Math.max(terrainFloor, minY); worldY--) {
          chunk.setBlockId(localX, worldY - minY, localZ, BlockIds.STONE)
        }
      }
    }
  }
}
