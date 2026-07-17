import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { JungleFernFeature } from '../features/JungleFernFeature.ts'
import { PineTreeFeature } from '../features/PineTreeFeature.ts'
import { GiantConiferFeature } from '../features/GiantConiferFeature.ts'
import { BoulderFeature } from '../features/BoulderFeature.ts'
import { TallFernFeature } from '../features/TallFernFeature.ts'
import { FoxEntity } from '../../../entities/animals/fox/index.ts'
import { RabbitEntity } from '../../../entities/animals/rabbit/index.ts'
import { CaveSlimeEntity } from '../../../entities/animals/cave_slime/index.ts'
import { CrabEntity } from '../../../entities/animals/crab/index.ts'
import { SeaStarEntity } from '../../../entities/animals/sea_star/index.ts'
import { SeaShellEntity } from '../../../entities/animals/sea_shell/index.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'

/** Water surface Y for this biome; kept at 238 to match the other surface biomes. */
const WATER_LEVEL = 238

/**
 * Rock outcropping noise field: where it runs high, stone shoulders push
 * through the forest floor. The core is bare mossy stone/stone with stone
 * directly beneath; a moss halo rings each outcrop. BoulderFeature is gated
 * by the same field so loose boulders cluster around the outcrops.
 */
const OUTCROP_NOISE_SCALE = 0.02
const OUTCROP_NOISE_OFFSET = 7000
const OUTCROP_CORE_THRESHOLD = 0.62
const OUTCROP_HALO_THRESHOLD = 0.42

/**
 * Pacific-northwest-style coastal temperate rain forest: low terrain broken by
 * bays and inlets, a mossy forest floor thick with ferns, and towering
 * redwood conifers over a scattered pine understory. Misty, dim, and wet.
 */
