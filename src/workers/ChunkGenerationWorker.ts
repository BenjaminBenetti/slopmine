/**
 * Web Worker for chunk terrain generation.
 * Handles: terrain, caves, features, local light (sky + block, after features).
 * Does NOT handle: actual tree placement (crosses chunk boundaries).
 *
 * Receives biome config from main thread - no duplicated configuration here.
 */

import { WorkerSubChunk } from './WorkerSubChunk.ts'
import { ColumnHeights } from './ColumnHeights.ts'
import { SimplexNoise } from '../world/generate/SimplexNoise.ts'
import { CaveCarver } from '../world/generate/caves/CaveCarver.ts'
import { applyCaveWallLining } from '../world/generate/caves/CaveWallLining.ts'
import { computeSubChunkLight, provesSkyAbove, resolveSkySeed, SKY_SEED_SIZE } from '../world/lighting/SubChunkLight.ts'
import { getLightTables } from '../world/lighting/LightTables.ts'
import { CliffFeature, type CliffFeatureSettings } from '../world/generate/features/CliffFeature.ts'
import { OreFeature, type OreFeatureSettings, type OrePosition } from '../world/generate/features/OreFeature.ts'
import { WaterFeature } from '../world/generate/features/WaterFeature.ts'
import { OasisFeature, type OasisSettings } from '../world/generate/features/OasisFeature.ts'
import { LavaFeature, type LavaFeatureConfig } from '../world/generate/features/LavaFeature.ts'
import { WheatFeature, type WheatFeatureSettings } from '../world/generate/features/WheatFeature.ts'
import { HerbFeature, type HerbFeatureSettings } from '../world/generate/features/HerbFeature.ts'
import { HempFeature, type HempFeatureSettings } from '../world/generate/features/HempFeature.ts'
import { HellPillarFeature, type HellPillarFeatureConfig } from '../world/generate/features/HellPillarFeature.ts'
import { JungleTreeFeature, type JungleTreeFeatureSettings } from '../world/generate/features/JungleTreeFeature.ts'
import { MegaTreeFeature, type MegaTreeFeatureSettings } from '../world/generate/features/MegaTreeFeature.ts'
import { FlowerPatchFeature, type FlowerPatchFeatureSettings } from '../world/generate/features/FlowerPatchFeature.ts'
import { RiverbankMudFeature, type RiverbankMudFeatureSettings } from '../world/generate/features/RiverbankMudFeature.ts'
import { JungleFernFeature, type JungleFernFeatureSettings } from '../world/generate/features/JungleFernFeature.ts'
import { RiverbankClayFeature, type RiverbankClayFeatureSettings } from '../world/generate/features/RiverbankClayFeature.ts'
import { CattailFeature, type CattailFeatureSettings } from '../world/generate/features/CattailFeature.ts'
import { PineTreeFeature, type PineTreeFeatureSettings } from '../world/generate/features/PineTreeFeature.ts'
import { GiantConiferFeature, type GiantConiferFeatureSettings } from '../world/generate/features/GiantConiferFeature.ts'
import { VolcanoConeFeature, type VolcanoConeFeatureSettings } from '../world/generate/features/VolcanoConeFeature.ts'
import { BoulderFeature, type BoulderFeatureSettings } from '../world/generate/features/BoulderFeature.ts'
import { TallFernFeature, type TallFernFeatureSettings } from '../world/generate/features/TallFernFeature.ts'
import { FallenPineLogFeature, type FallenPineLogFeatureSettings } from '../world/generate/features/FallenPineLogFeature.ts'
import { PineStumpFeature, type PineStumpFeatureSettings } from '../world/generate/features/PineStumpFeature.ts'
import { BerryBushFeature, type BerryBushFeatureSettings } from '../world/generate/features/BerryBushFeature.ts'
import { MorelFeature, type MorelFeatureSettings } from '../world/generate/features/MorelFeature.ts'
import { GeyserFeature, type GeyserFeatureSettings } from '../world/generate/features/GeyserFeature.ts'
import { BearDenFeature, type BearDenFeatureSettings } from '../world/generate/features/BearDenFeature.ts'
import { AbandonedCabinFeature, type AbandonedCabinFeatureSettings } from '../world/generate/features/AbandonedCabinFeature.ts'
import { HuntersCampFeature, type HuntersCampFeatureSettings } from '../world/generate/features/HuntersCampFeature.ts'
import { BasaltColumnsFeature, type BasaltColumnsFeatureSettings } from '../world/generate/features/BasaltColumnsFeature.ts'
import { CharredMiningCampFeature, type CharredMiningCampFeatureSettings } from '../world/generate/features/CharredMiningCampFeature.ts'
import { Feature, type FeatureContext } from '../world/generate/features/Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT, SUB_CHUNK_VOLUME } from '../world/interfaces/IChunk.ts'
import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'
import { getBlock, BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { evaluateTerrainConfig } from '../world/generate/terrain/NoiseEvaluator.ts'
import type { TerrainConfig } from '../world/generate/terrain/TerrainConfig.ts'
import type { WaterSettings, BiomeGenerator } from '../world/generate/BiomeGenerator.ts'
import type { CaveConfig } from '../world/generate/caves/CaveConfig.ts'
import {
  createCaveSampleGetter,
  BIOME_REGION_SIZE_BLOCKS,
  BLEND_DISTANCE,
  smoothstep,
  lerp,
} from '../world/generate/caves/CaveBlend.ts'
import { LAYER_BOUNDARY_Y, type IGenerationConfig } from '../world/generate/GenerationConfig.ts'
import {
  FULL_GENERATION,
  SURFACE_ONLY_GENERATION,
  type SubChunkGenerationOptions,
} from '../world/generate/SubChunkGenerationOptions.ts'
import { LodWorkerService } from '../world/lod/LodWorkerService.ts'
import {
  LOD_SURFACE_LIQUID,
  LOD_SURFACE_SOLID,
  type LodWorkerRequest,
  type LodTileRequest,
  type LodErrorResult,
} from '../world/lod/LodTypes.ts'

// Import biome registry for dynamic biome instantiation
import { biomeRegistry } from '../world/generate/biomes/BiomeRegistry.ts'
import type { BiomeType } from '../world/generate/GenerationConfig.ts'

// Initialize block registry in worker context
try {
  registerDefaultBlocks()
  console.log('[ChunkGenerationWorker] Block registry initialized successfully')
} catch (error) {
  console.error('[ChunkGenerationWorker] Failed to initialize block registry:', error)
  throw error
}

/**
 * Cache of biome generator instances by seed+name key.
 * Biome generators are created lazily and cached for reuse.
 */
const biomeCache = new Map<string, BiomeGenerator>()

/**
 * Get or create a biome generator instance for the given config.
 * Uses the biome registry to dynamically create generators.
 */
function getBiomeGenerator(name: string, seed: number, seaLevel: number, terrainThickness: number): BiomeGenerator {
  const key = `${seed}-${name}`
  let generator = biomeCache.get(key)

  if (!generator) {
    const config: IGenerationConfig = {
      seed,
      seaLevel,
      terrainThickness,
      chunkDistance: 8,
    }

    // Get biome from registry, fallback to first registered biome if not found
    const registration = biomeRegistry.get(name as BiomeType)
    if (registration) {
      generator = registration.createGenerator(config as any)
    } else {
      const allBiomes = biomeRegistry.getAll()
      generator = allBiomes[0].createGenerator(config as any)
    }

    biomeCache.set(key, generator)
  }

  return generator
}

/**
 * Serialized feature config passed from main thread.
 */
export type FeatureConfig =
  | { type: 'cliff'; settings: CliffFeatureSettings }
  | { type: 'ore'; settings: OreFeatureSettings }
  | { type: 'water'; settings: WaterSettings }
  | { type: 'oasis'; settings: OasisSettings }
  | { type: 'lava'; settings: LavaFeatureConfig }
  | { type: 'wheat'; settings: WheatFeatureSettings }
  | { type: 'herb'; settings: HerbFeatureSettings }
  | { type: 'hellPillar'; settings: HellPillarFeatureConfig }
  | { type: 'jungleTree'; settings: JungleTreeFeatureSettings }
  | { type: 'megaTree'; settings: MegaTreeFeatureSettings }
  | { type: 'flowerPatch'; settings: FlowerPatchFeatureSettings }
  | { type: 'riverbankMud'; settings: RiverbankMudFeatureSettings }
  | { type: 'jungleFern'; settings: JungleFernFeatureSettings }
  | { type: 'riverbankClay'; settings: RiverbankClayFeatureSettings }
  | { type: 'cattail'; settings: CattailFeatureSettings }
  | { type: 'hemp'; settings: HempFeatureSettings }
  | { type: 'pineTree'; settings: PineTreeFeatureSettings }
  | { type: 'giantConifer'; settings: GiantConiferFeatureSettings }
  | { type: 'volcanoCone'; settings: VolcanoConeFeatureSettings }
  | { type: 'boulder'; settings: BoulderFeatureSettings }
  | { type: 'tallFern'; settings: TallFernFeatureSettings }
  | { type: 'fallenPineLog'; settings: FallenPineLogFeatureSettings }
  | { type: 'pineStump'; settings: PineStumpFeatureSettings }
  | { type: 'berryBush'; settings: BerryBushFeatureSettings }
  | { type: 'morel'; settings: MorelFeatureSettings }
  | { type: 'geyser'; settings: GeyserFeatureSettings }
  | { type: 'bearDen'; settings: BearDenFeatureSettings }
  | { type: 'abandonedCabin'; settings: AbandonedCabinFeatureSettings }
  | { type: 'huntersCamp'; settings: HuntersCampFeatureSettings }
  | { type: 'basaltColumns'; settings: BasaltColumnsFeatureSettings }
  | { type: 'charredMiningCamp'; settings: CharredMiningCampFeatureSettings }

/**
 * Biome config passed from main thread (plain object, no class instances).
 */
export interface WorkerBiomeConfig {
  name: string
  treeDensity: number
  features: FeatureConfig[]
  caves?: CaveConfig
  water?: WaterSettings
  terrainConfig: TerrainConfig
  /** Maximum skylight level for this biome (0-15). Default is 15. */
  skylightValue: number
}

/**
 * Biome blend data for smooth transitions between biomes.
 * Contains the primary biome and adjacent biomes for height blending.
 */
export interface BiomeBlendData {
  /** The primary biome for this chunk */
  primary: WorkerBiomeConfig
  /** Adjacent biomes for edge blending (optional, same as primary if not at edge) */
  north?: WorkerBiomeConfig
  south?: WorkerBiomeConfig
  east?: WorkerBiomeConfig
  west?: WorkerBiomeConfig
  /** Diagonal corner biomes for proper corner blending */
  northeast?: WorkerBiomeConfig
  northwest?: WorkerBiomeConfig
  southeast?: WorkerBiomeConfig
  southwest?: WorkerBiomeConfig
  /** Position within the 16x16 chunk biome region (0-15) */
  chunkLocalX: number
  chunkLocalZ: number
}

// Region size, blend distance, smoothstep and lerp are shared with the cave
// blend module (imported above) so caves and terrain use identical geometry.

/**
 * Get the TerrainConfig from a biome config.
 */
function getTerrainConfig(biomeConfig: WorkerBiomeConfig): TerrainConfig {
  return biomeConfig.terrainConfig
}

/**
 * Calculate distance to the nearest biome boundary for a world coordinate.
 * Returns: { distance, neighborDirection }
 * - distance: blocks to nearest boundary (0 at boundary, up to 256 at center)
 * - neighborDirection: -1 if closer to west/north boundary, 1 if closer to east/south
 */
function getDistanceToBoundary(worldCoord: number): { distance: number; neighborDirection: -1 | 1 } {
  // Get position within region (0 to 511)
  const posInRegion = ((worldCoord % BIOME_REGION_SIZE_BLOCKS) + BIOME_REGION_SIZE_BLOCKS) % BIOME_REGION_SIZE_BLOCKS

  // Distance to west boundary (at 0) and east boundary (at 512)
  const distToWest = posInRegion
  const distToEast = BIOME_REGION_SIZE_BLOCKS - posInRegion

  if (distToWest < distToEast) {
    return { distance: distToWest, neighborDirection: -1 }
  } else {
    return { distance: distToEast, neighborDirection: 1 }
  }
}

// ==================== Sub-Chunk Generation Types ====================

/**
 * Request to generate a single sub-chunk (32x32x32).
 */
export interface SubChunkGenerationRequest {
  type: 'generate-subchunk'
  chunkX: number
  chunkZ: number
  subY: number // 0-15 sub-chunk index
  minWorldY: number // subY * 64
  maxWorldY: number // subY * 64 + 63
  seed: number
  seaLevel: number
  terrainThickness: number
  biomeData: BiomeBlendData
  blocks: Uint16Array // 32,768 elements
  lightData: Uint8Array // 32,768 elements (filled with local light)
  /**
   * Per-column sky seed (32x32, z*32+x; see SubChunkLight.ts SKY_SEED_*):
   * where direct sky enters the top of this sub-chunk as the main thread
   * currently knows it. Omitted = open where the sub-chunk proves the sky above.
   */
  skySeed?: Uint8Array
  /** Stages to run; defaults to the full pipeline. */
  options?: SubChunkGenerationOptions
  /** Echoed in the response/error: pairs replies with requests (several may be in flight per sub-chunk). */
  requestId?: number
  /**
   * Light only (a sub-chunk loaded from persistence): `blocks` holds its saved
   * data; nothing is generated - the local light pass runs on it with this
   * metadata and sky proof, off the main thread.
   */
  lightOnly?: { metadata: Uint8Array; skyOpenAbove: boolean }
}

/**
 * Response from sub-chunk generation.
 */
export interface SubChunkGenerationResponse {
  type: 'subchunk-result'
  /** The request's requestId. */
  requestId?: number
  chunkX: number
  chunkZ: number
  subY: number
  blocks: Uint16Array
  lightData: Uint8Array
  metadataData: Uint8Array // Block metadata (facing direction, etc.)
  hasTerrainAbove: boolean // True if terrain extends above this sub-chunk
  /**
   * Sky proof (see provesSkyAbove), reported together with the local light in
   * lightData. Omit it on any path that skips the light pass: the main thread
   * then relights the sub-chunk itself.
   */
  skyOpenAbove?: boolean
  /**
   * The resolved 0/1 sky seed (32x32, z*32+x) lightData was computed with.
   * Sent back rather than re-derived from the request, so light and seed
   * always belong together (a reply can resolve a newer request for the same
   * sub-chunk). Omit together with skyOpenAbove on paths without the light pass.
   */
  lightSeed?: Uint8Array
  maxSolidY: number // Highest solid block world Y in this sub-chunk (-1 if empty)
  orePositions: OrePosition[] // Debug: positions of all ore blocks placed
  isFullyOpaque: boolean // True if ALL blocks in this sub-chunk are opaque (for occlusion culling)
}

/**
 * Error response from sub-chunk generation.
 */
export interface SubChunkGenerationError {
  type: 'subchunk-error'
  /** The request's requestId. */
  requestId?: number
  chunkX: number
  chunkZ: number
  subY: number
  error: string
}

/**
 * Reconstruct Feature instances from serialized configs.
 */
function createFeatures(configs: FeatureConfig[]): Feature[] {
  return configs.map(config => {
    switch (config.type) {
      case 'cliff':
        return new CliffFeature(config.settings)
      case 'ore':
        return new OreFeature(config.settings)
      case 'water':
        return new WaterFeature(config.settings)
      case 'oasis':
        return new OasisFeature(config.settings)
      case 'lava':
        return new LavaFeature(config.settings)
      case 'wheat':
        return new WheatFeature(config.settings)
      case 'herb':
        return new HerbFeature(config.settings)
      case 'hellPillar':
        return new HellPillarFeature(config.settings)
      case 'jungleTree':
        return new JungleTreeFeature(config.settings)
      case 'megaTree':
        return new MegaTreeFeature(config.settings)
      case 'flowerPatch':
        return new FlowerPatchFeature(config.settings)
      case 'riverbankMud':
        return new RiverbankMudFeature(config.settings)
      case 'jungleFern':
        return new JungleFernFeature(config.settings)
      case 'riverbankClay':
        return new RiverbankClayFeature(config.settings)
      case 'cattail':
        return new CattailFeature(config.settings)
      case 'hemp':
        return new HempFeature(config.settings)
      case 'pineTree':
        return new PineTreeFeature(config.settings)
      case 'giantConifer':
        return new GiantConiferFeature(config.settings)
      case 'volcanoCone':
        return new VolcanoConeFeature(config.settings)
      case 'boulder':
        return new BoulderFeature(config.settings)
      case 'tallFern':
        return new TallFernFeature(config.settings)
      case 'fallenPineLog':
        return new FallenPineLogFeature(config.settings)
      case 'pineStump':
        return new PineStumpFeature(config.settings)
      case 'berryBush':
        return new BerryBushFeature(config.settings)
      case 'morel':
        return new MorelFeature(config.settings)
      case 'geyser':
        return new GeyserFeature(config.settings)
      case 'bearDen':
        return new BearDenFeature(config.settings)
      case 'abandonedCabin':
        return new AbandonedCabinFeature(config.settings)
      case 'huntersCamp':
        return new HuntersCampFeature(config.settings)
      case 'basaltColumns':
        return new BasaltColumnsFeature(config.settings)
      case 'charredMiningCamp':
        return new CharredMiningCampFeature(config.settings)
      default:
        throw new Error(`Unknown feature type: ${(config as any).type}`)
    }
  })
}

/**
 * Get the 4 corner biomes for bilinear interpolation based on which corner we're near.
 * Returns [primary corner, X neighbor, Z neighbor, diagonal corner]
 */
function getCornerBiomes(
  biomeData: BiomeBlendData,
  xDir: -1 | 1,
  zDir: -1 | 1
): [WorkerBiomeConfig, WorkerBiomeConfig, WorkerBiomeConfig, WorkerBiomeConfig] {
  const { primary } = biomeData

  // Get the 4 biomes based on which corner we're near
  // xDir: -1 = west, 1 = east
  // zDir: -1 = north, 1 = south
  const xNeighbor = xDir === -1 ? (biomeData.west ?? primary) : (biomeData.east ?? primary)
  const zNeighbor = zDir === -1 ? (biomeData.north ?? primary) : (biomeData.south ?? primary)

  // Get the diagonal corner biome
  let cornerNeighbor: WorkerBiomeConfig
  if (xDir === 1 && zDir === -1) {
    cornerNeighbor = biomeData.northeast ?? primary
  } else if (xDir === -1 && zDir === -1) {
    cornerNeighbor = biomeData.northwest ?? primary
  } else if (xDir === 1 && zDir === 1) {
    cornerNeighbor = biomeData.southeast ?? primary
  } else {
    cornerNeighbor = biomeData.southwest ?? primary
  }

  return [primary, xNeighbor, zNeighbor, cornerNeighbor]
}

/**
 * Bilinear interpolation between 4 values.
 * u: blend factor along X (0 = left, 1 = right)
 * v: blend factor along Z (0 = top, 1 = bottom)
 * Values: [topLeft, topRight, bottomLeft, bottomRight]
 */
function bilerp(values: [number, number, number, number], u: number, v: number): number {
  const [tl, tr, bl, br] = values
  const top = lerp(tl, tr, u)
  const bottom = lerp(bl, br, u)
  return lerp(top, bottom, v)
}

/**
 * Generate blended terrain height at a world position.
 * Uses NOISE-LEVEL BLENDING: evaluates each biome's terrain config separately,
 * then blends the resulting HEIGHT VALUES. This allows biomes with completely
 * different noise types to blend smoothly.
 */
function getBlendedHeightAt(
  noise: SimplexNoise,
  worldX: number,
  worldZ: number,
  seaLevel: number,
  biomeData: BiomeBlendData
): number {
  const { primary } = biomeData
  const primaryConfig = getTerrainConfig(primary)

  // Calculate distance to nearest boundary for each axis
  const xBoundary = getDistanceToBoundary(worldX)
  const zBoundary = getDistanceToBoundary(worldZ)

  const xInBlend = xBoundary.distance < BLEND_DISTANCE
  const zInBlend = zBoundary.distance < BLEND_DISTANCE

  // Evaluate primary biome's height
  const primaryHeight = evaluateTerrainConfig(noise, primaryConfig, worldX, worldZ, seaLevel)

  if (!xInBlend && !zInBlend) {
    // No blending needed - use primary biome only
    return Math.floor(primaryHeight)
  }

  // NOISE-LEVEL BLENDING: Evaluate each biome separately, then blend heights

  if (xInBlend && zInBlend) {
    // Corner case: bilinear interpolation of 4 biome heights
    const [b00, b10, b01, b11] = getCornerBiomes(
      biomeData,
      xBoundary.neighborDirection,
      zBoundary.neighborDirection
    )

    // Evaluate all 4 corner biomes at this position
    const h00 = evaluateTerrainConfig(noise, getTerrainConfig(b00), worldX, worldZ, seaLevel)
    const h10 = evaluateTerrainConfig(noise, getTerrainConfig(b10), worldX, worldZ, seaLevel)
    const h01 = evaluateTerrainConfig(noise, getTerrainConfig(b01), worldX, worldZ, seaLevel)
    const h11 = evaluateTerrainConfig(noise, getTerrainConfig(b11), worldX, worldZ, seaLevel)

    // Blend factors: 0.5 at boundary, 0 at edge of blend zone
    const u = 0.5 * (1 - smoothstep(xBoundary.distance / BLEND_DISTANCE))
    const v = 0.5 * (1 - smoothstep(zBoundary.distance / BLEND_DISTANCE))

    // Bilinear interpolation of heights
    return Math.floor(bilerp([h00, h10, h01, h11], u, v))

  } else if (xInBlend) {
    // X-axis blending only
    const neighbor = xBoundary.neighborDirection === -1
      ? (biomeData.west ?? primary)
      : (biomeData.east ?? primary)
    const neighborHeight = evaluateTerrainConfig(
      noise, getTerrainConfig(neighbor), worldX, worldZ, seaLevel
    )
    // t: 0.5 at boundary, 1.0 at edge of blend zone (fully primary)
    const t = 0.5 + 0.5 * smoothstep(xBoundary.distance / BLEND_DISTANCE)
    return Math.floor(lerp(neighborHeight, primaryHeight, t))

  } else {
    // Z-axis blending only
    const neighbor = zBoundary.neighborDirection === -1
      ? (biomeData.north ?? primary)
      : (biomeData.south ?? primary)
    const neighborHeight = evaluateTerrainConfig(
      noise, getTerrainConfig(neighbor), worldX, worldZ, seaLevel
    )
    const t = 0.5 + 0.5 * smoothstep(zBoundary.distance / BLEND_DISTANCE)
    return Math.floor(lerp(neighborHeight, primaryHeight, t))
  }
}

/**
 * Cave carver cached per seed (its noise tables are seed-derived and the
 * carver holds reusable scratch buffers, so one instance serves all requests).
 */
let cachedCaveCarver: CaveCarver | null = null
let cachedCaveCarverSeed = 0

function getCaveCarver(seed: number): CaveCarver {
  if (!cachedCaveCarver || cachedCaveCarverSeed !== seed) {
    cachedCaveCarver = new CaveCarver(seed)
    cachedCaveCarverSeed = seed
  }
  return cachedCaveCarver
}

/**
 * Terrain noise cached per seed (its permutation tables are seed-derived and
 * read-only, so one instance serves all requests).
 */
let cachedNoise: SimplexNoise | null = null
let cachedNoiseSeed = 0

function getNoise(seed: number): SimplexNoise {
  if (!cachedNoise || cachedNoiseSeed !== seed) {
    cachedNoise = new SimplexNoise(seed)
    cachedNoiseSeed = seed
  }
  return cachedNoise
}

/**
 * Recently used column height grids, most recent last. Every sub-chunk of a
 * column needs the same 32x32 blended heights (plus the same out-of-chunk
 * probes), so sub-chunks of a column that land on this worker - and all the
 * sub-chunks of an LOD tile - compute them once.
 */
const columnHeightCache = new Map<string, ColumnHeights>()
const COLUMN_HEIGHT_CACHE_SIZE = 64

function getColumnHeights(
  chunkX: number,
  chunkZ: number,
  seed: number,
  seaLevel: number,
  biomeData: BiomeBlendData,
  noise: SimplexNoise
): ColumnHeights {
  // Blended height depends only on world position and the blend biomes
  const key = `${seed}:${seaLevel}:${chunkX}:${chunkZ}:${biomeData.primary.name}:` +
    `${biomeData.north?.name}:${biomeData.south?.name}:${biomeData.east?.name}:${biomeData.west?.name}:` +
    `${biomeData.northeast?.name}:${biomeData.northwest?.name}:${biomeData.southeast?.name}:${biomeData.southwest?.name}`
  let heights = columnHeightCache.get(key)
  if (heights) {
    // Refresh recency
    columnHeightCache.delete(key)
    columnHeightCache.set(key, heights)
    return heights
  }
  heights = new ColumnHeights(chunkX * CHUNK_SIZE_X, chunkZ * CHUNK_SIZE_Z, (worldX, worldZ) =>
    getBlendedHeightAt(noise, worldX, worldZ, seaLevel, biomeData)
  )
  columnHeightCache.set(key, heights)
  if (columnHeightCache.size > COLUMN_HEIGHT_CACHE_SIZE) {
    const oldest = columnHeightCache.keys().next().value
    if (oldest !== undefined) columnHeightCache.delete(oldest)
  }
  return heights
}

/**
 * True if any biome in the blend neighborhood has caves enabled AND the
 * requested Y range can intersect a cave band. Conservative: blended
 * minY/maxY are weighted means, so they can never exceed the min/max of
 * the contributing configs.
 */
function cavesCanAffect(biomeData: BiomeBlendData, minWorldY: number, maxWorldY: number): boolean {
  const configs = [
    biomeData.primary,
    biomeData.north,
    biomeData.south,
    biomeData.east,
    biomeData.west,
    biomeData.northeast,
    biomeData.northwest,
    biomeData.southeast,
    biomeData.southwest,
  ]
  let bandLo = Infinity
  let bandHi = -Infinity
  for (const c of configs) {
    if (!c?.caves?.enabled) continue
    if (c.caves.minY < bandLo) bandLo = c.caves.minY
    if (c.caves.maxY > bandHi) bandHi = c.caves.maxY
  }
  return bandLo <= maxWorldY && bandHi >= minWorldY
}

// ==================== Sub-Chunk Generation ====================

/**
 * Base dither distance in blocks from biome boundary where blending occurs.
 */
const DITHER_DISTANCE_BASE = 8

/**
 * Amount the dither distance can vary due to noise (in both directions).
 * Effective dither distance will range from BASE - VARIANCE to BASE + VARIANCE.
 */
const DITHER_VARIANCE = 8

/**
 * Scale of the noise used to vary dither distance.
 * Lower values = larger, smoother snake patterns.
 * Higher values = smaller, more frequent snake patterns.
 */
const DITHER_NOISE_SCALE = 0.1

/**
 * Cache for dither noise generator (created lazily per seed).
 */
let ditherNoise: SimplexNoise | null = null
let ditherNoiseSeed: number = 0

/**
 * Get the effective dither distance at a world position.
 * Uses noise to vary the distance, creating a snaking boundary.
 */
function getEffectiveDitherDistance(worldX: number, worldZ: number, seed: number): number {
  // Lazily create or update noise generator
  if (!ditherNoise || ditherNoiseSeed !== seed) {
    // Use a different seed offset for dither noise to avoid correlation with terrain
    ditherNoise = new SimplexNoise(seed + 12345)
    ditherNoiseSeed = seed
  }

  // Sample noise at this position (-1 to 1 range)
  const noiseValue = ditherNoise.noise2D(worldX * DITHER_NOISE_SCALE, worldZ * DITHER_NOISE_SCALE)

  // Map noise to dither distance variation
  // noiseValue of -1 = min distance (BASE - VARIANCE)
  // noiseValue of +1 = max distance (BASE + VARIANCE)
  const effectiveDistance = DITHER_DISTANCE_BASE + noiseValue * DITHER_VARIANCE

  // Clamp to minimum of 1 block
  return Math.max(1, effectiveDistance)
}

/**
 * Get unique neighboring biomes that differ from primary.
 */
function getUniqueNeighborBiomes(biomeData: BiomeBlendData): WorkerBiomeConfig[] {
  const primary = biomeData.primary
  const neighbors: WorkerBiomeConfig[] = []
  const seen = new Set<string>([primary.name])

  const candidates = [
    biomeData.north, biomeData.south, biomeData.east, biomeData.west,
    biomeData.northeast, biomeData.northwest, biomeData.southeast, biomeData.southwest
  ]

  for (const neighbor of candidates) {
    if (neighbor && !seen.has(neighbor.name)) {
      seen.add(neighbor.name)
      neighbors.push(neighbor)
    }
  }

  return neighbors
}

/**
 * Calculate dither probability based on distance to boundary.
 * Returns 0-1 where 0 = fully primary, 1 = fully secondary.
 */
function getDitherProbability(distanceToBoundary: number, effectiveDitherDistance: number): number {
  if (distanceToBoundary >= effectiveDitherDistance) return 0
  // Smooth transition: 0 at edge, 0.5 at boundary
  return 0.5 * (1 - distanceToBoundary / effectiveDitherDistance)
}

/**
 * Deterministic dither decision based on world position.
 * Returns true if should use secondary biome block.
 */
function shouldDither(worldX: number, worldZ: number, worldY: number, seed: number, probability: number): boolean {
  if (probability <= 0) return false
  if (probability >= 1) return true

  // Hash position for deterministic randomness
  let hash = seed ^ (worldX * 73856093) ^ (worldZ * 19349663) ^ (worldY * 83492791)
  hash = ((hash ^ (hash >>> 16)) * 0x85ebca6b) >>> 0
  hash = ((hash ^ (hash >>> 13)) * 0xc2b2ae35) >>> 0
  hash = (hash ^ (hash >>> 16)) >>> 0
  const random = (hash & 0x7fffffff) / 0x7fffffff

  return random < probability
}

/**
 * Size of a biome region in chunks.
 */
const BIOME_REGION_SIZE = 16

/**
 * Check if this chunk is at the edge of its biome region in a given direction.
 */
function isAtBiomeRegionEdge(
  chunkLocalX: number,
  chunkLocalZ: number,
  direction: 'north' | 'south' | 'east' | 'west'
): boolean {
  switch (direction) {
    case 'north': return chunkLocalZ === 0
    case 'south': return chunkLocalZ === BIOME_REGION_SIZE - 1
    case 'west': return chunkLocalX === 0
    case 'east': return chunkLocalX === BIOME_REGION_SIZE - 1
  }
}

/**
 * Get the neighbor biome and distance to boundary for a specific position.
 * Only returns a neighbor if we're actually at a biome region boundary.
 * Uses noise-varied dither distance for organic boundary shapes.
 */
function getNeighborAndDistance(
  biomeData: BiomeBlendData,
  localX: number,
  localZ: number,
  worldX: number,
  worldZ: number,
  seed: number
): { neighbor: WorkerBiomeConfig; distance: number; effectiveDitherDistance: number } | null {
  const primary = biomeData.primary
  const { chunkLocalX, chunkLocalZ } = biomeData

  // Get noise-varied dither distance for this position
  const effectiveDitherDistance = getEffectiveDitherDistance(worldX, worldZ, seed)

  // Calculate distances to each chunk edge
  const distToWest = localX
  const distToEast = CHUNK_SIZE_X - 1 - localX
  const distToNorth = localZ
  const distToSouth = CHUNK_SIZE_Z - 1 - localZ

  // Check each direction - only if we're at the biome region edge AND have a different neighbor
  let bestNeighbor: WorkerBiomeConfig | null = null
  let bestDistance = Infinity

  // West edge
  if (isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'west') &&
      biomeData.west && biomeData.west.name !== primary.name &&
      distToWest < effectiveDitherDistance && distToWest < bestDistance) {
    bestNeighbor = biomeData.west
    bestDistance = distToWest
  }

  // East edge
  if (isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'east') &&
      biomeData.east && biomeData.east.name !== primary.name &&
      distToEast < effectiveDitherDistance && distToEast < bestDistance) {
    bestNeighbor = biomeData.east
    bestDistance = distToEast
  }

  // North edge
  if (isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'north') &&
      biomeData.north && biomeData.north.name !== primary.name &&
      distToNorth < effectiveDitherDistance && distToNorth < bestDistance) {
    bestNeighbor = biomeData.north
    bestDistance = distToNorth
  }

  // South edge
  if (isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'south') &&
      biomeData.south && biomeData.south.name !== primary.name &&
      distToSouth < effectiveDitherDistance && distToSouth < bestDistance) {
    bestNeighbor = biomeData.south
    bestDistance = distToSouth
  }

  // Corner cases - check if we're at a corner of the biome region
  const atWestEdge = isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'west')
  const atEastEdge = isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'east')
  const atNorthEdge = isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'north')
  const atSouthEdge = isAtBiomeRegionEdge(chunkLocalX, chunkLocalZ, 'south')

  // Northwest corner
  if (atWestEdge && atNorthEdge && biomeData.northwest && biomeData.northwest.name !== primary.name) {
    const cornerDist = Math.min(distToWest, distToNorth)
    if (cornerDist < effectiveDitherDistance && cornerDist < bestDistance) {
      bestNeighbor = biomeData.northwest
      bestDistance = cornerDist
    }
  }

  // Northeast corner
  if (atEastEdge && atNorthEdge && biomeData.northeast && biomeData.northeast.name !== primary.name) {
    const cornerDist = Math.min(distToEast, distToNorth)
    if (cornerDist < effectiveDitherDistance && cornerDist < bestDistance) {
      bestNeighbor = biomeData.northeast
      bestDistance = cornerDist
    }
  }

  // Southwest corner
  if (atWestEdge && atSouthEdge && biomeData.southwest && biomeData.southwest.name !== primary.name) {
    const cornerDist = Math.min(distToWest, distToSouth)
    if (cornerDist < effectiveDitherDistance && cornerDist < bestDistance) {
      bestNeighbor = biomeData.southwest
      bestDistance = cornerDist
    }
  }

  // Southeast corner
  if (atEastEdge && atSouthEdge && biomeData.southeast && biomeData.southeast.name !== primary.name) {
    const cornerDist = Math.min(distToEast, distToSouth)
    if (cornerDist < effectiveDitherDistance && cornerDist < bestDistance) {
      bestNeighbor = biomeData.southeast
      bestDistance = cornerDist
    }
  }

  if (bestNeighbor) {
    return { neighbor: bestNeighbor, distance: bestDistance, effectiveDitherDistance }
  }
  return null
}

