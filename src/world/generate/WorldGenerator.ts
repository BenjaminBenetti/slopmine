import type { WorldManager } from '../WorldManager.ts'
import type { IChunkCoordinate, ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import type { EntitySpawnConfig } from '../../entities/spawning/EntitySpawnConfig.ts'
import { createSubChunkKey, parseSubChunkKey, type SubChunkKey } from '../interfaces/ICoordinates.ts'
import { worldToChunk } from '../coordinates/CoordinateUtils.ts'
import { SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT, CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_TOP_ROW_START } from '../interfaces/IChunk.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import {
  GenerationConfig,
  type IGenerationConfig,
  type BiomeType,
  getLayerForSubChunk,
  LAYER_BOUNDARY_SUB_CHUNK,
  UNLOAD_HYSTERESIS_CHUNKS,
} from './GenerationConfig.ts'
import type { BiomeGenerator } from './BiomeGenerator.ts'
import { biomeRegistry, BIOME_REGION_SIZE } from './biomes/BiomeRegistry.ts'
import { BLEND_DISTANCE, BIOME_REGION_SIZE_BLOCKS } from './caves/CaveBlend.ts'
import { buildGroundBlockLookup, hasOpenColumn } from './OpenColumnScan.ts'
import { CliffFeature } from './features/CliffFeature.ts'
import { OreFeature } from './features/OreFeature.ts'
import { OasisFeature } from './features/OasisFeature.ts'
import { LavaFeature } from './features/LavaFeature.ts'
import { WheatFeature } from './features/WheatFeature.ts'
import { HerbFeature } from './features/HerbFeature.ts'
import { HempFeature } from './features/HempFeature.ts'
import { HellPillarFeature } from './features/HellPillarFeature.ts'
import { JungleTreeFeature } from './features/JungleTreeFeature.ts'
import { MegaTreeFeature } from './features/MegaTreeFeature.ts'
import { FlowerPatchFeature } from './features/FlowerPatchFeature.ts'
import { RiverbankMudFeature } from './features/RiverbankMudFeature.ts'
import { JungleFernFeature } from './features/JungleFernFeature.ts'
import { RiverbankClayFeature } from './features/RiverbankClayFeature.ts'
import { CattailFeature } from './features/CattailFeature.ts'
import { PineTreeFeature } from './features/PineTreeFeature.ts'
import { GiantConiferFeature } from './features/GiantConiferFeature.ts'
import { VolcanoConeFeature } from './features/VolcanoConeFeature.ts'
import { BoulderFeature } from './features/BoulderFeature.ts'
import { TallFernFeature } from './features/TallFernFeature.ts'
import { FallenPineLogFeature } from './features/FallenPineLogFeature.ts'
import { PineStumpFeature } from './features/PineStumpFeature.ts'
import { BerryBushFeature } from './features/BerryBushFeature.ts'
import { MorelFeature } from './features/MorelFeature.ts'
import { GeyserFeature } from './features/GeyserFeature.ts'
import { BearDenFeature } from './features/BearDenFeature.ts'
import { AbandonedCabinFeature } from './features/AbandonedCabinFeature.ts'
import { HuntersCampFeature } from './features/HuntersCampFeature.ts'
import { BasaltColumnsFeature } from './features/BasaltColumnsFeature.ts'
import { CharredMiningCampFeature } from './features/CharredMiningCampFeature.ts'
import type { WorkerBiomeConfig, FeatureConfig, BiomeBlendData } from '../../workers/ChunkGenerationWorker.ts'
import type { PersistenceManager } from '../../persistence/PersistenceManager.ts'
import type { SubChunkLightInput } from '../lighting/LightEngine.ts'

// Hell: Molten Wastes
import { InferniumOreFeature } from './features/InferniumOreFeature.ts'

// Hell: The Ossuary
import { FossilFeature } from './features/ossuary/FossilFeature.ts'
import { BoneSpireFeature } from './features/ossuary/BoneSpireFeature.ts'
import { OssuaryScatterFeature } from './features/ossuary/OssuaryScatterFeature.ts'

// Hell: Ember Grove
import { GiantFungusFeature } from './features/embergrove/GiantFungusFeature.ts'
import { EmberFloorFeature } from './features/embergrove/EmberFloorFeature.ts'

// Hell: Crystal Abyss
import { CrystalSpireFeature } from './features/crystal/CrystalSpireFeature.ts'
import { CrystalGeodeFeature } from './features/crystal/CrystalGeodeFeature.ts'
import { AbyssIslandFeature } from './features/crystal/AbyssIslandFeature.ts'
import { CrystalScatterFeature } from './features/crystal/CrystalScatterFeature.ts'
import { CrystalCoreFeature } from './features/crystal/CrystalCoreFeature.ts'

// Hell: Cocytus
import { FrozenLakeFeature } from './features/FrozenLakeFeature.ts'
import { IceSpireFeature } from './features/IceSpireFeature.ts'
import { FrozenLavafallFeature } from './features/FrozenLavafallFeature.ts'
import { FrostCrystalFeature } from './features/FrostCrystalFeature.ts'

// Dungeons (procedural castles)
import { ProceduralDungeonFeature } from './dungeons/ProceduralDungeonFeature.ts'

interface QueuedSubChunk {
  coordinate: ISubChunkCoordinate
  priority: number
}

/** World-Y band (inclusive) holding a column's visible surface. */
export interface SurfaceBand {
  readonly minY: number
  readonly maxY: number
}

/**
 * Supplies exact per-column surface bands (e.g. from LOD tile metadata).
 * Returns null when the column is unknown; the biome-height estimate is used
 * instead.
 */
export type SurfaceBandProvider = (chunkX: number, chunkZ: number) => SurfaceBand | null

/** Inclusive sub-chunk index range of a column's surface band. */
interface SubYRange {
  readonly lo: number
  readonly hi: number
}

/** Player position the load set is centred on. */
interface LoadCenter {
  readonly x: bigint
  readonly z: bigint
  readonly subY: number
  /**
   * Sub-chunk of the ground under the camera (its column's lowest surface)
   * while the camera is above it, else null. The lower half of the vertical
   * ellipsoid is also centred there: flying, the camera's ellipsoid no longer
   * reaches the ground, and pits and cave mouths near the player would show
   * undrawn depths below the surface bands. (Above the ground the bands
   * already hold everything there is to see.)
   */
  readonly groundSubY: number | null
  /**
   * The camera is in the Hell cavern: it went below the cavern's rock ceiling
   * (the bottom of the surface layer's fill) and hasn't climbed out of the
   * ceiling's sub-chunk since (hysteresis: a player hovering at the ceiling
   * doesn't churn the load set). Every in-range column then wants the whole
   * cavern - layer 0 and the ceiling's sub-chunk - and no surface band (the
   * surface is out of sight from there).
   */
  readonly cavern: boolean
}

/**
 * Surface band estimate margins around the sampled biome heights. Below
 * covers relief between the sample points; above covers trees and other
 * surface features.
 */
const SURFACE_BAND_ESTIMATE_BELOW = 16
const SURFACE_BAND_ESTIMATE_ABOVE = 48

/**
 * Loaded sub-chunks of in-range columns stay resident until they leave the
 * vertical ellipsoid by this many extra sub-chunks (and lie outside the
 * surface band); then they are saved and unloaded individually.
 */
const VERTICAL_UNLOAD_HYSTERESIS_SUB_CHUNKS = 1
/**
 * Depth (sub-chunks) of the half-ellipsoid below the ground under a flying
 * camera (see LoadCenter.groundSubY): enough for pits and cave mouths near the
 * player, much cheaper than a full second ellipsoid.
 */
const GROUND_ELLIPSOID_DEPTH_SUB_CHUNKS = 3
/** Sub-chunks unloaded individually per frame at most (each saves and relights its borders). */
const MAX_SUB_CHUNK_UNLOADS_PER_FRAME = 8

/** The four face-neighbour columns (see getColumnBand). */
const BAND_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** Numeric key of a column (chunk coordinates within +-2^23), for the per-column maps. */
const COLUMN_KEY_OFFSET = 0x800000
function columnKey(chunkX: number, chunkZ: number): number {
  return (chunkX + COLUMN_KEY_OFFSET) * 0x1000000 + (chunkZ + COLUMN_KEY_OFFSET)
}
function columnKeyX(key: number): number {
  return Math.floor(key / 0x1000000) - COLUMN_KEY_OFFSET
}
function columnKeyZ(key: number): number {
  return (key % 0x1000000) - COLUMN_KEY_OFFSET
}

/**
 * Coordinates world generation:
 * - Maintains chunk generation queue sorted by distance to player
 * - Generates chunks asynchronously in the background
 * - Uses web workers for heavy terrain/caves/lighting generation
 * - Unloads chunks beyond the unload distance
 */
export class WorldGenerator {
  private readonly world: WorldManager
  private readonly config: GenerationConfig