export class CoastalRainforestGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'coastal-rainforest',
    frequency: 0.7,
    treeDensity: 5.0,
    skylightValue: 13,  // overcast coastal gloom under the canopy
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
      // The defining giants: towering redwoods, roughly 1-2 per chunk on land
      new GiantConiferFeature({
        gridSize: 12,
        density: 30,
        minTrunkHeight: 18,
        maxTrunkHeight: 28,
        baseTrunkRadius: 2,
        canopyStartFraction: 0.4,
        maxCanopyRadius: 4,
        logBlockId: BlockIds.REDWOOD_LOG,
        leafBlockId: BlockIds.REDWOOD_LEAVES,
        validGroundBlocks: [BlockIds.GRASS, BlockIds.DIRT, BlockIds.MOSS],
      }),
      // Sparse understory of young pines beneath the giants
      new PineTreeFeature({
        gridSize: 7,
        density: 3.0,
        minTrunkHeight: 5,
        maxTrunkHeight: 9,
        logBlockId: BlockIds.PINE_LOG,
        leafBlockId: BlockIds.PINE_NEEDLES,
        validGroundBlocks: [BlockIds.GRASS, BlockIds.DIRT, BlockIds.MOSS],
      }),
      // Mossy boulders clustered around the rock outcroppings, plus
      // surf-worn rocks poking out of beaches and shallow bays
      new BoulderFeature({
        gridSize: 8,
        density: 16.0,
        minRadius: 1,
        maxRadius: 2,
        blockId: BlockIds.MOSSY_STONE,
        altBlockId: BlockIds.STONE,
        altChance: 0.3,
        maxWaterDepth: 4,
        clusterNoiseScale: OUTCROP_NOISE_SCALE,
        clusterNoiseOffset: OUTCROP_NOISE_OFFSET,
        clusterThreshold: OUTCROP_HALO_THRESHOLD,
        shoreExempt: true,
      }),
      // Big walk-through sword ferns dominating the understory
      new TallFernFeature({
        density: 10.0,
        gridSize: 6,
        minPatchSize: 3,
        maxPatchSize: 6,
        patchRadius: 3,
        bottomBlockId: BlockIds.COASTAL_FERN,
        topBlockId: BlockIds.COASTAL_FERN_TOP,
      }),
      // Small ground ferns as sparse accents between the big ones
      new JungleFernFeature({
        density: 6.0,
        gridSize: 6,
        minPatchSize: 3,
        maxPatchSize: 6,
        patchRadius: 3,
        validGroundBlocks: [BlockIds.GRASS, BlockIds.MOSS],
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
      waterLevel: WATER_LEVEL,  // Same water level as plains for consistency
      frequency: 0.35,
      minDepth: 2,
      sandBlock: BlockIds.SAND,
      sandDepth: 3,
      shoreRadius: 2,
    },
    terrainConfig: {
      layers: [
        {
          // Broad low-frequency swells: wide bays and forested rises
          type: 'fractal',
          octaves: 3,
          persistence: 0.45,
          scale: 0.004,
          weight: 1.0,
        },
        {
          // Local detail so shorelines stay ragged
          type: 'fractal',
          octaves: 3,
          persistence: 0.5,
          scale: 0.018,
          weight: 0.35,
        },
      ],
      baseHeight: 2,    // still dips wide areas below water level to form inlets
      heightScale: 12,
      combineMode: 'add',
    } as TerrainConfig,
    skybox: {
      brightness: 0.82,
      tint: { r: 0.82, g: 0.9, b: 0.92 },  // coastal mist
    },
    entitySpawns: [
      {
        entityType: 'fox',
        spawnRate: 0.05,
        maxNearby: 8,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new FoxEntity({ position: pos }),
      },
      {
        entityType: 'rabbit',
        spawnRate: 0.1,
        maxNearby: 10,
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
      // Beach life: only spawns on the sand along the shoreline
      {
        entityType: 'crab',
        spawnRate: 0.08,
        maxNearby: 6,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        validGroundBlocks: [BlockIds.SAND],
        createEntity: (pos: THREE.Vector3) => new CrabEntity({ position: pos }),
      },
      {
        entityType: 'sea_star',
        spawnRate: 0.05,
        maxNearby: 4,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        validGroundBlocks: [BlockIds.SAND],
        createEntity: (pos: THREE.Vector3) => new SeaStarEntity({ position: pos }),
      },
      {
        entityType: 'sea_shell',
        spawnRate: 0.08,
        maxNearby: 8,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        validGroundBlocks: [BlockIds.SAND],
        createEntity: (pos: THREE.Vector3) => new SeaShellEntity({ position: pos }),
      },
    ],
  }

  /**
   * Fill terrain: sandy beaches at and below the shoreline, mossy forest
   * floor (with grassy breaks) above it, then dirt and stone layers.
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
        const isBeach = height <= WATER_LEVEL + 1

        // Rock outcroppings: core = stone at the surface, ring = moss halo
        const outcropNoise = noise.noise2D(
          worldX * OUTCROP_NOISE_SCALE + OUTCROP_NOISE_OFFSET,
          worldZ * OUTCROP_NOISE_SCALE + OUTCROP_NOISE_OFFSET
        )
        const isOutcropCore = !isBeach && outcropNoise > OUTCROP_CORE_THRESHOLD
        const isMossHalo = !isBeach && !isOutcropCore && outcropNoise > OUTCROP_HALO_THRESHOLD

        // Calculate layer boundaries (world Y)
        const surfaceY = height
        const dirtStartY = height - 1
        const dirtEndY = height - 4  // 4 blocks of dirt (or sand/stone)
        const stoneStartY = dirtEndY - 1
        const stoneEndY = terrainFloor

        // Surface: sand along the waterline and seabed; weathered rock on
        // outcrop cores; moss ringing the outcrops; grass elsewhere
        if (surfaceY >= minY && surfaceY <= maxY) {
          const localY = surfaceY - minY
          let surfaceBlock: number
          if (isBeach) {
            surfaceBlock = BlockIds.SAND
          } else if (isOutcropCore) {
            // Fine-grained mix so the rock reads weathered, not uniform
            const mossyRoll = noise.noise2D(worldX * 0.15 + 8000, worldZ * 0.15 + 8000)
            surfaceBlock = mossyRoll > -0.1 ? BlockIds.MOSSY_STONE : BlockIds.STONE
          } else if (isMossHalo) {
            surfaceBlock = BlockIds.MOSS
          } else {
            surfaceBlock = BlockIds.GRASS
          }
          chunk.setBlockId(localX, localY, localZ, surfaceBlock)
        }

        // Subsurface: sand under beaches, solid stone under outcrops
        // ("the stone is more at the surface"), dirt under the forest floor
        const subsurfaceBlock = isBeach ? BlockIds.SAND : isOutcropCore ? BlockIds.STONE : BlockIds.DIRT
        for (let worldY = Math.min(dirtStartY, maxY); worldY >= Math.max(dirtEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, subsurfaceBlock)
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