/**
 * Generate terrain for a sub-chunk with biome blending and block dithering.
 * Uses fillChunk with Y bounds for efficient generation.
 */
function generateSubChunkTerrain(
  subChunk: WorkerSubChunk,
  noise: SimplexNoise,
  seed: number,
  seaLevel: number,
  terrainThickness: number,
  minWorldY: number,
  maxWorldY: number,
  biomeData: BiomeBlendData,
  getHeight: (worldX: number, worldZ: number) => number
): { hasTerrainAbove: boolean; maxSolidY: number } {
  // Get primary biome generator
  const primaryBiome = getBiomeGenerator(biomeData.primary.name, seed, seaLevel, terrainThickness)
  const chunkWorldX = Number(subChunk.coordinate.x) * CHUNK_SIZE_X
  const chunkWorldZ = Number(subChunk.coordinate.z) * CHUNK_SIZE_Z

  // Fill with primary biome first
  ;(primaryBiome as any).fillChunk(subChunk, minWorldY, maxWorldY, noise, getHeight)

  // Check if we have any different neighboring biomes
  const uniqueNeighbors = getUniqueNeighborBiomes(biomeData)

  if (uniqueNeighbors.length > 0) {
    // Create temporary storage for secondary biome blocks
    const blockCount = CHUNK_SIZE_X * CHUNK_SIZE_Z * SUB_CHUNK_HEIGHT
    const secondaryBlocks = new Uint16Array(blockCount)

    // For each unique neighbor, fill temp buffer and dither-blend
    for (const neighborConfig of uniqueNeighbors) {
      const neighborBiome = getBiomeGenerator(neighborConfig.name, seed, seaLevel, terrainThickness)

      // Create a temp sub-chunk to fill with neighbor biome
      const tempSubChunk = new WorkerSubChunk(
        Number(subChunk.coordinate.x),
        Number(subChunk.coordinate.z),
        Number(subChunk.coordinate.subY),
        secondaryBlocks,
        new Uint8Array(blockCount) // Light data not needed for dithering
      )

      // Fill temp with neighbor biome
      ;(neighborBiome as any).fillChunk(tempSubChunk, minWorldY, maxWorldY, noise, getHeight)

      // Dither-blend: copy secondary blocks based on dither pattern
      for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
        for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
          // Get world coordinates first (needed for noise-based dither distance)
          const worldX = chunkWorldX + localX
          const worldZ = chunkWorldZ + localZ

          // Check if this position should blend with this neighbor
          const neighborInfo = getNeighborAndDistance(biomeData, localX, localZ, worldX, worldZ, seed)
          if (!neighborInfo || neighborInfo.neighbor.name !== neighborConfig.name) {
            continue
          }

          // Calculate dither probability based on distance to biome boundary
          // Uses the noise-varied effective dither distance for organic boundaries
          const ditherProb = getDitherProbability(neighborInfo.distance, neighborInfo.effectiveDitherDistance)

          if (ditherProb <= 0) continue

          // Dither each Y level in this column
          for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
            const worldY = minWorldY + localY
            if (shouldDither(worldX, worldZ, worldY, seed, ditherProb)) {
              const secondaryBlock = tempSubChunk.getBlockId(localX, localY, localZ)
              // Only copy if secondary has a block (don't replace solid with air)
              if (secondaryBlock !== 0) {
                subChunk.setBlockId(localX, localY, localZ, secondaryBlock)
              }
            }
          }
        }
      }

      // Clear temp buffer for next neighbor
      secondaryBlocks.fill(0)
    }
  }

  // Calculate hasTerrainAbove and maxSolidY by scanning the sub-chunk
  let hasTerrainAbove = false
  let maxSolidY = -1

  for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      // Check if terrain extends above this sub-chunk
      const height = getHeight(chunkWorldX + localX, chunkWorldZ + localZ)
      if (height > maxWorldY) {
        hasTerrainAbove = true
      }

      // Find max solid Y in this column
      for (let localY = SUB_CHUNK_HEIGHT - 1; localY >= 0; localY--) {
        if (subChunk.getBlockId(localX, localY, localZ) !== 0) {
          const worldY = minWorldY + localY
          if (worldY > maxSolidY) {
            maxSolidY = worldY
          }
          break
        }
      }
    }
  }

  return { hasTerrainAbove, maxSolidY }
}