  // Biome caches - lazily populated on demand
  private readonly generatorCache: Map<BiomeType, BiomeGenerator> = new Map()
  private readonly biomeConfigCache: Map<BiomeType, WorkerBiomeConfig> = new Map()

  // Sub-chunk queue for 3D generation
  private readonly subChunkQueue: QueuedSubChunk[] = []
  // Mirrors membership of subChunkQueue for O(1) lookups and incremental updates.
  private readonly queuedSubChunkKeys: Set<SubChunkKey> = new Set()
  private readonly generatingSubChunks: Set<SubChunkKey> = new Set()
  private readonly generatedSubChunks: Set<SubChunkKey> = new Set()

  private readonly subChunksPerFrame: number = 2
  private playerChunkX: bigint = 0n
  private playerChunkZ: bigint = 0n
  private playerSubY: number = 0 // Player's sub-chunk Y index (0-15)
  private playerGroundSubY: number | null = null // see LoadCenter.groundSubY
  private playerInCavern: boolean = false // see LoadCenter.cavern
  private playerWorldY: number = 0 // Player's world Y position
  private initialized: boolean = false

  // Persistence manager for loading saved chunks
  private persistenceManager: PersistenceManager | null = null

  // Surface band sources: an exact provider (LOD tiles) when set, otherwise
  // cached biome-height estimates keyed "chunkX,chunkZ".
  private surfaceBandProvider: SurfaceBandProvider | null = null
  private readonly surfaceBandEstimates: Map<number, SurfaceBand> = new Map()
  // Applied sub-chunks with a column that holds no ground block, as subY
  // bits keyed "chunkX,chunkZ". A band whose bottom sub-chunk is open reaches
  // down another sub-chunk (see getSurfaceBandFloor).
  private readonly openSubChunks: Map<number, number> = new Map()
  // Loaded sub-chunks with a block in their top row (after decorations), as
  // subY bits keyed "chunkX,chunkZ". The sub-chunk above such a one belongs
  // to the band: the faces of those blocks need it (see getColumnBand).
  // Covers what LOD tiles don't know: main-thread decorations (mushroom caps,
  // trees) reaching above the tile's top.
  private readonly topRowSubChunks: Map<number, number> = new Map()
  private groundBlocks: Uint8Array | null = null

  // In-flight jobs whose column was unloaded meanwhile: their results are
  // discarded even if the column is wanted again by the time they land (see
  // isResultCurrent) - a result must never re-create an unloaded column.
  private readonly cancelledSubChunks: Set<SubChunkKey> = new Set()

  // Failed generation attempts per sub-chunk (see retryFailedSubChunk)
  private static readonly MAX_GENERATION_ATTEMPTS = 3
  private readonly generationFailures: Map<SubChunkKey, number> = new Map()

  // Resident sub-chunks of in-range columns that left the load set: freed a
  // few per frame (processSubChunkUnloads), re-checked when their turn comes
  private readonly subChunksToUnload: Set<SubChunkKey> = new Set()

  // Main-thread decoration passes in progress, per column (columnKey -> count).
  // Passes yield across frames; a column is never unloaded under one (it
  // would be saved with half its trees, and the rest of the pass written into
  // a throwaway placeholder column). Its unload waits in deferredColumnUnloads.
  private readonly decoratingColumns: Map<number, number> = new Map()
  private readonly deferredColumnUnloads: Set<number> = new Set()

  // Load lifecycle listeners (LOD column readiness)
  private readonly subChunkAppliedListeners: Array<(coordinate: ISubChunkCoordinate) => void> = []
  private readonly columnUnloadedListeners: Array<(coordinate: IChunkCoordinate) => void> = []
  private readonly subChunkUnloadedListeners: Array<(coordinate: ISubChunkCoordinate) => void> = []

  // See LoadCenter.cavern: the cavern's rock ceiling (Y), the highest
  // sub-chunk of the cavern (the ceiling's) and the camera Y that leaves it
  private readonly cavernCeilingY: number
  private readonly cavernTopSubY: number
  private readonly cavernExitY: number

  constructor(world: WorldManager, config?: Partial<IGenerationConfig>) {
    this.world = world
    this.config = new GenerationConfig(config)
    this.cavernCeilingY = this.config.seaLevel - this.config.terrainThickness
    this.cavernTopSubY = Math.floor(this.cavernCeilingY / SUB_CHUNK_HEIGHT)
    this.cavernExitY = (this.cavernTopSubY + 1) * SUB_CHUNK_HEIGHT
  }

  /**
   * Get the biome type for a chunk based on its biome region and vertical layer.
   * Biome regions are 16x16 chunks in size.
   *
   * @param chunkX - Chunk X coordinate
   * @param chunkZ - Chunk Z coordinate
   * @param layer - Vertical layer (0 = underground, 1 = surface). Defaults to 1.
   */
  private getBiomeForChunk(chunkX: number, chunkZ: number, layer: 0 | 1 = 1): BiomeType {
    const { regionX, regionZ } = biomeRegistry.getRegionCoords(chunkX, chunkZ)
    return biomeRegistry.selectBiomeForLayer(regionX, regionZ, this.config.seed, layer)
  }

  /**
   * Get entity spawn configurations for a world position.
   * Returns the spawn configs from the biome at that position.
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @param worldY - World Y coordinate (used to determine biome layer)
   */
  getEntitySpawnsAtPosition(worldX: number, worldZ: number, worldY: number): EntitySpawnConfig[] | undefined {
    const chunkX = Math.floor(worldX / 32)
    const chunkZ = Math.floor(worldZ / 32)

    // Determine layer from Y position
    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const layer = getLayerForSubChunk(subY)

    const biomeType = this.getBiomeForChunk(chunkX, chunkZ, layer)
    const generator = this.getGeneratorForBiome(biomeType)
    return generator.getBiomeProperties().entitySpawns
  }

  /**
   * Get or create a BiomeGenerator for a biome type.
   */
  private getGeneratorForBiome(biomeType: BiomeType): BiomeGenerator {
    let generator = this.generatorCache.get(biomeType)
    if (!generator) {
      const registration = biomeRegistry.get(biomeType)
      if (!registration) {
        throw new Error(`Unknown biome type: ${biomeType}`)
      }
      generator = registration.createGenerator(this.config)
      this.generatorCache.set(biomeType, generator)
    }
    return generator
  }

  /**
   * Get or create a WorkerBiomeConfig for a biome type.
   */
  private getWorkerBiomeConfig(biomeType: BiomeType): WorkerBiomeConfig {
    let config = this.biomeConfigCache.get(biomeType)
    if (!config) {
      const generator = this.getGeneratorForBiome(biomeType)
      config = this.createWorkerBiomeConfig(generator)
      this.biomeConfigCache.set(biomeType, config)
    }
    return config
  }

