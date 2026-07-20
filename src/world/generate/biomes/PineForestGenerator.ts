import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { FallenPineLogFeature } from '../features/FallenPineLogFeature.ts'
import { PineStumpFeature } from '../features/PineStumpFeature.ts'
import { BerryBushFeature } from '../features/BerryBushFeature.ts'
import { MorelFeature } from '../features/MorelFeature.ts'
import { BearDenFeature } from '../features/BearDenFeature.ts'
import { AbandonedCabinFeature } from '../features/AbandonedCabinFeature.ts'
import { HuntersCampFeature } from '../features/HuntersCampFeature.ts'
import { DeerEntity } from '../../../entities/animals/deer/index.ts'
import { WolfEntity } from '../../../entities/animals/wolf/index.ts'
import { BearEntity } from '../../../entities/animals/bear/index.ts'
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
import { SNOW_LINE_Y } from './pineForestConstants.ts'

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
      // Rare mossy boulder-pile bear dens
      new BearDenFeature({
        gridSize: 48,
        density: 230, // per-cell chance = density/gridSize² ≈ 0.10 → ~1 den per ~22 chunks
        blockId: BlockIds.MOSSY_STONE,
        altBlockId: BlockIds.STONE,
        altChance: 0.35,
      }),
      // Craggy granite outcrops between the pines
      new CliffFeature({
        frequency: 0.03,
        threshold: 0.3,
        maxHeight: 4,
        block: BlockIds.STONE,
      }),
      // Forest-floor debris: rare fallen logs draped over the terrain
      new FallenPineLogFeature({
        gridSize: 9,
        density: 3.0,
        minLength: 3,
        maxLength: 6,
        blockIdX: BlockIds.FALLEN_PINE_LOG_X,
        blockIdZ: BlockIds.FALLEN_PINE_LOG_Z,
        validGroundBlocks: [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL, BlockIds.SNOWY_GRASS],
      }),
      // Sparse old-growth stumps
      new PineStumpFeature({
        gridSize: 11,
        density: 2.5,
        blockId: BlockIds.PINE_STUMP,
        validGroundBlocks: [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL, BlockIds.SNOWY_GRASS],
      }),
      // Forage: laden berry bushes in grassy clearings (~1 patch per 7 chunks)
      new BerryBushFeature({
        density: 3.0,
        minPatchSize: 2,
        maxPatchSize: 4,
        gridSize: 12,
      }),
      // Forage: morel clusters on podzol needle-litter (podzol-gated, so
      // effectively ~1 cluster per ~15 chunks)
      new MorelFeature({
        density: 3.0,
        minClusterSize: 2,
        maxClusterSize: 4,
        gridSize: 12,
      }),
      // Very rare ruined cabins and hunter's camps (after trees: they clear
      // foliage and knock walls out of already-placed needles).
      // threshold = density/gridSize², cells/chunk = 1024/gridSize²:
      // cabin ≈ 1 per ~165 chunks, camp ≈ 1 per ~60 chunks (before the
      // flat-ground site rejection, which thins both further)
      new AbandonedCabinFeature({ gridSize: 64, density: 100 }),
      new HuntersCampFeature({ gridSize: 48, density: 90 }),
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
        // Snow mountain ranges: low-frequency ridged peaks (~every 600
        // blocks). clampMin 0 with the negative offset means this layer only
        // ADDS height where ridges crest - valleys and water coverage stay
        // identical to the rolling base terrain. Tuned offline against the
        // real noise: heights span ~232..284, ~28% of terrain above the snow
        // line (252), ~8% above 265 (proper peaks), <2% below water (238).
        {
          type: 'ridged',
          octaves: 2,
          persistence: 0.5,
          scale: 0.0015,
          weight: 6.0,
          offset: -0.7,
          clampMin: 0,
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
      {
        entityType: 'deer',
        spawnRate: 0.08,
        maxNearby: 6,
        minLightLevel: 8, // Surface grazer - keep out of caves
        createEntity: (pos: THREE.Vector3) => new DeerEntity({ position: pos }),
      },
      {
        entityType: 'wolf',
        // Night hunters: light ceiling 11 means wolves cannot spawn on the
        // surface TODAY (skylight is a constant 15 with no day/night cycle) -
        // only in dim cave-mouth bands. This is intentional: when the
        // day/night cycle lands, night-time surface light drops below the
        // ceiling and wolf packs come out after dark.
        spawnRate: 0.06,
        maxNearby: 4,
        maxLightLevel: 11,
        minLightLevel: 4, // Floor keeps wolves out of pitch-black cave-slime territory
        createEntity: (pos: THREE.Vector3) => new WolfEntity({ position: pos }),
      },
      {
        entityType: 'bear',
        // Bears live at their dens: the ground check restricts spawns to
        // mossy stone, which only BearDenFeature mounds produce on the pine
        // forest surface. The roll rate is high because the real gate is
        // landing one of the 5 random position probes on a den's ~5x5
        // footprint - net effect is a bear padding around its den within a
        // few minutes of the player being nearby.
        spawnRate: 1.0,
        maxNearby: 2,
        minLightLevel: 6, // Surface/forest floor, not deep caves
        validGroundBlocks: [BlockIds.MOSSY_STONE],
        searchFromSky: true, // den mounds rise above the player's feet
        createEntity: (pos: THREE.Vector3) => new BearEntity({ position: pos }),
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

        // Surface: above the snow line the whole surface is snow-dusted
        // grass; below it, podzol patches where the needle-litter noise runs
        // high, grass elsewhere (offset coordinates decorrelate from terrain
        // noise). See pineForestConstants.ts for the snow-line math: with
        // height = seaLevel(240) + baseHeight(6) + noise(~±1.3) × 14 the
        // surface spans ~228..264, and SNOW_LINE_Y = 252 caps roughly the
        // top third of that range. Everything below the line is unchanged.
        if (surfaceY >= minY && surfaceY <= maxY) {
          const localY = surfaceY - minY
          let surfaceBlock: number
          if (surfaceY >= SNOW_LINE_Y) {
            surfaceBlock = BlockIds.SNOWY_GRASS
          } else {
            const podzolNoise = noise.noise2D(worldX * 0.045 + 3000, worldZ * 0.045 + 3000)
            surfaceBlock = podzolNoise > 0.2 ? BlockIds.PODZOL : BlockIds.GRASS
          }
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