/**
 * Generate a single sub-chunk. `options` switches off stages a caller doesn't
 * need (LOD tiles only need the final surface); the default runs everything.
 */
async function generateSubChunk(
  request: SubChunkGenerationRequest,
  options: SubChunkGenerationOptions = FULL_GENERATION
): Promise<SubChunkGenerationResponse> {
  const { chunkX, chunkZ, subY, minWorldY, maxWorldY, seed, seaLevel, terrainThickness, biomeData, blocks, lightData, skySeed } = request
  const biomeConfig = biomeData.primary

  // Create WorkerSubChunk with the provided buffers
  const subChunk = new WorkerSubChunk(chunkX, chunkZ, subY, blocks, lightData)

  const noise = getNoise(seed)

  // Blended-height getter shared by terrain, caves, skylight and features -
  // and with every other sub-chunk of this column generated by this worker.
  const chunkWorldX = chunkX * CHUNK_SIZE_X
  const chunkWorldZ = chunkZ * CHUNK_SIZE_Z
  const heights = getColumnHeights(chunkX, chunkZ, seed, seaLevel, biomeData, noise)
  const getHeight = (worldX: number, worldZ: number): number => heights.get(worldX, worldZ)

  // All-air early-out: a surface-layer sub-chunk entirely above the blended
  // height of every column gets nothing from the terrain fill (biomes only
  // fill at or below the height), biome dithering or cave carving (carving
  // skips air), so skip those. Water, features and lining still run - tall
  // structures rooted lower down (giant conifers, mega trees, volcano cones
  // and their lava calderas) continue up into these sub-chunks.
  const aboveTerrain = minWorldY >= LAYER_BOUNDARY_Y && minWorldY > heights.getMax()

  // Phase 1: Generate terrain within this sub-chunk's Y range (with biome blending)
  const { hasTerrainAbove, maxSolidY } = aboveTerrain
    ? { hasTerrainAbove: false, maxSolidY: -1 }
    : generateSubChunkTerrain(
        subChunk,
        noise,
        seed,
        seaLevel,
        terrainThickness,
        minWorldY,
        maxWorldY,
        biomeData,
        getHeight
      )

  // Phase 2: Carve caves (only within this Y range, parameters blended
  // per-column across biome borders like terrain height)
  const anyCaves = cavesCanAffect(biomeData, 0, CHUNK_HEIGHT - 1)
  const getCaveSample = anyCaves ? createCaveSampleGetter(biomeData, chunkWorldX, chunkWorldZ) : null
  if (options.caves && !aboveTerrain && getCaveSample && cavesCanAffect(biomeData, minWorldY, maxWorldY)) {
    getCaveCarver(seed).carveSubChunk(subChunk, getCaveSample, getHeight, minWorldY, maxWorldY)
  }

  // Surface-open probe for features: lets tree placement (which spans
  // sub-chunks) deterministically avoid entrance mouths and ravines.
  const isSurfaceCarvedAt = getCaveSample
    ? (worldX: number, worldZ: number): boolean =>
        getCaveCarver(seed).isSurfaceOpenAt(worldX, worldZ, getHeight(worldX, worldZ), getCaveSample(worldX, worldZ))
    : undefined

  // Phase 2.5: Apply water to terrain depressions (after caves, before skylight)
  // Water only fills open-air depressions above terrain surface, not caves
  const waterSettings = biomeConfig.water
  if (waterSettings?.enabled) {
    const waterFeature = new WaterFeature(waterSettings)
    const waterContext: FeatureContext = {
      chunk: subChunk,
      world: null,
      noise,
      config: { seed, seaLevel, terrainThickness, chunkDistance: 8 },
      biomeProperties: {
        name: biomeConfig.name,
        frequency: 1.0,
        treeDensity: biomeConfig.treeDensity,
        features: [],
        caves: biomeConfig.caves,
        water: biomeConfig.water,
        terrainConfig: biomeConfig.terrainConfig,
      },
      getBaseHeightAt: getHeight,
    }
    await waterFeature.scan(waterContext)
  }

  // Phase 4: Apply all features (uses primary biome)
  const orePositions: OrePosition[] = []
  const features = createFeatures(biomeConfig.features)

  // Biome name lookup for feature placement decisions. Maps a world column's
  // 512-block biome region onto this chunk's blend data (undefined neighbor
  // entries mean "same as primary"). Pure function of world coords, so every
  // chunk/sub-chunk rendering a slice of the same structure gets the same
  // answer. Columns beyond the 8 adjacent regions clamp to the nearest edge.
  const homeRegionX = Math.floor((chunkX * CHUNK_SIZE_X) / BIOME_REGION_SIZE_BLOCKS)
  const homeRegionZ = Math.floor((chunkZ * CHUNK_SIZE_Z) / BIOME_REGION_SIZE_BLOCKS)
  const getBiomeNameAt = (worldX: number, worldZ: number): string => {
    const dx = Math.max(-1, Math.min(1, Math.floor(worldX / BIOME_REGION_SIZE_BLOCKS) - homeRegionX))
    const dz = Math.max(-1, Math.min(1, Math.floor(worldZ / BIOME_REGION_SIZE_BLOCKS) - homeRegionZ))
    let cfg: WorkerBiomeConfig | undefined
    if (dz === -1) {
      cfg = dx === -1 ? biomeData.northwest : dx === 1 ? biomeData.northeast : biomeData.north
    } else if (dz === 1) {
      cfg = dx === -1 ? biomeData.southwest : dx === 1 ? biomeData.southeast : biomeData.south
    } else {
      cfg = dx === -1 ? biomeData.west : dx === 1 ? biomeData.east : biomeData.primary
    }
    return (cfg ?? biomeData.primary).name
  }

  // Create feature context for this sub-chunk
  const featureContext: FeatureContext = {
    chunk: subChunk,
    world: null, // Workers don't have access to world
    noise,
    config: { seed, seaLevel, terrainThickness, chunkDistance: 8 },
    biomeProperties: {
      name: biomeConfig.name,
      frequency: 1.0, // Not used in worker context
      treeDensity: biomeConfig.treeDensity,
      features: [],
      caves: biomeConfig.caves,
      water: biomeConfig.water,
      terrainConfig: biomeConfig.terrainConfig,
    },
    getBaseHeightAt: getHeight,
    isSurfaceCarvedAt,
    getBiomeNameAt,
  }

  // Apply all features
  for (const feature of features) {
    if (feature instanceof OreFeature) {
      if (!options.ores) continue
      // Special handling for ore: collect positions for main thread
      const oreMinY = feature.settings.minY
      const oreMaxY = feature.settings.maxY
      if (oreMaxY >= minWorldY && oreMinY <= maxWorldY) {
        const positions = feature.scanWithPositions(featureContext)
        for (const pos of positions) {
          if (pos.y >= minWorldY && pos.y <= maxWorldY) {
            orePositions.push(pos)
          }
        }
      }
    } else {
      // Generic handling: call scan() for all other features
      await feature.scan(featureContext)
    }
  }

  // Phase 4.5: Cave wall lining (primary biome only — block identities don't
  // blend). Runs after carving (flood lava exists) AND after features (lava
  // lakes exist, ore veins are skipped via replaceableBlocks).
  if (options.lining && biomeConfig.caves?.enabled && biomeConfig.caves.lining) {
    applyCaveWallLining(subChunk, biomeConfig.caves, seed, chunkWorldX, chunkWorldZ, minWorldY, maxWorldY, getHeight)
  }

  // Phase 5: Local light, after every block-writing phase: direct sky where
  // the seed opens the top face, emitters, and propagation within the
  // sub-chunk. The main thread merges it with loaded neighbours. Runs for
  // all-air early-out sub-chunks too (features may have written into them;
  // the main thread trusts worker light only with skyOpenAbove + lightSeed).
  // Paths without the light pass (LOD tiles) omit both.
  let skyOpenAbove: boolean | undefined
  let lightSeed: Uint8Array | undefined
  if (options.skylight) {
    // Never below the layer boundary: the whole surface layer lies above Hell,
    // whatever Hell's own terrain height says (an all-air Hell top row would
    // otherwise let unloaded surface sub-chunks count as open sky).
    skyOpenAbove = minWorldY >= LAYER_BOUNDARY_Y && provesSkyAbove(blocks, hasTerrainAbove)
    lightSeed = resolveSkySeed(skySeed ?? null, skyOpenAbove, new Uint8Array(SKY_SEED_SIZE))
    computeSubChunkLight(blocks, lightData, lightSeed, biomeConfig.skylightValue, getLightTables(), subChunk.getMetadataData())
  }

  // Phase 6: Compute opacity for occlusion culling (done in worker to avoid main thread work)
  const blockData = subChunk.getBlockData()
  let isFullyOpaque = options.opacity
  for (let i = 0; isFullyOpaque && i < blockData.length; i++) {
    const block = getBlock(blockData[i])
    if (!block.properties.isOpaque) {
      isFullyOpaque = false
    }
  }

  return {
    type: 'subchunk-result',
    chunkX,
    chunkZ,
    subY,
    blocks: blockData,
    lightData: subChunk.getLightData(),
    metadataData: subChunk.getMetadataData(),
    hasTerrainAbove,
    skyOpenAbove,
    lightSeed,
    maxSolidY,
    orePositions,
    isFullyOpaque,
  }
}