  /**
   * Convert BiomeProperties to a plain object for worker communication.
   * Extracts feature settings from Feature class instances.
   */
  private createWorkerBiomeConfig(generator: BiomeGenerator): WorkerBiomeConfig {
    const props = generator.getBiomeProperties()

    // Convert Feature instances to serializable configs
    const features: FeatureConfig[] = props.features.map(feature => {
      if (feature instanceof CliffFeature) {
        return { type: 'cliff', settings: feature.settings }
      }
      if (feature instanceof OreFeature) {
        return { type: 'ore', settings: feature.settings }
      }
      if (feature instanceof OasisFeature) {
        return { type: 'oasis', settings: feature.settings }
      }
      if (feature instanceof LavaFeature) {
        return { type: 'lava', settings: (feature as any).config }
      }
      if (feature instanceof WheatFeature) {
        return { type: 'wheat', settings: feature.settings }
      }
      if (feature instanceof HerbFeature) {
        return { type: 'herb', settings: feature.settings }
      }
      if (feature instanceof HempFeature) {
        return { type: 'hemp', settings: feature.settings }
      }
      if (feature instanceof HellPillarFeature) {
        return { type: 'hellPillar', settings: (feature as any).config }
      }
      if (feature instanceof JungleTreeFeature) {
        return { type: 'jungleTree', settings: feature.settings }
      }
      if (feature instanceof MegaTreeFeature) {
        return { type: 'megaTree', settings: feature.settings }
      }
      if (feature instanceof FlowerPatchFeature) {
        return { type: 'flowerPatch', settings: feature.settings }
      }
      if (feature instanceof RiverbankMudFeature) {
        return { type: 'riverbankMud', settings: feature.settings }
      }
      if (feature instanceof JungleFernFeature) {
        return { type: 'jungleFern', settings: feature.settings }
      }
      if (feature instanceof RiverbankClayFeature) {
        return { type: 'riverbankClay', settings: feature.settings }
      }
      if (feature instanceof CattailFeature) {
        return { type: 'cattail', settings: feature.settings }
      }
      if (feature instanceof PineTreeFeature) {
        return { type: 'pineTree', settings: feature.settings }
      }
      if (feature instanceof GiantConiferFeature) {
        return { type: 'giantConifer', settings: feature.settings }
      }
      if (feature instanceof VolcanoConeFeature) {
        return { type: 'volcanoCone', settings: feature.settings }
      }
      if (feature instanceof BoulderFeature) {
        return { type: 'boulder', settings: feature.settings }
      }
      if (feature instanceof TallFernFeature) {
        return { type: 'tallFern', settings: feature.settings }
      }
      if (feature instanceof FallenPineLogFeature) {
        return { type: 'fallenPineLog', settings: feature.settings }
      }
      if (feature instanceof PineStumpFeature) {
        return { type: 'pineStump', settings: feature.settings }
      }
      if (feature instanceof BerryBushFeature) {
        return { type: 'berryBush', settings: feature.settings }
      }
      if (feature instanceof GeyserFeature) {
        return { type: 'geyser', settings: feature.settings }
      }
      if (feature instanceof MorelFeature) {
        return { type: 'morel', settings: feature.settings }
      }
      if (feature instanceof BearDenFeature) {
        return { type: 'bearDen', settings: feature.settings }
      }
      if (feature instanceof AbandonedCabinFeature) {
        return { type: 'abandonedCabin', settings: feature.settings }
      }
      if (feature instanceof HuntersCampFeature) {
        return { type: 'huntersCamp', settings: feature.settings }
      }
      if (feature instanceof BasaltColumnsFeature) {
        return { type: 'basaltColumns', settings: feature.settings }
      }
      if (feature instanceof CharredMiningCampFeature) {
        return { type: 'charredMiningCamp', settings: feature.settings }
      }

      // Hell: Molten Wastes
      if (feature instanceof InferniumOreFeature) {
        return { type: 'inferniumOre', settings: feature.settings }
      }

      // Hell: The Ossuary
      if (feature instanceof FossilFeature) {
        return { type: 'ossuaryFossil', settings: feature.settings }
      }
      if (feature instanceof BoneSpireFeature) {
        return { type: 'ossuaryBoneSpire', settings: feature.settings }
      }
      if (feature instanceof OssuaryScatterFeature) {
        return { type: 'ossuaryScatter', settings: feature.settings }
      }

      // Hell: Ember Grove
      if (feature instanceof GiantFungusFeature) {
        return { type: 'giantFungus', settings: feature.settings }
      }
      if (feature instanceof EmberFloorFeature) {
        return { type: 'emberFloor', settings: feature.settings }
      }

      // Hell: Crystal Abyss
      if (feature instanceof CrystalSpireFeature) {
        return { type: 'crystalSpire', settings: feature.settings }
      }
      if (feature instanceof CrystalGeodeFeature) {
        return { type: 'crystalGeode', settings: feature.settings }
      }
      if (feature instanceof AbyssIslandFeature) {
        return { type: 'abyssIsland', settings: feature.settings }
      }
      if (feature instanceof CrystalScatterFeature) {
        return { type: 'crystalScatter', settings: feature.settings }
      }
      if (feature instanceof CrystalCoreFeature) {
        return { type: 'crystalCore', settings: feature.settings }
      }

      // Hell: Cocytus
      if (feature instanceof FrozenLakeFeature) {
        return { type: 'frozenLake', settings: feature.settings }
      }
      if (feature instanceof IceSpireFeature) {
        return { type: 'iceSpire', settings: feature.settings }
      }
      if (feature instanceof FrozenLavafallFeature) {
        return { type: 'frozenLavafall', settings: feature.settings }
      }
      if (feature instanceof FrostCrystalFeature) {
        return { type: 'frostCrystal', settings: feature.settings }
      }

      // Dungeons (procedural castles)
      if (feature instanceof ProceduralDungeonFeature) {
        return { type: 'proceduralDungeon', settings: feature.config }
      }

      throw new Error(`Unknown feature type: ${feature.constructor.name}`)
    })

    return {
      name: props.name,
      treeDensity: props.treeDensity,
      features,
      caves: props.caves,
      water: props.water,
      terrainConfig: props.terrainConfig,
      skylightValue: props.skylightValue ?? 15,
    }
  }

  /**
   * Create BiomeBlendData for a chunk, including adjacent biome configs for blending.
   *
   * @param chunkX - Chunk X coordinate
   * @param chunkZ - Chunk Z coordinate
   * @param layer - Vertical layer (0 = underground, 1 = surface). Defaults to 1.
   */
  getBlendDataForChunk(chunkX: number, chunkZ: number, layer: 0 | 1 = 1): BiomeBlendData {
    const { localX, localZ } = biomeRegistry.getLocalChunkCoords(chunkX, chunkZ)
    const { regionX, regionZ } = biomeRegistry.getRegionCoords(chunkX, chunkZ)

    // Get primary biome for this layer
    const primaryType = biomeRegistry.selectBiomeForLayer(regionX, regionZ, this.config.seed, layer)
    const primary = this.getWorkerBiomeConfig(primaryType)

    // Get adjacent biomes for blending (cardinal directions) - same layer
    const northType = biomeRegistry.selectBiomeForLayer(regionX, regionZ - 1, this.config.seed, layer)
    const southType = biomeRegistry.selectBiomeForLayer(regionX, regionZ + 1, this.config.seed, layer)
    const westType = biomeRegistry.selectBiomeForLayer(regionX - 1, regionZ, this.config.seed, layer)
    const eastType = biomeRegistry.selectBiomeForLayer(regionX + 1, regionZ, this.config.seed, layer)

    // Get diagonal corner biomes for proper corner blending - same layer
    const northeastType = biomeRegistry.selectBiomeForLayer(regionX + 1, regionZ - 1, this.config.seed, layer)
    const northwestType = biomeRegistry.selectBiomeForLayer(regionX - 1, regionZ - 1, this.config.seed, layer)
    const southeastType = biomeRegistry.selectBiomeForLayer(regionX + 1, regionZ + 1, this.config.seed, layer)
    const southwestType = biomeRegistry.selectBiomeForLayer(regionX - 1, regionZ + 1, this.config.seed, layer)

    return {
      primary,
      north: northType !== primaryType ? this.getWorkerBiomeConfig(northType) : undefined,
      south: southType !== primaryType ? this.getWorkerBiomeConfig(southType) : undefined,
      west: westType !== primaryType ? this.getWorkerBiomeConfig(westType) : undefined,
      east: eastType !== primaryType ? this.getWorkerBiomeConfig(eastType) : undefined,
      northeast: northeastType !== primaryType ? this.getWorkerBiomeConfig(northeastType) : undefined,
      northwest: northwestType !== primaryType ? this.getWorkerBiomeConfig(northwestType) : undefined,
      southeast: southeastType !== primaryType ? this.getWorkerBiomeConfig(southeastType) : undefined,
      southwest: southwestType !== primaryType ? this.getWorkerBiomeConfig(southwestType) : undefined,
      chunkLocalX: localX,
      chunkLocalZ: localZ,
    }
  }

  /**
   * Update generation based on player position.
   * Call once per frame from game loop.
   *
   * @param playerX - Player world X position
   * @param playerZ - Player world Z position
   * @param playerY - Player world Y position
   */
  update(playerX: number, playerZ: number, playerY: number = 0): void {
    this.updateQueue(playerX, playerZ, playerY)
    this.processSubChunkQueue()
    this.processFeatureWork()
  }

  /**
   * Per-frame streaming work outside the generation queue: individual
   * sub-chunk unloads (a few per call). Call once per frame - during gameplay
   * too (the 'world-generation-queue' task), not only while loading.
   *
   * (There is no cross-chunk water pass: the worker's WaterFeature fills every
   * column whose blended base height lies below the water level, independently
   * of its neighbours, so lakes are continuous across borders already. A
   * main-thread pass that "propagated" water into neighbours filled every air
   * cell above the highest solid block of each target sub-chunk - cave
   * pockets reaching a sub-chunk's top face were flooded far above the
   * designed cave flood level. Runtime liquid physics handles real flow.)
   */
  processFeatureWork(): void {
    this.processDeferredColumnUnloads()
    this.processSubChunkUnloads()
  }

  /**
   * Update the generation queue based on player position.
   * Does NOT process the queue - use processNextSubChunk() for that.
   * Call this every frame to keep the queue up to date.
   */
  updateQueue(playerX: number, playerZ: number, playerY: number = 0): void {
    // Convert to chunk coordinates
    const playerChunk = worldToChunk({
      x: BigInt(Math.floor(playerX)),
      y: 0n,
      z: BigInt(Math.floor(playerZ)),
    })

    // Calculate player's sub-chunk Y index
    const newPlayerSubY = Math.floor(Math.max(0, playerY) / SUB_CHUNK_HEIGHT)
    const clampedPlayerSubY = Math.min(newPlayerSubY, SUB_CHUNK_COUNT - 1)

    const chunkChanged =
      playerChunk.x !== this.playerChunkX ||
      playerChunk.z !== this.playerChunkZ

    const subYChanged = clampedPlayerSubY !== this.playerSubY

    // Capture the previous center before overwriting - needed for incremental updates.
    const prevCenter = this.getLoadCenter()
    const wasInitialized = this.initialized

    this.playerChunkX = playerChunk.x
    this.playerChunkZ = playerChunk.z
    this.playerSubY = clampedPlayerSubY
    this.playerWorldY = playerY
    const cavern = this.playerInCavern ? playerY < this.cavernExitY : playerY < this.cavernCeilingY
    const cavernChanged = cavern !== this.playerInCavern
    this.playerInCavern = cavern
    const ground = this.computeGroundSubY()
    const groundChanged = ground !== this.playerGroundSubY
    this.playerGroundSubY = ground

    // Update queue on first call or when player moves to new chunk/sub-chunk
    if (!wasInitialized || chunkChanged || subYChanged || groundChanged || cavernChanged) {
      this.initialized = true
      // First initialization does a full rebuild; subsequent crosses update incrementally.
      this.updateSubChunkQueue(wasInitialized ? prevCenter : null)
      this.unloadDistantChunks()
    }
  }

  /**
   * Force a refresh of chunk loading based on current config.
   * Call this after changing chunkDistance to apply changes immediately.
   */
  refreshChunks(): void {
    if (!this.initialized) return
    // chunkDistance may have changed - do a full rebuild rather than an incremental diff.
    this.updateSubChunkQueue(null)
    this.unloadDistantChunks()
  }

  /**
   * Generate spiral coordinates from center outward.
   * Yields {dx, dz, distance} for each position.
   */
  private *spiralCoordinates(
    radius: number
  ): Generator<{ dx: number; dz: number; distance: number }> {
    // Start at center
    yield { dx: 0, dz: 0, distance: 0 }

    // Spiral outward
    for (let r = 1; r <= radius; r++) {
      // Top edge (left to right)
      for (let dx = -r; dx <= r; dx++) {
        yield { dx, dz: -r, distance: r }
      }
      // Right edge (top to bottom, excluding corners)
      for (let dz = -r + 1; dz <= r - 1; dz++) {
        yield { dx: r, dz, distance: r }
      }
      // Bottom edge (right to left)
      for (let dx = r; dx >= -r; dx--) {
        yield { dx, dz: r, distance: r }
      }
      // Left edge (bottom to top, excluding corners)
      for (let dz = r - 1; dz >= -r + 1; dz--) {
        yield { dx: -r, dz, distance: r }
      }
    }
  }

  /**
   * Unload columns that left the load set (with hysteresis), and schedule
   * resident sub-chunks of the remaining columns that left it for individual
   * unloading (processSubChunkUnloads).
   *
   * A sub-chunk keeps its generated flag while it is resident: clearing it
   * used to re-queue it on the next vertical move, and regenerating a
   * resident sub-chunk overwrote its live data (unsaved player edits
   * included). An individually unloaded sub-chunk is saved first and its
   * flag cleared, so it comes back from persistence.
   */
  private unloadDistantChunks(): void {
    const center = this.getLoadCenter()
    const loadedColumns = this.world.getLoadedColumns()

    for (const column of loadedColumns) {
      const dx = Number(column.coordinate.x - center.x)
      const dz = Number(column.coordinate.z - center.z)
      if (this.isColumnInRange(dx, dz, UNLOAD_HYSTERESIS_CHUNKS)) continue
      const key = columnKey(Number(column.coordinate.x), Number(column.coordinate.z))
      if (this.decoratingColumns.has(key)) {
        this.deferredColumnUnloads.add(key) // after its decoration pass
        continue
      }
      this.unloadColumn(column.coordinate)
    }

    this.collectUnwantedSubChunks(center)

    // Forget band estimates for columns well outside the load set
    const keepDistance = this.config.getUnloadDistance() + 1
    const keepDist2 = keepDistance * keepDistance
    const centerX = Number(center.x)
    const centerZ = Number(center.z)
    for (const key of this.surfaceBandEstimates.keys()) {
      const dx = columnKeyX(key) - centerX
      const dz = columnKeyZ(key) - centerZ
      if (dx * dx + dz * dz > keepDist2) {
        this.surfaceBandEstimates.delete(key)
      }
    }
  }