/**
 * Local light for a sub-chunk loaded from persistence (see
 * SubChunkGenerationRequest.lightOnly): the same pass as Phase 5 of
 * generateSubChunk, on the saved blocks.
 */
function lightSavedSubChunk(request: SubChunkGenerationRequest): SubChunkGenerationResponse {
  const { blocks, lightData } = request
  const { metadata, skyOpenAbove } = request.lightOnly!
  const lightSeed = resolveSkySeed(request.skySeed ?? null, skyOpenAbove, new Uint8Array(SKY_SEED_SIZE))
  computeSubChunkLight(blocks, lightData, lightSeed, request.biomeData.primary.skylightValue, getLightTables(), metadata)
  let isFullyOpaque = true
  for (let i = 0; isFullyOpaque && i < blocks.length; i++) {
    if (!getBlock(blocks[i]).properties.isOpaque) isFullyOpaque = false
  }
  return {
    type: 'subchunk-result',
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    subY: request.subY,
    blocks,
    lightData,
    metadataData: metadata,
    hasTerrainAbove: false,
    skyOpenAbove,
    lightSeed,
    maxSolidY: -1,
    orePositions: [],
    isFullyOpaque,
  }
}

// ==================== LOD Far Terrain ====================

/**
 * LOD state, created on the first LOD message (only the LOD worker pool
 * receives those; the full-detail pool never pays for it).
 */
let lodService: LodWorkerService | null = null

/** Light scratch for LOD generation - skylight is skipped, so nothing reads it. */
let lodLightScratch: Uint8Array | null = null

function getLodService(): LodWorkerService {
  if (!lodService) {
    // LOD surface blocks: greedy-meshed cubes and liquids. Skips cross
    // billboards (flowers, ferns), torches and other custom geometry.
    // Liquids are marked separately so the builder finds the bed below.
    const ids = BlockRegistry.getInstance().getAllBlockIds()
    const surfaceKind = new Uint8Array(Math.max(...ids) + 1)
    for (const id of ids) {
      const block = getBlock(id)
      if (id === 0) continue
      if (block.properties.isLiquid) {
        surfaceKind[id] = LOD_SURFACE_LIQUID
      } else if (block.isGreedyMeshable()) {
        surfaceKind[id] = LOD_SURFACE_SOLID
      }
    }
    lodService = new LodWorkerService(
      surfaceKind,
      generateLodSubChunk,
      (request) =>
        getColumnHeights(
          request.chunkX,
          request.chunkZ,
          request.seed,
          request.seaLevel,
          request.biomeData,
          getNoise(request.seed)
        ).getMax()
    )
  }
  return lodService
}

/** Surface-only generation of one sub-chunk of an LOD tile's column. */
async function generateLodSubChunk(request: LodTileRequest, subY: number, blocks: Uint16Array): Promise<void> {
  lodLightScratch ??= new Uint8Array(SUB_CHUNK_VOLUME)
  await generateSubChunk(
    {
      type: 'generate-subchunk',
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      subY,
      minWorldY: subY * SUB_CHUNK_HEIGHT,
      maxWorldY: subY * SUB_CHUNK_HEIGHT + SUB_CHUNK_HEIGHT - 1,
      seed: request.seed,
      seaLevel: request.seaLevel,
      terrainThickness: request.terrainThickness,
      biomeData: request.biomeData,
      blocks,
      lightData: lodLightScratch,
    },
    SURFACE_ONLY_GENERATION
  )
}