  /** Unload a column that left the load set and clear its bookkeeping. */
  private unloadColumn(coordinate: IChunkCoordinate): void {
    this.world.unloadChunk(coordinate)
    this.openSubChunks.delete(columnKey(Number(coordinate.x), Number(coordinate.z)))
    this.topRowSubChunks.delete(columnKey(Number(coordinate.x), Number(coordinate.z)))
    this.deferredColumnUnloads.delete(columnKey(Number(coordinate.x), Number(coordinate.z)))
    for (const listener of this.columnUnloadedListeners) listener(coordinate)

    // Clear sub-chunk bookkeeping for this column. In-flight generation jobs
    // keep their generating mark (no second request while one is in flight)
    // but are cancelled: their results are discarded on arrival.
    for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
      const subKey = createSubChunkKey(coordinate.x, coordinate.z, subY)
      this.generatedSubChunks.delete(subKey)
      if (this.generatingSubChunks.has(subKey)) this.cancelledSubChunks.add(subKey)
    }
  }

  /**
   * Columns whose unload waited for a decoration pass: unload them once no
   * pass runs there any more, if they are still out of range.
   */
  private processDeferredColumnUnloads(): void {
    if (this.deferredColumnUnloads.size === 0) return
    const center = this.getLoadCenter()
    for (const key of Array.from(this.deferredColumnUnloads)) {
      if (this.decoratingColumns.has(key)) continue
      this.deferredColumnUnloads.delete(key)
      const coordinate: IChunkCoordinate = { x: BigInt(columnKeyX(key)), z: BigInt(columnKeyZ(key)) }
      if (!this.world.getChunkColumn(coordinate)) continue
      if (this.isColumnInRange(Number(coordinate.x - center.x), Number(coordinate.z - center.z), UNLOAD_HYSTERESIS_CHUNKS)) continue
      this.unloadColumn(coordinate)
    }
  }

  // ==================== Sub-chunk unloading ====================

  /**
   * Queue the resident sub-chunks of in-range columns that are no longer
   * retained (e.g. Hell after returning to the surface, sky sub-chunks after
   * flying high) for individual unloading.
   */
  private collectUnwantedSubChunks(center: LoadCenter): void {
    for (const column of this.world.getLoadedColumns()) {
      const dx = Number(column.coordinate.x - center.x)
      const dz = Number(column.coordinate.z - center.z)
      let band: SubYRange | null | undefined
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        if (!column.getSubChunk(subY)?.lightReady) continue
        band ??= this.getColumnBand(Number(column.coordinate.x), Number(column.coordinate.z), center)
        if (this.isSubChunkRetained(dx, dz, subY, center, band)) continue
        this.subChunksToUnload.add(createSubChunkKey(column.coordinate.x, column.coordinate.z, subY))
      }
    }
  }

  /**
   * Whether a loaded sub-chunk stays resident: it is wanted, in its column's
   * surface band, in the cavern while the camera is (columns within the
   * unload hysteresis), or inside the vertical ellipsoid widened by the unload
   * hysteresis (horizontally, as for columns) plus
   * VERTICAL_UNLOAD_HYSTERESIS_SUB_CHUNKS - so moving back and forth across a
   * sub-chunk boundary doesn't unload and reload a layer each time.
   */
  private isSubChunkRetained(dx: number, dz: number, subY: number, center: LoadCenter, band: SubYRange | null): boolean {
    if (isInBand(band, subY)) return true
    if (center.cavern && subY <= this.cavernTopSubY && this.isColumnInRange(dx, dz, UNLOAD_HYSTERESIS_CHUNKS)) return true
    if (this.isSubChunkWanted(dx, dz, subY, center, band, 0)) return true
    const distance = this.config.chunkDistance + UNLOAD_HYSTERESIS_CHUNKS
    const vertical = this.config.getVerticalDistance() + VERTICAL_UNLOAD_HYSTERESIS_SUB_CHUNKS
    return this.inEllipsoid(dx, dz, subY - center.subY, distance, vertical) ||
      (center.groundSubY !== null && subY <= center.groundSubY &&
        this.inEllipsoid(dx, dz, subY - center.groundSubY, distance, GROUND_ELLIPSOID_DEPTH_SUB_CHUNKS + VERTICAL_UNLOAD_HYSTERESIS_SUB_CHUNKS))
  }

  /** Inside the ellipsoid of horizontal radius `distance` (chunks) and vertical radius `vertical` (sub-chunks)? */
  private inEllipsoid(dx: number, dz: number, dy: number, distance: number, vertical: number): boolean {
    const scaledDy = dy * (distance / vertical)
    return dx * dx + dz * dz + scaledDy * scaledDy <= distance * distance
  }

  /** See LoadCenter.groundSubY. */
  private computeGroundSubY(): number | null {
    if (this.playerInCavern || this.playerSubY < LAYER_BOUNDARY_SUB_CHUNK) return null
    const band = this.getSurfaceBand(Number(this.playerChunkX), Number(this.playerChunkZ))
    const ground = Math.max(LAYER_BOUNDARY_SUB_CHUNK, Math.floor(band.minY / SUB_CHUNK_HEIGHT))
    return ground < this.playerSubY ? ground : null
  }

  /**
   * Unload up to `max` queued sub-chunks that are still not retained (the
   * player may have come back). Each is saved, taken out of the light engine
   * and meshes by WorldManager.unloadSubChunk, and loses its generated flag so
   * it is requested again - from persistence - when wanted. Called every frame
   * through processFeatureWork().
   */
  processSubChunkUnloads(max = MAX_SUB_CHUNK_UNLOADS_PER_FRAME): void {
    if (this.subChunksToUnload.size === 0) return
    const center = this.getLoadCenter()
    let unloaded = 0
    for (const key of this.subChunksToUnload) {
      if (unloaded >= max) break
      this.subChunksToUnload.delete(key)
      // A job still running for it (its decorations) owns it until done
      if (this.generatingSubChunks.has(key)) continue
      const coordinate = parseSubChunkKey(key)
      const dx = Number(coordinate.x - center.x)
      const dz = Number(coordinate.z - center.z)
      if (!this.isColumnInRange(dx, dz, UNLOAD_HYSTERESIS_CHUNKS)) continue // its column goes as a whole
      const band = this.getColumnBand(Number(coordinate.x), Number(coordinate.z), center)
      if (this.isSubChunkRetained(dx, dz, coordinate.subY, center, band)) continue
      if (!this.world.unloadSubChunk(coordinate)) continue
      unloaded++
      this.setTopRowBit(Number(coordinate.x), Number(coordinate.z), coordinate.subY, false)
      this.generatedSubChunks.delete(key)
      for (const listener of this.subChunkUnloadedListeners) listener(coordinate)
    }
  }

  /** Listen for sub-chunks unloaded individually (their column stays). Returns an unsubscribe function. */
  onSubChunkUnloaded(listener: (coordinate: ISubChunkCoordinate) => void): () => void {
    this.subChunkUnloadedListeners.push(listener)
    return () => {
      const index = this.subChunkUnloadedListeners.indexOf(listener)
      if (index !== -1) this.subChunkUnloadedListeners.splice(index, 1)
    }
  }

  // ==================== Load set ====================

  /**
   * Set (or clear) the exact surface band source. Columns it has no data for
   * fall back to the biome-height estimate.
   */
  setSurfaceBandProvider(provider: SurfaceBandProvider | null): void {
    this.surfaceBandProvider = provider
  }

  /**
   * Re-evaluate one column's load set after its surface band changed (e.g.
   * its LOD tile arrived) and queue any newly wanted sub-chunks.
   */
  refreshSurfaceBand(chunkX: number, chunkZ: number): void {
    this.surfaceBandEstimates.delete(columnKey(chunkX, chunkZ))
    // The player's column: the ground ellipsoid may move (affects every column)
    if (this.initialized && BigInt(chunkX) === this.playerChunkX && BigInt(chunkZ) === this.playerChunkZ) {
      const ground = this.computeGroundSubY()
      if (ground !== this.playerGroundSubY) {
        const prevCenter = this.getLoadCenter()
        this.playerGroundSubY = ground
        this.updateSubChunkQueue(prevCenter)
        this.unloadDistantChunks()
      }
    }
    this.queueNewlyWanted(chunkX, chunkZ)
    // Its neighbours' bands reach up to its top too (see getColumnBand)
    for (const [ox, oz] of BAND_NEIGHBOR_OFFSETS) this.queueNewlyWanted(chunkX + ox, chunkZ + oz)
  }

  /**
   * Lowest sub-chunk a column's surface band reaches, starting from the band
   * bottom `subY`: while that sub-chunk is loaded and has a column holding no
   * ground block (a ravine or cave mouth, dry or flooded, cutting below it),
   * the band goes one sub-chunk deeper - otherwise columns outside the
   * vertical range, which load only their band, would show a hole where the
   * cut's floor never loads.
   */
  getSurfaceBandFloor(chunkX: number, chunkZ: number, subY: number): number {
    const open = this.openSubChunks.get(columnKey(chunkX, chunkZ))
    if (open === undefined) return subY
    let floor = subY
    while (floor > LAYER_BOUNDARY_SUB_CHUNK && (open & (1 << floor)) !== 0) floor--
    return floor
  }

  /** Queue the sub-chunks of one column that are wanted but not loaded, queued or generating. */
  private queueNewlyWanted(chunkX: number, chunkZ: number): void {
    if (!this.initialized) return

    const center = this.getLoadCenter()
    const columnX = BigInt(chunkX)
    const columnZ = BigInt(chunkZ)
    const dx = Number(columnX - center.x)
    const dz = Number(columnZ - center.z)
    if (!this.isColumnInRange(dx, dz, 0)) return

    const band = this.getColumnBand(chunkX, chunkZ, center)
    let addedAny = false
    for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
      if (!this.isSubChunkWanted(dx, dz, subY, center, band, 0)) continue
      const key = createSubChunkKey(columnX, columnZ, subY)
      if (
        this.generatedSubChunks.has(key) ||
        this.generatingSubChunks.has(key) ||
        this.queuedSubChunkKeys.has(key)
      ) {
        continue
      }
      const subCoord: ISubChunkCoordinate = { x: columnX, z: columnZ, subY }
      this.subChunkQueue.push({ coordinate: subCoord, priority: this.calculateSubChunkPriority(subCoord, isInBand(band, subY)) })
      this.queuedSubChunkKeys.add(key)
      addedAny = true
    }
    if (addedAny) {
      this.subChunkQueue.sort((a, b) => a.priority - b.priority)
    }
  }

  /**
   * Listen for sub-chunks whose generated (or saved) data was just applied to
   * the world - before main-thread decorations, and before any mesh built
   * from that data can arrive. Returns an unsubscribe function.
   */
  onSubChunkApplied(listener: (coordinate: ISubChunkCoordinate) => void): () => void {
    this.subChunkAppliedListeners.push(listener)
    return () => {
      const index = this.subChunkAppliedListeners.indexOf(listener)
      if (index !== -1) this.subChunkAppliedListeners.splice(index, 1)
    }
  }

  /** Listen for columns unloaded by the load rule. Returns an unsubscribe function. */
  onColumnUnloaded(listener: (coordinate: IChunkCoordinate) => void): () => void {
    this.columnUnloadedListeners.push(listener)
    return () => {
      const index = this.columnUnloadedListeners.indexOf(listener)
      if (index !== -1) this.columnUnloadedListeners.splice(index, 1)
    }
  }

  /**
   * A sub-chunk's data was applied: record whether it has open columns (see
   * getSurfaceBandFloor), load deeper if that lowers its column's band floor,
   * and tell the listeners. Runs before decorations, which only add blocks.
   */
  private onSubChunkDataApplied(coordinate: ISubChunkCoordinate, blocks: Uint16Array): void {
    if (coordinate.subY >= LAYER_BOUNDARY_SUB_CHUNK) {
      this.recordTopRow(Number(coordinate.x), Number(coordinate.z), coordinate.subY, blocks)
    }
    if (coordinate.subY > LAYER_BOUNDARY_SUB_CHUNK) {
      this.groundBlocks ??= buildGroundBlockLookup()
      const chunkX = Number(coordinate.x)
      const chunkZ = Number(coordinate.z)
      const key = columnKey(chunkX, chunkZ)
      const bits = this.openSubChunks.get(key) ?? 0
      const bit = 1 << coordinate.subY
      const open = hasOpenColumn(blocks, this.groundBlocks)
      if (open !== ((bits & bit) !== 0)) {
        const center = this.getLoadCenter()
        const before = this.getColumnBand(chunkX, chunkZ, center)
        this.openSubChunks.set(key, open ? bits | bit : bits & ~bit)
        const after = this.getColumnBand(chunkX, chunkZ, center)
        if (before && after && after.lo < before.lo) this.queueNewlyWanted(chunkX, chunkZ)
      }
    }
    for (const listener of this.subChunkAppliedListeners) listener(coordinate)
  }

  /**
   * Record whether a loaded sub-chunk has a block in its top row, loading the
   * sub-chunk above it (and the matching layer of the neighbour columns) if
   * that raises the column's band top.
   */
  private recordTopRow(chunkX: number, chunkZ: number, subY: number, blocks: Uint16Array): void {
    let occupied = false
    for (let i = SUB_CHUNK_TOP_ROW_START; i < blocks.length; i++) {
      if (blocks[i] !== BlockIds.AIR) {
        occupied = true
        break
      }
    }
    this.setTopRowBit(chunkX, chunkZ, subY, occupied)
  }

  private setTopRowBit(chunkX: number, chunkZ: number, subY: number, occupied: boolean): void {
    const key = columnKey(chunkX, chunkZ)
    const bits = this.topRowSubChunks.get(key) ?? 0
    const bit = 1 << subY
    if (occupied === ((bits & bit) !== 0)) return
    const before = this.getColumnTopY(chunkX, chunkZ)
    const next = occupied ? bits | bit : bits & ~bit
    if (next === 0) this.topRowSubChunks.delete(key)
    else this.topRowSubChunks.set(key, next)
    if (this.getColumnTopY(chunkX, chunkZ) > before) {
      this.queueNewlyWanted(chunkX, chunkZ)
      for (const [ox, oz] of BAND_NEIGHBOR_OFFSETS) this.queueNewlyWanted(chunkX + ox, chunkZ + oz)
    }
  }

  /**
   * After a sub-chunk's decorations ran: they write into it and spill into the
   * sub-chunks around it - re-check the top rows of the loaded ones.
   */
  private recordTopRowsAround(coordinate: ISubChunkCoordinate): void {
    const chunkX = Number(coordinate.x)
    const chunkZ = Number(coordinate.z)
    for (let subY = coordinate.subY; subY <= Math.min(SUB_CHUNK_COUNT - 1, coordinate.subY + 1); subY++) {
      if (subY < LAYER_BOUNDARY_SUB_CHUNK) continue
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sub = this.world.getSubChunk({ x: BigInt(chunkX + dx), z: BigInt(chunkZ + dz), subY })
          if (sub?.lightReady) this.recordTopRow(chunkX + dx, chunkZ + dz, subY, sub.getBlockData())
        }
      }
    }
  }

  /**
   * Highest Y whose cell may hold a block of the column's surface: its own
   * band top, or the top row of its highest loaded sub-chunk that has a block
   * there (see topRowSubChunks).
   */
  private getColumnTopY(chunkX: number, chunkZ: number): number {
    const bandTop = this.getSurfaceBand(chunkX, chunkZ).maxY
    const bits = this.topRowSubChunks.get(columnKey(chunkX, chunkZ))
    if (bits === undefined) return bandTop
    const highest = 31 - Math.clz32(bits)
    return Math.max(bandTop, highest * SUB_CHUNK_HEIGHT + SUB_CHUNK_HEIGHT - 1)
  }

  private getLoadCenter(): LoadCenter {
    return {
      x: this.playerChunkX,
      z: this.playerChunkZ,
      subY: this.playerSubY,
      groundSubY: this.playerGroundSubY,
      cavern: this.playerInCavern,
    }
  }

  /** True if a column at chunk offset (dx, dz) is within load distance + slack. */
  private isColumnInRange(dx: number, dz: number, slack: number): boolean {
    const distance = this.config.chunkDistance + slack
    return dx * dx + dz * dz <= distance * distance
  }

  /**
   * The single load rule shared by queueing (slack 0) and unloading (slack =
   * hysteresis). A sub-chunk is wanted when its column is in horizontal range
   * AND it lies inside the vertical ellipsoid around the player OR inside the
   * column's surface band OR - while the camera is in the Hell cavern - inside
   * the cavern (layer 0 and the ceiling's sub-chunk). The band guarantee
   * matters for edge columns: the ellipsoid narrows to the player's own
   * sub-chunk there, which on uneven terrain misses the ground entirely. The
   * cavern's floor (dungeons, chasms) and ceiling are in view across the
   * whole disk the same way.
   */
  private isSubChunkWanted(
    dx: number,
    dz: number,
    subY: number,
    center: LoadCenter,
    band: SubYRange | null,
    slack: number
  ): boolean {
    const distance = this.config.chunkDistance + slack
    const maxDist2 = distance * distance
    const horizontalDist2 = dx * dx + dz * dz
    if (horizontalDist2 > maxDist2) return false
    if (center.cavern && subY <= this.cavernTopSubY) return true

    // Ellipsoid: Y is scaled so the vertical radius is getVerticalDistance()
    // (around the camera, and around the ground under it while flying)
    const yScale = this.config.chunkDistance / this.config.getVerticalDistance()
    const scaledDy = (subY - center.subY) * yScale
    if (horizontalDist2 + scaledDy * scaledDy <= maxDist2) return true
    if (center.groundSubY !== null && subY <= center.groundSubY) {
      const groundDy = (subY - center.groundSubY) * (this.config.chunkDistance / GROUND_ELLIPSOID_DEPTH_SUB_CHUNKS)
      if (horizontalDist2 + groundDy * groundDy <= maxDist2) return true
    }

    return isInBand(band, subY)
  }

  /**
   * Sub-chunk range of a column's surface band, or null while the camera is
   * in the Hell cavern (the surface is out of sight from there).
   *
   * The top reaches the sub-chunk holding the air cell above the highest
   * surface block (getColumnTopY: tile/estimate band, plus decorations seen
   * in loaded top rows) of the column AND of its four neighbours. The mesher culls
   * faces toward a missing neighbour sub-chunk, so without the sub-chunk
   * above a top block in a sub-chunk's top row, or the neighbour column's
   * sub-chunk beside a cliff that rises above that neighbour's own band, those
   * faces never appear where only bands load (the disk edge, and everywhere
   * when flying high) - the terrain shows holes toward the sky.
   */
  private getColumnBand(chunkX: number, chunkZ: number, center: LoadCenter): SubYRange | null {
    if (center.cavern) return null
    const band = this.getSurfaceBand(chunkX, chunkZ)
    const lo = Math.max(LAYER_BOUNDARY_SUB_CHUNK, Math.floor(band.minY / SUB_CHUNK_HEIGHT))
    let top = this.getColumnTopY(chunkX, chunkZ)
    for (const [ox, oz] of BAND_NEIGHBOR_OFFSETS) top = Math.max(top, this.getColumnTopY(chunkX + ox, chunkZ + oz))
    return {
      lo: this.getSurfaceBandFloor(chunkX, chunkZ, lo),
      hi: Math.min(SUB_CHUNK_COUNT - 1, Math.floor((top + 1) / SUB_CHUNK_HEIGHT)),
    }
  }

  /** A column's own surface band: exact (provider) or estimated. */
  private getSurfaceBand(chunkX: number, chunkZ: number): SurfaceBand {
    return this.surfaceBandProvider?.(chunkX, chunkZ) ?? this.estimateSurfaceBand(chunkX, chunkZ)
  }

  /**
   * Estimate a column's surface band from the (unblended) biome heights at
   * its corners and centre. Inside a blend zone the neighbouring region's
   * biome is sampled too - blended height always lies between the
   * contributing biomes' heights.
   */
  private estimateSurfaceBand(chunkX: number, chunkZ: number): SurfaceBand {
    const key = columnKey(chunkX, chunkZ)
    const cached = this.surfaceBandEstimates.get(key)
    if (cached) return cached

    const { regionX, regionZ } = biomeRegistry.getRegionCoords(chunkX, chunkZ)
    const { localX, localZ } = biomeRegistry.getLocalChunkCoords(chunkX, chunkZ)
    // Nearest block distance from this chunk to each region edge
    const toWest = localX * CHUNK_SIZE_X
    const toEast = BIOME_REGION_SIZE_BLOCKS - (localX + 1) * CHUNK_SIZE_X
    const toNorth = localZ * CHUNK_SIZE_Z
    const toSouth = BIOME_REGION_SIZE_BLOCKS - (localZ + 1) * CHUNK_SIZE_Z
    const offsetsX = [0]
    const offsetsZ = [0]
    if (toWest < BLEND_DISTANCE) offsetsX.push(-1)
    if (toEast < BLEND_DISTANCE) offsetsX.push(1)
    if (toNorth < BLEND_DISTANCE) offsetsZ.push(-1)
    if (toSouth < BLEND_DISTANCE) offsetsZ.push(1)

    const biomes = new Set<BiomeType>()
    for (const ox of offsetsX) {
      for (const oz of offsetsZ) {
        biomes.add(biomeRegistry.selectBiomeForLayer(regionX + ox, regionZ + oz, this.config.seed, 1))
      }
    }

    const worldX = chunkX * CHUNK_SIZE_X
    const worldZ = chunkZ * CHUNK_SIZE_Z
    const last = CHUNK_SIZE_X - 1
    const samples: ReadonlyArray<readonly [number, number]> = [
      [0, 0], [last, 0], [0, last], [last, last], [CHUNK_SIZE_X >> 1, CHUNK_SIZE_Z >> 1],
    ]
    let minHeight = Infinity
    let maxHeight = -Infinity
    for (const biome of biomes) {
      const generator = this.getGeneratorForBiome(biome)
      for (const [sx, sz] of samples) {
        const height = generator.getHeightAt(worldX + sx, worldZ + sz)
        if (height < minHeight) minHeight = height
        if (height > maxHeight) maxHeight = height
      }
    }

    const band: SurfaceBand = {
      minY: Math.max(0, minHeight - SURFACE_BAND_ESTIMATE_BELOW),
      maxY: Math.min(SUB_CHUNK_COUNT * SUB_CHUNK_HEIGHT - 1, maxHeight + SURFACE_BAND_ESTIMATE_ABOVE),
    }
    this.surfaceBandEstimates.set(key, band)
    return band
  }

  /**
   * Get current configuration.
   */
  getConfig(): GenerationConfig {
    return this.config
  }

  /**
   * Set the persistence manager for loading saved chunks.
   */
  setPersistenceManager(manager: PersistenceManager): void {
    this.persistenceManager = manager
  }

  /**
   * Force regeneration of all sub-chunks (e.g., after seed change).
   */
  reset(): void {
    this.subChunkQueue.length = 0
    this.queuedSubChunkKeys.clear()
    this.generatingSubChunks.clear()
    this.generatedSubChunks.clear()
    this.initialized = false
  }

  /**
   * Get the number of sub-chunks waiting to be generated.
   */
  getQueuedCount(): number {
    return this.subChunkQueue.length
  }

  /**
   * Get the number of sub-chunks currently generating.
   */
  getGeneratingCount(): number {
    return this.generatingSubChunks.size
  }

  /**
   * Get the number of sub-chunks that have been generated.
   */
  getGeneratedCount(): number {
    return this.generatedSubChunks.size
  }

  /**
   * Get the number of unique chunk columns that have at least one generated sub-chunk.
   */
  getGeneratedChunkColumnCount(): number {
    const columns = new Set<string>()
    for (const key of this.generatedSubChunks) {
      // SubChunkKey format is "x,z,subY" - extract "x,z" as column key
      const lastComma = key.lastIndexOf(',')
      const columnKey = key.substring(0, lastComma)
      columns.add(columnKey)
    }
    return columns.size
  }

  /**
   * Calculate 3D priority for a sub-chunk based on distance from player.
   * Prioritizes sub-chunks near the player's Y position, and surface-band
   * sub-chunks by horizontal distance alone so every column's visible ground
   * loads before the rest of the column.
   */
  private calculateSubChunkPriority(subCoord: ISubChunkCoordinate, inSurfaceBand: boolean): number {
    const dx = Number(subCoord.x - this.playerChunkX)
    const dz = Number(subCoord.z - this.playerChunkZ)
    if (inSurfaceBand) {
      return Math.sqrt(dx * dx + dz * dz)
    }
    // Nearest of the two ellipsoid centres (camera, ground under it)
    let dy = subCoord.subY - this.playerSubY
    if (this.playerGroundSubY !== null && Math.abs(subCoord.subY - this.playerGroundSubY) < Math.abs(dy)) {
      dy = subCoord.subY - this.playerGroundSubY
    }

    // Weight Y distance slightly more for immediate visibility
    // This ensures sub-chunks at the player's eye level load first
    return Math.sqrt(dx * dx + dz * dz + dy * dy * 1.5)
  }

  /**
   * Update the sub-chunk generation queue based on current player position.
   * Membership follows isSubChunkWanted(): the vertical ellipsoid plus each
   * column's surface band.
   *
   * When `prevCenter` is null, rebuilds the queue from scratch (first init / config
   * change). Otherwise updates incrementally on a chunk-boundary cross: drops queued
   * entries that left range, enqueues only the newly-wanted ones (candidates that
   * were NOT wanted at prevCenter), and keeps overlap entries with their existing
   * priorities. This avoids re-scanning + re-keying the whole disk every cross.
   */
  private updateSubChunkQueue(prevCenter: LoadCenter | null): void {
    const horizontalDistance = this.config.chunkDistance
    const center = this.getLoadCenter()
    // Column bands are asked for several times per column in one pass (each
    // queued entry, current and previous centre): compute each once
    const bands = new Map<number, SubYRange | null>()
    const prevBands = new Map<number, SubYRange | null>()
    const bandOf = (chunkX: number, chunkZ: number, bandCenter: LoadCenter, memo: Map<number, SubYRange | null>): SubYRange | null => {
      const key = columnKey(chunkX, chunkZ)
      let band = memo.get(key)
      if (band === undefined) {
        band = this.getColumnBand(chunkX, chunkZ, bandCenter)
        memo.set(key, band)
      }
      return band
    }

    if (prevCenter === null) {
      // Full rebuild.
      this.subChunkQueue.length = 0
      this.queuedSubChunkKeys.clear()

      for (const coord of this.spiralCoordinates(horizontalDistance)) {
        if (!this.isColumnInRange(coord.dx, coord.dz, 0)) continue
        const chunkX = center.x + BigInt(coord.dx)
        const chunkZ = center.z + BigInt(coord.dz)
        const band = bandOf(Number(chunkX), Number(chunkZ), center, bands)

        for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
          if (!this.isSubChunkWanted(coord.dx, coord.dz, subY, center, band, 0)) continue

          const key = createSubChunkKey(chunkX, chunkZ, subY)
          if (this.generatedSubChunks.has(key) || this.generatingSubChunks.has(key)) continue

          const subCoord: ISubChunkCoordinate = { x: chunkX, z: chunkZ, subY }
          this.subChunkQueue.push({ coordinate: subCoord, priority: this.calculateSubChunkPriority(subCoord, isInBand(band, subY)) })
          this.queuedSubChunkKeys.add(key)
        }
      }

      this.subChunkQueue.sort((a, b) => a.priority - b.priority)
      return
    }

    // Incremental update.
    // Step 1: drop queued entries that are no longer wanted (keep the rest with priorities).
    let write = 0
    for (let i = 0; i < this.subChunkQueue.length; i++) {
      const entry = this.subChunkQueue[i]
      const { x, z, subY } = entry.coordinate
      const dx = Number(x - center.x)
      const dz = Number(z - center.z)
      const band = this.isColumnInRange(dx, dz, 0) ? bandOf(Number(x), Number(z), center, bands) : null
      if (this.isSubChunkWanted(dx, dz, subY, center, band, 0)) {
        this.subChunkQueue[write++] = entry
      } else {
        this.queuedSubChunkKeys.delete(createSubChunkKey(x, z, subY))
      }
    }
    this.subChunkQueue.length = write

    // Step 2: enqueue the newly-wanted sub-chunks (wanted now, but NOT at prevCenter).
    const shiftX = Number(center.x - prevCenter.x)
    const shiftZ = Number(center.z - prevCenter.z)
    let addedAny = false
    for (const coord of this.spiralCoordinates(horizontalDistance)) {
      if (!this.isColumnInRange(coord.dx, coord.dz, 0)) continue
      const chunkX = center.x + BigInt(coord.dx)
      const chunkZ = center.z + BigInt(coord.dz)
      const band = bandOf(Number(chunkX), Number(chunkZ), center, bands)
      // Offset of this column from the previous center
      const pdx = coord.dx + shiftX
      const pdz = coord.dz + shiftZ
      const prevBand = this.isColumnInRange(pdx, pdz, 0)
        ? bandOf(Number(chunkX), Number(chunkZ), prevCenter, prevBands)
        : null

      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        if (!this.isSubChunkWanted(coord.dx, coord.dz, subY, center, band, 0)) continue

        // Was it wanted at the previous center? If so it's an overlap - already handled.
        if (this.isSubChunkWanted(pdx, pdz, subY, prevCenter, prevBand, 0)) continue

        const key = createSubChunkKey(chunkX, chunkZ, subY)

        if (
          this.generatedSubChunks.has(key) ||
          this.generatingSubChunks.has(key) ||
          this.queuedSubChunkKeys.has(key)
        ) {
          continue
        }

        const subCoord: ISubChunkCoordinate = { x: chunkX, z: chunkZ, subY }
        this.subChunkQueue.push({ coordinate: subCoord, priority: this.calculateSubChunkPriority(subCoord, isInBand(band, subY)) })
        this.queuedSubChunkKeys.add(key)
        addedAny = true
      }
    }

    // Re-sort only if membership changed (removal preserves relative order).
    if (addedAny) {
      this.subChunkQueue.sort((a, b) => a.priority - b.priority)
    }
  }

  /**
   * Process queued sub-chunks (generate N per frame).
   */
  private processSubChunkQueue(): void {
    let started = 0

    while (started < this.subChunksPerFrame && this.subChunkQueue.length > 0) {
      const queued = this.subChunkQueue.shift()
      if (!queued) break

      const key = createSubChunkKey(
        queued.coordinate.x,
        queued.coordinate.z,
        queued.coordinate.subY
      )
      this.queuedSubChunkKeys.delete(key)

      // Double-check not already generating
      if (this.generatingSubChunks.has(key)) continue

      this.generatingSubChunks.add(key)

      // Start async generation (fire-and-forget)
      this.generateSubChunk(queued.coordinate, key)
      started++
    }
  }

  /**
   * Process a single sub-chunk from the queue.
   * Used by the task scheduler for budget-aware processing.
   * @returns true if more work remains in the queue
   */
  processNextSubChunk(): boolean {
    if (this.subChunkQueue.length === 0) return false

    const queued = this.subChunkQueue.shift()
    if (!queued) return this.subChunkQueue.length > 0

    const key = createSubChunkKey(
      queued.coordinate.x,
      queued.coordinate.z,
      queued.coordinate.subY
    )
    this.queuedSubChunkKeys.delete(key)

    // Skip if already generating
    if (this.generatingSubChunks.has(key)) {
      return this.subChunkQueue.length > 0
    }

    this.generatingSubChunks.add(key)

    // Start async generation (fire-and-forget)
    this.generateSubChunk(queued.coordinate, key)

    return this.subChunkQueue.length > 0
  }

  /**
   * Generate a single sub-chunk using worker for heavy computation.
   * First checks persistence for saved data.
   */
  private async generateSubChunk(
    coordinate: ISubChunkCoordinate,
    key: SubChunkKey
  ): Promise<void> {
    let failed = false
    let discarded = false
    try {
      const chunkX = Number(coordinate.x)
      const chunkZ = Number(coordinate.z)

      // Determine which vertical layer this sub-chunk belongs to
      const layer = getLayerForSubChunk(coordinate.subY)

      // Get biome data for the appropriate layer - needed for both loaded and generated chunks
      const biomeData = this.getBlendDataForChunk(chunkX, chunkZ, layer)

      // Check persistence first - load from storage if available
      if (this.persistenceManager) {
        const savedData = await this.persistenceManager.loadSubChunk(coordinate)
        if (savedData) {
          if (!this.isResultCurrent(coordinate, key)) {
            discarded = true
            return
          }
          // Saves older than persistence v3 lack the generation sky proof;
          // regenerate once (data discarded) just to recover it.
          let skyOpenAbove = savedData.skyOpenAbove
          if (skyOpenAbove === undefined) {
            skyOpenAbove = (await this.world.generateSubChunkInWorker(
              coordinate,
              this.config.seed,
              this.config.seaLevel,
              this.config.terrainThickness,
              coordinate.subY * SUB_CHUNK_HEIGHT,
              coordinate.subY * SUB_CHUNK_HEIGHT + SUB_CHUNK_HEIGHT - 1,
              biomeData
            )).light.skyOpenAbove
            if (!this.isResultCurrent(coordinate, key)) {
              discarded = true
              return
            }
          }

          // Its local light comes from a generation worker (light-only job),
          // like generated data; if that fails the light engine lights it
          // on the main thread. Pass the biome's skylight value for this
          // sub-chunk's layer.
          let lit: { lightData: Uint8Array | null; isFullyOpaque?: boolean; light: SubChunkLightInput } = { lightData: null, light: { skyOpenAbove } }
          try {
            lit = await this.world.lightSavedSubChunkInWorker(coordinate, savedData.blocks, savedData.metadata, skyOpenAbove, biomeData)
          } catch (error) {
            console.warn(`[WorldGenerator] Worker light for saved sub-chunk ${key} failed; lighting it here:`, error)
          }
          if (!this.isResultCurrent(coordinate, key)) {
            discarded = true
            return
          }
          await this.world.applySubChunkData(
            coordinate,
            savedData.blocks,
            lit.lightData,
            lit.isFullyOpaque,
            biomeData.primary.skylightValue,
            savedData.metadata,
            lit.light,
            // Unchanged, it needn't be written again on unload (unless the
            // record lacks the sky proof, or its save isn't confirmed yet)
            savedData.confirmed ? { kind: 'stored', skyOpenAbove: savedData.skyOpenAbove } : { kind: 'new' }
          )
          this.onSubChunkDataApplied(coordinate, savedData.blocks)
          this.generatedSubChunks.add(key)
          this.generationFailures.delete(key)
          return
        }
      }

      const minWorldY = coordinate.subY * SUB_CHUNK_HEIGHT
      const maxWorldY = minWorldY + SUB_CHUNK_HEIGHT - 1

      // Generate in worker with biome blending
      const workerResult = await this.world.generateSubChunkInWorker(
        coordinate,
        this.config.seed,
        this.config.seaLevel,
        this.config.terrainThickness,
        minWorldY,
        maxWorldY,
        biomeData
      )

      // The player may have moved away while the worker ran. Drop the result
      // rather than re-creating a column the unload pass just removed.
      if (!this.isResultCurrent(coordinate, key)) {
        discarded = true
        return
      }

      // Apply results to the sub-chunk (pass worker-computed opacity to avoid main thread work)
      // Pass the biome's skylight value for this sub-chunk's layer
      // Pass metadata for directional blocks (vines, etc.)
      // Generated data is always saved once (origin 'new'): regeneration
      // reproduces untouched worker output only while the generator code is
      // unchanged, and it changes between builds (see SubChunkDataOrigin).
      await this.world.applySubChunkData(
        coordinate,
        workerResult.blocks,
        workerResult.lightData,
        workerResult.isFullyOpaque,
        biomeData.primary.skylightValue,
        workerResult.metadataData,
        workerResult.light,
        { kind: 'new' }
      )
      this.onSubChunkDataApplied(coordinate, workerResult.blocks)

      // Generate decorations (trees, etc) for this sub-chunk using the primary biome.
      // Through a decoration writer: structure block writes bypass the per-block
      // setBlock side-effect cascade (one relight + remesh per touched cell),
      // without affecting other setBlock callers while the pass yields.
      const subChunk = this.world.getSubChunk(coordinate)
      if (subChunk) {
        const biomeType = this.getBiomeForChunk(chunkX, chunkZ, layer)
        const generator = this.getGeneratorForBiome(biomeType)
        const writer = this.world.createDecorationWriter()
        const decoratingKey = columnKey(chunkX, chunkZ)
        this.decoratingColumns.set(decoratingKey, (this.decoratingColumns.get(decoratingKey) ?? 0) + 1)
        try {
          await generator.generateSubChunkDecorations(subChunk, writer)
        } finally {
          writer.flush()
          const passes = (this.decoratingColumns.get(decoratingKey) ?? 1) - 1
          if (passes > 0) this.decoratingColumns.set(decoratingKey, passes)
          else this.decoratingColumns.delete(decoratingKey)
        }
      }

      // Blocks the decorations put into top rows raise band tops
      this.recordTopRowsAround(coordinate)

      // Decorations yield to the event loop: the column may have been unloaded
      // meanwhile. Its data is gone then - don't mark the key generated, or it
      // would never be requested again when the column comes back.
      if (this.cancelledSubChunks.has(key)) {
        discarded = true
        return
      }

      this.generatedSubChunks.add(key)
      this.generationFailures.delete(key)
    } catch (error) {
      console.error(`Failed to generate sub-chunk ${key}:`, error)
      failed = true
    } finally {
      // (In finally: the discard paths return from the try block.)
      this.generatingSubChunks.delete(key)
      this.cancelledSubChunks.delete(key)
      if (failed) this.retryFailedSubChunk(coordinate, key)
      // A discarded job whose column is wanted (again): request it afresh -
      // its generating mark kept the queue from doing so meanwhile
      else if (discarded) this.queueNewlyWanted(Number(coordinate.x), Number(coordinate.z))
    }
  }

  /**
   * A generation (or persistence load) failed - e.g. its worker crashed. The
   * sub-chunk is neither loaded nor queued any more, and incremental queue
   * updates only add newly wanted keys, so without a retry it would stay
   * missing. Retry after a short, growing delay (workers are recreated after
   * 500 ms), a few times.
   */
  private retryFailedSubChunk(coordinate: ISubChunkCoordinate, key: SubChunkKey): void {
    const attempts = (this.generationFailures.get(key) ?? 0) + 1
    this.generationFailures.set(key, attempts)
    if (attempts > WorldGenerator.MAX_GENERATION_ATTEMPTS) {
      console.warn(`[WorldGenerator] Giving up on sub-chunk ${key} after ${attempts - 1} failed attempts`)
      return
    }
    setTimeout(() => this.queueNewlyWanted(Number(coordinate.x), Number(coordinate.z)), 200 * attempts)
  }

  /**
   * Whether a finished generation (or persistence load) job may be applied:
   * its column was not unloaded while it ran, and it is still wanted.
   */
  private isResultCurrent(coordinate: ISubChunkCoordinate, key: SubChunkKey): boolean {
    return !this.cancelledSubChunks.has(key) && this.isStillWanted(coordinate)
  }

  /**
   * Whether a finished generation job should still be applied: the sub-chunk
   * is in the load set widened by the unload hysteresis (the same slack the
   * unload pass uses, so an applied result is never immediately unloaded).
   */
  private isStillWanted(coordinate: ISubChunkCoordinate): boolean {
    const center = this.getLoadCenter()
    const dx = Number(coordinate.x - center.x)
    const dz = Number(coordinate.z - center.z)
    if (!this.isColumnInRange(dx, dz, UNLOAD_HYSTERESIS_CHUNKS)) return false
    const band = this.getColumnBand(Number(coordinate.x), Number(coordinate.z), center)
    return this.isSubChunkWanted(dx, dz, coordinate.subY, center, band, UNLOAD_HYSTERESIS_CHUNKS)
  }
}

function isInBand(band: SubYRange | null, subY: number): boolean {
  return band !== null && subY >= band.lo && subY <= band.hi
}