async function handleLodRequest(request: LodWorkerRequest): Promise<void> {
  switch (request.type) {
    case 'lod-init':
      getLodService().init(request)
      return
    case 'lod-evict':
      getLodService().evict(request)
      return
    case 'lod-tile':
      try {
        self.postMessage(await getLodService().buildTile(request))
      } catch (error) {
        const errorResult: LodErrorResult = {
          type: 'lod-error',
          request: 'lod-tile',
          x: request.chunkX,
          z: request.chunkZ,
          error: String(error),
        }
        self.postMessage(errorResult)
      }
      return
    case 'lod-mesh-region':
      try {
        const result = getLodService().meshRegion(request)
        self.postMessage(result, {
          transfer: [result.positions.buffer, result.colors.buffer, result.indices.buffer],
        })
      } catch (error) {
        const errorResult: LodErrorResult = {
          type: 'lod-error',
          request: 'lod-mesh-region',
          x: request.regionX,
          z: request.regionZ,
          requestId: request.requestId,
          error: String(error),
        }
        self.postMessage(errorResult)
      }
      return
  }
}

// Signal that worker is ready after initialization
self.postMessage({ type: 'worker-ready' })

// Worker message handler
type WorkerRequest = SubChunkGenerationRequest | LodWorkerRequest

function isLodRequest(request: WorkerRequest): request is LodWorkerRequest {
  return request.type.startsWith('lod-')
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  if (isLodRequest(request)) {
    await handleLodRequest(request)
    return
  }

  if (request.type !== 'generate-subchunk') {
    // Every request type is handled above; fail loudly instead of hanging a caller
    throw new Error(`ChunkGenerationWorker: unknown request type ${(request as { type: string }).type}`)
  }

  try {
    // Sub-chunk generation (or just the light pass for saved data)
    const result = request.lightOnly ? lightSavedSubChunk(request) : await generateSubChunk(request, request.options)
    result.requestId = request.requestId

    // Transfer buffers back (zero-copy)
    self.postMessage(result, {
      transfer: [result.blocks.buffer, result.lightData.buffer, result.metadataData.buffer],
    })
  } catch (error) {
    const errorResponse: SubChunkGenerationError = {
      type: 'subchunk-error',
      requestId: request.requestId,
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      subY: request.subY,
      error: String(error),
    }
    self.postMessage(errorResponse)
  }
}
