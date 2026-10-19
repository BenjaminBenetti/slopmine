import * as THREE from 'three'
import type { BlockId, IBlock } from './interfaces/IBlock.ts'
import type { IItem } from '../items/Item.ts'
import type { IChunkCoordinate, IWorldCoordinate, ISubChunkCoordinate } from './interfaces/ICoordinates.ts'
import { createChunkKey, parseChunkKey, createSubChunkKey, parseSubChunkKey, type ChunkKey, type SubChunkKey } from './interfaces/ICoordinates.ts'
import { worldToChunk, worldToLocal, localToWorld } from './coordinates/CoordinateUtils.ts'
import { ChunkManager } from './chunks/ChunkManager.ts'
import { BlockRegistry, getBlock } from './blocks/BlockRegistry.ts'
import { Chunk } from './chunks/Chunk.ts'
import { BlockIds } from './blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, ChunkState, SUB_CHUNK_VOLUME, SUB_CHUNK_COUNT } from './interfaces/IChunk.ts'
import type { IChunkMesh } from '../renderer/interfaces/IChunkMesh.ts'
import { GreedyChunkMesh } from '../renderer/GreedyChunkMesh.ts'
import { buildLiquidGlowEntries, buildLiquidMeshEntries, type LiquidGlowEntry, type LiquidMeshEntry } from './meshing/LiquidMeshTable.ts'
import type { SubChunkOpacityCache } from '../renderer/SubChunkOpacityCache.ts'
import GreedyMeshWorker from '../workers/GreedyMeshWorker.ts?worker'
import type { GreedyMeshRequest, GreedyMeshResponse, GreedyMeshError } from '../workers/GreedyMeshWorker.ts'
import { buildFaceTextureMap } from './blocks/FaceTextureRegistry.ts'
import { buildBlockTextureArray, serializeTextureLayers, applyBlockTextureAnisotropy } from '../renderer/BlockTextureArray.ts'
import { buildNeighborShell, type NeighborShell } from './meshing/MeshNeighborShell.ts'
import { SubChunk } from './chunks/SubChunk.ts'
import { ChunkColumn } from './chunks/ChunkColumn.ts'
import { SUB_CHUNK_HEIGHT } from './interfaces/IChunk.ts'
import type {
  SubChunkGenerationRequest,
  SubChunkGenerationResponse,
  SubChunkGenerationError,
  BiomeBlendData,
} from '../workers/ChunkGenerationWorker.ts'
import type { OrePosition } from './generate/features/OreFeature.ts'
import { LightEngine, type LightEngineStats, type SubChunkLightInput } from './lighting/LightEngine.ts'
import { PendingBlockChanges } from './lighting/PendingBlockChanges.ts'
import { getLightTables } from './lighting/LightTables.ts'
import { provesSkyAbove, SKY_SEED_SIZE } from './lighting/SubChunkLight.ts'
import { LAYER_BOUNDARY_SUB_CHUNK } from './generate/GenerationConfig.ts'
import { BackgroundLiquidPhysicsManager } from './liquid/BackgroundLiquidPhysicsManager.ts'
import { ScheduledBlockTicks } from './blocktick/ScheduledBlockTicks.ts'
import type { PersistenceManager, IModifiedChunkProvider } from '../persistence/PersistenceManager.ts'
import type { EntityManager } from '../entities/EntityManager.ts'
import { BlockStateManager } from './blockstate/BlockStateManager.ts'
import type { IBlockState } from './blockstate/interfaces/IBlockState.ts'
import type { ITickableBlockState } from './blockstate/interfaces/ITickableBlockState.ts'
import { deserializeBlockState, getBlockStatesToPersist, markBlockStateRestored } from '../persistence/BlockStateSerializer.ts'
import type { SerializedBlockState } from '../persistence/PersistenceTypes.ts'
import type { IDecorationWorld } from './generate/IDecorationWorld.ts'
import { whenWorkerLoadSlotFree, isWorkerLoadFailure } from '../workers/WorkerLoadGate.ts'

/** BigInt chunk offsets for neighbour lookups, indexed by offset + 1. */
const NEIGHBOR_OFFSETS: readonly bigint[] = [-1n, 0n, 1n]

/**
 * How data handed to applySubChunkData relates to the store, which decides
 * whether unloading the sub-chunk later has to write it (see
 * SubChunk.persistedDataVersion):
 * - 'stored': exactly what a confirmed store record holds (skyOpenAbove as
 *   recorded; undefined = the record predates the sky proof, so it is re-saved)
 * - 'new': must be saved before it is dropped - this includes freshly
 *   generated data. (Within one build, untouched worker output that no
 *   main-thread decoration can be rooted in regenerates byte-identically, but
 *   the generator changes between builds - GenerationConfig even applies new
 *   terrain defaults to existing worlds - so skipping its first save would let
 *   explored, untouched terrain morph next to the saved sub-chunks around it.)
 */
export type SubChunkDataOrigin =
  | { readonly kind: 'stored'; readonly skyOpenAbove: boolean | undefined }
  | { readonly kind: 'new' }

/**
 * Main world coordinator.
 * Provides high-level API for world access and modification.
 * Implements IModifiedChunkProvider for persistence integration.
 */
export class WorldManager implements IModifiedChunkProvider {
  private readonly chunkManager: ChunkManager
  private readonly blockRegistry: BlockRegistry
  private scene: THREE.Scene | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private readonly subChunkMeshes: Map<SubChunkKey, GreedyChunkMesh> = new Map()
  private readonly subChunkMeshAddedCallbacks: Array<(coord: ISubChunkCoordinate, current: boolean) => void> = []
  private readonly subChunkMeshRemovedCallbacks: Array<(coord: ISubChunkCoordinate) => void> = []
  private readonly subChunkMeshStaleCallbacks: Array<(coord: ISubChunkCoordinate) => void> = []
  private readonly orePositionCallbacks: Array<(coord: ISubChunkCoordinate, positions: OrePosition[]) => void> = []

  // Web Worker pool for mesh building
  private readonly meshWorkers: Worker[] = []
  private readonly prioritySubChunkQueue: SubChunk[] = [] // High priority (player interactions)
  private readonly subChunkWorkerQueue: SubChunk[] = [] // Normal priority (background updates)
  // Sets for O(1) queue membership checks (mirrors queues above)
  private readonly prioritySubChunkSet: Set<SubChunk> = new Set()
  private readonly subChunkWorkerSet: Set<SubChunk> = new Set()
  // Sub-chunks with a mesh job in flight (or its result waiting to be
  // applied), with that job's id. A remesh requested meanwhile is never
  // dropped: it sets SubChunk.remeshPending, and the result is also checked
  // against SubChunk.meshVersion (see processSingleMeshResult).
  private readonly pendingSubChunks: Map<SubChunkKey, SubChunk> = new Map()
  private readonly pendingMeshJobIds: Map<SubChunkKey, number> = new Map()
  // Every job still inside a worker, by id -> that worker (including jobs of
  // sub-chunks unloaded meanwhile). Workers echo the id: a result or error
  // counts only if its id is its sub-chunk's pending job - an unloaded
  // sub-chunk's job can never be taken for its reloaded successor's.
  private readonly meshJobWorkers: Map<number, Worker> = new Map()
  private meshJobSeq = 0
  /** Failed mesh jobs are retried this often while the input is unchanged. */
  private static readonly MAX_MESH_JOB_RETRIES = 2
  private readonly WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 8)
  private readonly MAX_BACKGROUND_MESH_JOBS_PER_FRAME = 2

  // Mesh result throttling to prevent GPU command buffer flooding: up to
  // MAX_MESH_RESULTS_PER_FRAME results, stopping early once the time budget is used.
  private readonly pendingMeshResults: GreedyMeshResponse[] = []
  private readonly MAX_MESH_RESULTS_PER_FRAME = 16
  private readonly MESH_RESULT_BUDGET_MS = 2
  private readonly MESH_QUEUE_WARNING_THRESHOLD = 100

  // Light work setBlock may do synchronously per frame (reset by
  // processPendingMeshResults): a single edit is normally relit before setBlock
  // returns, while bulk edits (TNT, tree felling) can't stack up a long frame.
  // The rest - and all relighting of batched writes (liquid flushes,
  // decoration writers) - runs in the budgeted lighting task.
  private static readonly SYNC_LIGHT_BUDGET_MS = 1.5
  private syncLightMsThisFrame = 0

  // Cache of opaque block IDs for worker visibility checks
  private opaqueBlockIds: number[] = []
  private opaqueBlockIdSet: Set<number> = new Set()

  // Numeric sets of block IDs that need per-block handling when a sub-chunk is
  // applied. Typically <5 ids, so scanning the raw block array against these
  // avoids a registry lookup (and BigInt coordinate allocation) per non-air block.
  private blockEntityIdSet: Set<number> = new Set() // ids defining createBlockEntity
  private onLoadOrEntityIdSet: Set<number> = new Set() // ids defining onLoad or createBlockEntity

  // Decoration writes (see createDecorationWriter) awaiting their relight
  private readonly decorationChanges = new PendingBlockChanges()

  // Face texture map for greedy meshing (built once, sent to workers)
  private faceTextureMapEntries: Array<[number, number]> = []
  private textureLayerEntries: Array<[number, number]> = []
  private nonGreedyBlockIds: number[] = []
  private liquidBlockEntries: LiquidMeshEntry[] = []
  private liquidGlowEntries: LiquidGlowEntry[] = []
  // Track which workers have received the initialization data
  private readonly workersInitialized: Set<number> = new Set()

  // Opacity cache for software occlusion culling
  private opacityCache: SubChunkOpacityCache | null = null

  // Light engine: owns all light data, relights edits/loads/unloads, and holds
  // changed sub-chunks until their light has settled before they are remeshed
  private readonly lightEngine: LightEngine
  private readonly lightIntegratedCallbacks: Array<(coord: IChunkCoordinate) => void> = []

  // Liquid physics manager for water flow simulation (background worker pool)
  private readonly liquidPhysicsManager: BackgroundLiquidPhysicsManager

  // Scheduled block ticks (leaf decay, etc.) - registered with the TaskScheduler in main.ts
  readonly scheduledBlockTicks: ScheduledBlockTicks

  // Spawns dropped item entities for world-driven block breaks (tree felling).
  // Wired from main.ts; block logic reaches it via IWorld.spawnBlockDrops.
  private dropSpawner: ((item: IItem, x: number, y: number, z: number) => void) | null = null

  // Persistence manager for saving/loading world data
  private persistenceManager: PersistenceManager | null = null
  /** Sub-chunk writes issued vs skipped because the store already held the data. */
  readonly persistStats = { saved: 0, skipped: 0 }

  // Entity manager for block entities
  private entityManager: EntityManager | null = null

  // Track chunks that have had their block states restored from persistence
  // Prevents duplicate restoration when loading multiple sub-chunks from same chunk
  private readonly restoredBlockStateChunks: Set<ChunkKey> = new Set()
  // Persisted block-state records that could not be rebuilt when their column
  // was restored (no live state yet and the record's block name can't create
  // one - e.g. 'air' records written by older builds while the sub-chunk was
  // unloaded), keyed "x,y,z". Applied when the block's sub-chunk loads.
  private readonly pendingPersistedStates: Map<string, SerializedBlockState> = new Map()

  // Web Worker pool for chunk generation (terrain, caves, lighting)
  private readonly generationWorkers: Worker[] = []
  private readonly readyGenerationWorkers: Worker[] = [] // Only workers that have initialized
  // In-flight generation requests by request id (echoed by the worker). Keyed
  // by id, not by sub-chunk: a sub-chunk can have several requests in flight
  // (e.g. the old-save sky-proof pass), and each reply must resolve its own.
  private readonly subChunkCallbackMap: Map<
    number,
    {
      key: SubChunkKey
      worker: Worker
      resolve: (data: SubChunkGenerationResponse) => void
      reject: (error: Error) => void
      timestamp: number
    }
  > = new Map()
  private nextGenerationRequestId = 1

  constructor() {
    this.chunkManager = new ChunkManager()
    this.blockRegistry = BlockRegistry.getInstance()
    this.initWorkers()
    this.updateOpaqueBlockIds()
    this.buildFaceTextureMap()

    this.lightEngine = new LightEngine({
      getColumn: (cx, cz) => this.chunkManager.getColumnFast(cx, cz),
      onSubChunkSettled: (subChunk, highPriority) =>
        this.queueSubChunkForMeshing(subChunk, highPriority ? 'high' : 'normal'),
    })

    // Initialize liquid physics manager (background worker pool)
    this.liquidPhysicsManager = new BackgroundLiquidPhysicsManager({
      nearbyDistance: 4,
      maxDistance: 8,
      updateIntervalMs: 1000,
    })
    this.liquidPhysicsManager.setCallbacks(
      (coord) => this.chunkManager.getColumn(coord),
      (x, y, z, blockId) => this.setBlockRaw(x, y, z, blockId),
      () => this.flushBlockChanges()
    )

    // Initialize scheduled block ticks (interval-based block logic like leaf decay)
    this.scheduledBlockTicks = new ScheduledBlockTicks(this)
  }

  /**
   * Update the cached list of opaque block IDs.
   * Call this after registering new blocks.
   */
  updateOpaqueBlockIds(): void {
    const allBlockIds = this.blockRegistry.getAllBlockIds()
    this.opaqueBlockIds = allBlockIds.filter((id) => getBlock(id).properties.isOpaque)
    this.opaqueBlockIdSet = new Set(this.opaqueBlockIds)

    // Recompute the block-entity / onLoad id sets (kept in sync with registration).
    const entityIds = new Set<number>()
    const loadIds = new Set<number>()
    for (const id of allBlockIds) {
      const block = getBlock(id)
      if (block.createBlockEntity) {
        entityIds.add(id)
        loadIds.add(id)
      }
      if (block.onLoad) {
        loadIds.add(id)
      }
    }
    this.blockEntityIdSet = entityIds
    this.onLoadOrEntityIdSet = loadIds
  }

  /**
   * Build the face texture map from all registered blocks.
   * This is sent to workers for greedy meshing.
   */
  private buildFaceTextureMap(): void {
    const allBlockIds = this.blockRegistry.getAllBlockIds()

    // Build face texture map by querying each block
    const map = buildFaceTextureMap(getBlock, allBlockIds)
    this.faceTextureMapEntries = Array.from(map.entries())

    // Build non-greedy block IDs list
    this.nonGreedyBlockIds = allBlockIds.filter((id) => !getBlock(id).isGreedyMeshable())
    // Liquid face-rule table (family + level per liquid block, from block properties)
    this.liquidBlockEntries = buildLiquidMeshEntries(getBlock, allBlockIds)
    // Glowing water plants: the light they scatter into the water around them
    this.liquidGlowEntries = buildLiquidGlowEntries(getBlock, allBlockIds)

    // Reset per-worker flags so workers get updated map on next request
    this.workersInitialized.clear()
  }

  /**
   * Build the block texture array sampled by greedy chunk meshes (one layer
   * per face texture of every greedy-meshable block).
   * Call this after blocks are registered and before any chunk is meshed.
   */
  async initializeBlockTextures(): Promise<void> {
    const nonGreedy = new Set(this.nonGreedyBlockIds)
    const textureIds = new Set<number>()
    for (const [key, textureId] of this.faceTextureMapEntries) {
      if (!nonGreedy.has(Math.floor(key / 6))) textureIds.add(textureId)
    }
    await buildBlockTextureArray(textureIds)
    this.textureLayerEntries = serializeTextureLayers()
    this.workersInitialized.clear()
    console.log(`Block texture array built with ${this.textureLayerEntries.length} layers`)
  }

  /**
   * Wait until at least one generation worker is ready.
   * Call this before starting chunk generation to avoid race conditions.
   */
  waitForGenerationWorkerReady(): Promise<void> {
    if (this.readyGenerationWorkers.length > 0) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.readyGenerationWorkers.length > 0) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 50) // Poll every 50ms
    })
  }

  /**
   * Set the opacity cache for software occlusion culling.
   */
  setOpacityCache(cache: SubChunkOpacityCache): void {
    this.opacityCache = cache
  }

  /**
   * Get the opacity cache for external access.
   */
  getOpacityCache(): SubChunkOpacityCache | null {
    return this.opacityCache
  }

  /**
   * Set the persistence manager for saving/loading world data.
   */
  setPersistenceManager(manager: PersistenceManager): void {
    this.persistenceManager = manager
  }

  /**
   * Set the entity manager for block entity management.
   */
  setEntityManager(manager: EntityManager): void {
    this.entityManager = manager
  }

  /**
   * Create a block entity for a block at the given position.
   * Call this after placing a block that supports block entities.
   */
  createBlockEntityAt(x: bigint, y: bigint, z: bigint, block: IBlock): void {
    if (!this.entityManager || !block.createBlockEntity) return

    // Create IWorld adapter for block entity to use
    const worldAdapter = {
      getBlock: (wx: bigint, wy: bigint, wz: bigint) => this.getBlock(wx, wy, wz),
      setBlock: (wx: bigint, wy: bigint, wz: bigint, blockId: BlockId) => this.setBlock(wx, wy, wz, blockId),
      getBlockId: (wx: bigint, wy: bigint, wz: bigint) => this.getBlockId(wx, wy, wz),
      getMetadata: (wx: bigint, wy: bigint, wz: bigint) => this.getMetadata(wx, wy, wz),
    }

    const blockEntity = block.createBlockEntity({ x, y, z }, worldAdapter)
    if (blockEntity) {
      this.entityManager.addEntity(blockEntity)
    }
  }

  /**
   * Remove a block entity at the given position.
   * Call this before breaking a block that may have a block entity.
   */
  removeBlockEntityAt(x: bigint, y: bigint, z: bigint): void {
    if (!this.entityManager) return

    const entity = this.entityManager.getBlockEntityAt({ x, y, z })
    if (entity) {
      this.entityManager.removeEntity(entity.id)
    }
  }

  /**
   * Get all loaded sub-chunks for persistence (implements IModifiedChunkProvider).
   * Returns all loaded sub-chunks since terrain generation isn't fully deterministic.
   */
  getModifiedSubChunks(): Array<{
    coordinate: ISubChunkCoordinate
    blocks: Uint16Array
    metadata: Uint8Array
    skyOpenAbove: boolean
    markSaved: () => void
  }> {
    const chunks: Array<{
      coordinate: ISubChunkCoordinate
      blocks: Uint16Array
      metadata: Uint8Array
      skyOpenAbove: boolean
      markSaved: () => void
    }> = []

    // Every loaded sub-chunk whose data the store doesn't hold yet (generated
    // data included - see SubChunkDataOrigin). markSaved records the version
    // handed out, once the save is confirmed.
    for (const subChunk of this.chunkManager.getLoadedSubChunks()) {
      if (subChunk.state < ChunkState.LOADED) continue
      if (subChunk.isPersistClean()) {
        this.persistStats.skipped++
        continue
      }
      this.persistStats.saved++
      const version = subChunk.dataVersion
      const skyOpenAbove = subChunk.skyOpenAbove
      chunks.push({
        coordinate: subChunk.coordinate,
        blocks: subChunk.getBlockData(),
        metadata: subChunk.getMetadataData(),
        skyOpenAbove,
        markSaved: () => subChunk.markPersisted(version, skyOpenAbove),
      })
    }

    return chunks
  }

  /**
   * Clear modified flags on all sub-chunks (implements IModifiedChunkProvider).
   * Called after successful save.
   */
  clearModifiedFlags(): void {
    for (const subChunk of this.chunkManager.getLoadedSubChunks()) {
      if (subChunk.isModifiedByPlayer()) {
        subChunk.clearModifiedByPlayer()
      }
    }
  }

  /**
   * Check for stuck generation requests and log diagnostics.
   * Call this periodically (e.g., every few seconds) to detect issues.
   */
  checkGenerationHealth(): void {
    const now = Date.now()
    const stuckThreshold = 10000 // 10 seconds
    let stuckCount = 0

    for (const callback of this.subChunkCallbackMap.values()) {
      const age = now - callback.timestamp
      if (age > stuckThreshold) {
        stuckCount++
        if (stuckCount <= 5) {
          console.warn(`[WorldManager] Stuck generation request: ${callback.key} (${(age / 1000).toFixed(1)}s)`)
        }
      }
    }

    if (stuckCount > 5) {
      console.warn(`[WorldManager] ...and ${stuckCount - 5} more stuck requests`)
    }

    if (stuckCount > 0) {
      console.warn(`[WorldManager] Total stuck: ${stuckCount}, Workers ready: ${this.readyGenerationWorkers.length}/${this.WORKER_COUNT}`)
    }
  }

  /**
   * Initialize the Web Worker pools for mesh building and chunk generation.
   */
  private initWorkers(): void {
    // Mesh workers (for sub-chunk greedy meshing)
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const worker = new GreedyMeshWorker()
      worker.onmessage = (event: MessageEvent<GreedyMeshResponse | GreedyMeshError>) => {
        // (The job has left the worker either way)
        if (event.data.jobId !== undefined) this.meshJobWorkers.delete(event.data.jobId)
        if (event.data.type === 'greedy-mesh-error') {
          this.handleMeshJobError(event.data)
          return
        }
        this.handleSubChunkMeshResult(event.data)
      }
      worker.onerror = (error) => {
        console.error('Greedy mesh worker error:', error)
        // This worker's jobs will never answer: requeue those still wanted.
        // Jobs on the other workers are untouched - their results still count.
        for (const [jobId, jobWorker] of Array.from(this.meshJobWorkers)) {
          if (jobWorker !== worker) continue
          this.meshJobWorkers.delete(jobId)
          for (const [key, pendingId] of this.pendingMeshJobIds) {
            if (pendingId !== jobId) continue
            const subChunk = this.pendingSubChunks.get(key)
            this.clearPendingMeshJob(key)
            if (subChunk) this.queueSubChunkForMeshing(subChunk, 'high')
            break
          }
        }
        this.processSubChunkWorkerQueue()
      }
      this.meshWorkers.push(worker)
    }

    // Generation workers (module workers for sub-chunk generation)
    // Stagger creation to avoid browser worker limits
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      setTimeout(() => this.createGenerationWorker(i), i * 100)
    }
  }

  /**
   * Create a single generation worker with retry logic (once a load slot is
   * free - see WorkerLoadGate).
   */
  private createGenerationWorker(index: number, retryCount = 0): void {
    whenWorkerLoadSlotFree((loaded) => this.startGenerationWorker(index, retryCount, loaded))
  }

  private startGenerationWorker(index: number, retryCount: number, loaded: () => void): void {
    const worker = new Worker(
      new URL('../workers/ChunkGenerationWorker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (
      event: MessageEvent<SubChunkGenerationResponse | SubChunkGenerationError | { type: 'worker-ready' }>
    ) => {
      if (event.data.type === 'worker-ready') {
        loaded()
        this.readyGenerationWorkers.push(worker)
        console.log(`[WorldManager] Generation worker ${index} ready (${this.readyGenerationWorkers.length}/${this.WORKER_COUNT})`)
        return
      }
      this.handleSubChunkGenerationResult(event.data)
    }
    worker.onerror = (event) => {
      loaded()
      const errorEvent = event as ErrorEvent
      if (isWorkerLoadFailure(event)) {
        // Its scripts failed to load (no exception message): retried below
        console.warn(`[WorldManager] Generation worker ${index} failed to load its scripts (attempt ${retryCount + 1})`)
      } else {
        console.error(`[WorldManager] Generation worker ${index} error (attempt ${retryCount + 1}):`, {
          message: errorEvent.message,
          filename: errorEvent.filename,
          lineno: errorEvent.lineno,
        })
      }
      // Remove this worker from the ready pool if it was there
      const idx = this.readyGenerationWorkers.indexOf(worker)
      if (idx !== -1) {
        this.readyGenerationWorkers.splice(idx, 1)
      }
      const poolIdx = this.generationWorkers.indexOf(worker)
      if (poolIdx !== -1) {
        this.generationWorkers.splice(poolIdx, 1)
      }
      // Its in-flight requests will never be answered: fail them (the
      // generator retries) instead of leaving their sub-chunks generating forever
      worker.terminate()
      for (const [requestId, callbacks] of Array.from(this.subChunkCallbackMap)) {
        if (callbacks.worker !== worker) continue
        this.subChunkCallbackMap.delete(requestId)
        callbacks.reject(new Error(`Generation worker ${index} failed`))
      }
      // Retry creating the worker after a delay (up to 3 attempts)
      if (retryCount < 2) {
        console.log(`[WorldManager] Retrying generation worker ${index} in 500ms...`)
        setTimeout(() => this.createGenerationWorker(index, retryCount + 1), 500)
      } else {
        console.warn(`[WorldManager] Generation worker ${index} failed after ${retryCount + 1} attempts`)
      }
    }
    this.generationWorkers.push(worker)
  }

  /**
   * Handle sub-chunk generation result from worker.
   */
  private handleSubChunkGenerationResult(
    result: SubChunkGenerationResponse | SubChunkGenerationError
  ): void {
    const requestId = result.requestId ?? -1
    const callbacks = this.subChunkCallbackMap.get(requestId)

    if (!callbacks) {
      // (e.g. the request was failed when its worker errored)
      const subChunkKey = createSubChunkKey(BigInt(result.chunkX), BigInt(result.chunkZ), result.subY)
      console.warn(`[WorldManager] Received generation result for unknown request ${requestId} (${subChunkKey})`)
      return
    }
    this.subChunkCallbackMap.delete(requestId)

    if (result.type === 'subchunk-error') {
      callbacks.reject(new Error(result.error))
    } else {
      callbacks.resolve(result)
    }
  }

  /**
   * Generate sub-chunk terrain using worker, returns promise.
   * Handles terrain, caves, lighting, and ores for a 64-height slice.
   */
  async generateSubChunkInWorker(
    coordinate: ISubChunkCoordinate,
    seed: number,
    seaLevel: number,
    terrainThickness: number,
    minWorldY: number,
    maxWorldY: number,
    biomeData: BiomeBlendData
  ): Promise<{
    blocks: Uint16Array
    lightData: Uint8Array
    metadataData: Uint8Array
    orePositions: OrePosition[]
    isFullyOpaque: boolean
    /** Sky proof + the resolved sky seed the worker lit the sub-chunk with (pass to applySubChunkData). */
    light: SubChunkLightInput
  }> {
    const subChunkKey = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)

    // Pre-allocate buffers (will be transferred to worker)
    const blocks = new Uint16Array(SUB_CHUNK_VOLUME)
    const lightData = new Uint8Array(SUB_CHUNK_VOLUME)

    // Where direct sky enters the top of this sub-chunk, as currently known
    // (the worker lights the sub-chunk locally after all features).
    const skySeed = this.lightEngine.computeSkySeed(
      Number(coordinate.x),
      Number(coordinate.z),
      coordinate.subY,
      new Uint8Array(SKY_SEED_SIZE)
    )

    const requestId = this.nextGenerationRequestId++
    const request: SubChunkGenerationRequest = {
      type: 'generate-subchunk',
      requestId,
      chunkX: Number(coordinate.x),
      chunkZ: Number(coordinate.z),
      subY: coordinate.subY,
      minWorldY,
      maxWorldY,
      seed,
      seaLevel,
      terrainThickness,
      biomeData,
      blocks,
      lightData,
      skySeed,
    }

    return new Promise((resolve, reject) => {
      if (this.readyGenerationWorkers.length === 0) {
        reject(new Error('No generation workers ready'))
        return
      }
      const worker = this.pickGenerationWorker(coordinate)
      this.subChunkCallbackMap.set(requestId, {
        key: subChunkKey,
        worker,
        resolve: (response) => {
          // Emit ore position callbacks
          if (response.orePositions.length > 0) {
            for (const callback of this.orePositionCallbacks) {
              callback(coordinate, response.orePositions)
            }
          }
          resolve({
            blocks: response.blocks,
            lightData: response.lightData,
            metadataData: response.metadataData,
            orePositions: response.orePositions,
            isFullyOpaque: response.isFullyOpaque,
            // The worker reports skyOpenAbove and the sky seed its local light
            // pass used (light and seed always travel together). A response
            // without them (e.g. an early-out path) gets relit here.
            light:
              response.skyOpenAbove !== undefined && response.lightSeed !== undefined
                ? { skyOpenAbove: response.skyOpenAbove, skySeed: response.lightSeed }
                : { skyOpenAbove: coordinate.subY >= LAYER_BOUNDARY_SUB_CHUNK && provesSkyAbove(response.blocks, response.hasTerrainAbove) },
          })
        },
        reject,
        timestamp: Date.now(),
      })

      // Transfer buffers to worker
      worker.postMessage(request, [blocks.buffer, lightData.buffer])
    })
  }

  /**
   * Local light for a sub-chunk loaded from persistence, computed by a
   * generation worker (the light-only job) instead of on the main thread in
   * applySubChunkData - persisted loads stream in outside the frame budget.
   * The sky seed is taken now, like for a generation request; pass the result
   * as applySubChunkData's lightData + light. Rejects if no worker is ready
   * or the job fails (apply with null light then: lit on the main thread).
   * The caller's arrays are copied, never transferred.
   */
  lightSavedSubChunkInWorker(
    coordinate: ISubChunkCoordinate,
    blocks: Uint16Array,
    metadata: Uint8Array | undefined,
    skyOpenAbove: boolean,
    biomeData: BiomeBlendData
  ): Promise<{ lightData: Uint8Array; isFullyOpaque: boolean; light: SubChunkLightInput }> {
    // The proof applySubChunkData will record for these blocks (see there)
    const proof = coordinate.subY >= LAYER_BOUNDARY_SUB_CHUNK && skyOpenAbove && provesSkyAbove(blocks, false)
    const skySeed = this.lightEngine.computeSkySeed(Number(coordinate.x), Number(coordinate.z), coordinate.subY, new Uint8Array(SKY_SEED_SIZE))
    const requestId = this.nextGenerationRequestId++
    const request: SubChunkGenerationRequest = {
      type: 'generate-subchunk',
      requestId,
      chunkX: Number(coordinate.x),
      chunkZ: Number(coordinate.z),
      subY: coordinate.subY,
      minWorldY: coordinate.subY * SUB_CHUNK_HEIGHT,
      maxWorldY: coordinate.subY * SUB_CHUNK_HEIGHT + SUB_CHUNK_HEIGHT - 1,
      seed: 0,
      seaLevel: 0,
      terrainThickness: 0,
      biomeData,
      blocks: new Uint16Array(blocks),
      lightData: new Uint8Array(SUB_CHUNK_VOLUME),
      skySeed,
      lightOnly: { metadata: metadata ? new Uint8Array(metadata) : new Uint8Array(SUB_CHUNK_VOLUME), skyOpenAbove: proof },
    }
    return new Promise((resolve, reject) => {
      if (this.readyGenerationWorkers.length === 0) {
        reject(new Error('No generation workers ready'))
        return
      }
      const worker = this.pickGenerationWorker(coordinate)
      this.subChunkCallbackMap.set(requestId, {
        key: createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY),
        worker,
        resolve: (response) => {
          if (response.lightSeed === undefined || response.skyOpenAbove === undefined) {
            reject(new Error('light-only job returned no light'))
            return
          }
          resolve({
            lightData: response.lightData,
            isFullyOpaque: response.isFullyOpaque,
            light: { skyOpenAbove: response.skyOpenAbove, skySeed: response.lightSeed },
          })
        },
        reject,
        timestamp: Date.now(),
      })
      const lightOnly = request.lightOnly!
      worker.postMessage(request, [request.blocks.buffer, request.lightData.buffer, lightOnly.metadata.buffer])
    })
  }

  /**
   * Generation worker for a request: sticky per column. Each worker caches the
   * blended height grid of its 64 most recent columns (ColumnHeights), which
   * every sub-chunk of a column needs; round-robin spread a column's
   * sub-chunks over all workers (17.8% cache hits over a d=8 load and a walk,
   * vs 82.7% sticky - about 11% less worker time), with the same load balance.
   */
  private pickGenerationWorker(coordinate: ISubChunkCoordinate): Worker {
    const hash = (Math.imul(Number(coordinate.x), 73856093) ^ Math.imul(Number(coordinate.z), 19349663)) >>> 0
    return this.readyGenerationWorkers[hash % this.readyGenerationWorkers.length]
  }

  /**
   * Apply generated or persisted data to a sub-chunk and integrate it with the
   * light engine. Creates the sub-chunk and ChunkColumn if necessary.
   * @param lightData - Light the generation worker computed (used only with light.skySeed)
   * @param isFullyOpaque - Opacity computed in worker (avoids main thread computation)
   * @param skylightValue - Maximum skylight value for this sub-chunk's biome (0-15)
   * @param metadata - Block metadata (rotation, etc.)
   * @param light - Sky proof and the sky seed lightData was computed with
   * @param origin - How the data relates to the store (default: must be saved)
   */
  async applySubChunkData(
    coordinate: ISubChunkCoordinate,
    blocks: Uint16Array,
    lightData: Uint8Array | null,
    isFullyOpaque?: boolean,
    skylightValue?: number,
    metadata?: Uint8Array,
    light?: SubChunkLightInput,
    origin?: SubChunkDataOrigin
  ): Promise<void> {
    // Get or create the chunk column
    const chunkCoord: IChunkCoordinate = { x: coordinate.x, z: coordinate.z }
    let column = this.chunkManager.getColumn(chunkCoord)

    if (!column) {
      column = this.chunkManager.loadColumn(chunkCoord)
    }

    // Get or create the sub-chunk
    const subChunk = column.getOrCreateSubChunk(coordinate.subY)
    const alreadyLoaded = subChunk.lightReady

    // Sky proofs only hold in the surface layer: the whole surface layer lies
    // above an underground sub-chunk (also neutralises saved underground proofs)
    const proofAllowed = coordinate.subY >= LAYER_BOUNDARY_SUB_CHUNK
    let placeholderCells: number[] | null = null
    if (alreadyLoaded) {
      // Re-applied (the sub-chunk left and re-entered the view ellipsoid):
      // keep existing blocks, fill air from the new data, relight what changed.
      this.mergeIntoLoadedSubChunk(subChunk, blocks, metadata)
      // (Re-checked against the merged blocks, as on first load below.)
      if (light) {
        this.lightEngine.setSkyOpenAbove(subChunk, proofAllowed && light.skyOpenAbove && provesSkyAbove(subChunk.getBlockData(), false))
      }
    } else {
      // Each sub-chunk has its biome layer's skylight cap (e.g. Hell = 0)
      if (skylightValue !== undefined) {
        subChunk.skylightValue = skylightValue
      }
      // Blocks already written into a placeholder (neighbouring decorations)
      // win over generated data; they are re-applied after the light is in.
      if (subChunk.isDirty()) placeholderCells = this.collectPlaceholderCells(subChunk)
      subChunk.setBlockData(blocks, metadata)
      if (lightData && light?.skySeed) {
        subChunk.getLightData().set(lightData)
      }
      // (Re-checked against the actual blocks: a persisted player build crossing
      // the top face voids the generation-time proof.)
      subChunk.skyOpenAbove = proofAllowed && (light?.skyOpenAbove ?? false) && provesSkyAbove(blocks, false)
      // What the store holds (or regeneration yields) for this exact data;
      // placeholder cells restored below count as changes
      if (origin?.kind === 'stored') subChunk.markPersisted(subChunk.dataVersion, origin.skyOpenAbove ?? null)
      else subChunk.markPersisted(-1, null)
    }

    // If this is data loaded from persistence (has metadata), restore block states
    // by calling onLoad() for any blocks that need runtime state restoration
    if (metadata !== undefined) {
      this.restoreBlockStates(coordinate, blocks)
      // Also restore persisted block state data (inventory contents, etc.)
      // This is done once per chunk column, not per sub-chunk
      this.restorePersistedBlockStates(chunkCoord)
    } else {
      // For freshly generated chunks, still create block entities
      this.createBlockEntitiesForChunk(coordinate, blocks)
    }

    // Use worker-provided opacity or compute on main thread as fallback
    if (isFullyOpaque !== undefined) {
      subChunk.setOpacity(isFullyOpaque)
    } else {
      subChunk.computeOpacity(this.opaqueBlockIdSet)
    }
    if (this.opacityCache) {
      this.opacityCache.updateSubChunk(coordinate, subChunk.isFullyOpaque)
    }

    // Register the sub-chunk with the manager for fast lookups
    this.chunkManager.registerSubChunk(subChunk)

    // Mark the sub-chunk as loaded
    subChunk.setState(ChunkState.LOADED)

    if (!alreadyLoaded) {
      // Integrate its light with the loaded world. It (and every loaded
      // neighbour whose padded mesh volume now includes it) is meshed once the
      // resulting light updates have settled.
      this.lightEngine.onSubChunkLoaded(subChunk, lightData && light?.skySeed ? light.skySeed : null)
      // (Over saved data they only fill air: a tree from a freshly generated
      // neighbour must not replace what the player left there.)
      if (placeholderCells) this.restorePlaceholderCells(subChunk, placeholderCells, lightData === null)
      for (const callback of this.lightIntegratedCallbacks) {
        callback(chunkCoord)
      }
    }

    // Meshes built before this data arrived (its own, and its neighbours' -
    // they culled faces toward it) are no longer current
    this.bumpMeshDataVersion(subChunk, !alreadyLoaded)

    // Liquid tracking: the block array was written directly (setBlockData,
    // merge, placeholder cells) - and liquid next to data that was unknown
    // until now may flow
    column.onSubChunkDataReplaced(coordinate.subY)
    this.liquidPhysicsManager.onColumnDataChanged(coordinate.x, coordinate.z)
  }

  /**
   * New data arrived for a sub-chunk: bump its mesh data version and, for a
   * fresh load, that of every light-ready sub-chunk in its 26-neighbourhood
   * (their padded mesh volumes now include it). Displayed meshes built from
   * the older data are reported stale (onSubChunkMeshStale); their remesh is
   * already queued by the light engine.
   */
  private bumpMeshDataVersion(subChunk: SubChunk, withNeighbors: boolean): void {
    const { x, z, subY } = subChunk.coordinate
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const isSelf = dx === 0 && dy === 0 && dz === 0
          if (!isSelf && !withNeighbors) continue
          const sub = isSelf
            ? subChunk
            : this.chunkManager.getSubChunk({ x: x + NEIGHBOR_OFFSETS[dx + 1], z: z + NEIGHBOR_OFFSETS[dz + 1], subY: subY + dy })
          if (!sub?.lightReady) continue
          sub.meshDataVersion++
          const key = createSubChunkKey(sub.coordinate.x, sub.coordinate.z, sub.coordinate.subY)
          if (this.subChunkMeshes.has(key)) {
            for (const callback of this.subChunkMeshStaleCallbacks) callback(sub.coordinate)
          }
        }
      }
    }
  }

  /**
   * Non-air cells of a placeholder sub-chunk (created by decoration writes
   * before generation) as flat (index, blockId, metadata) triples, or null.
   */
  private collectPlaceholderCells(subChunk: SubChunk): number[] | null {
    const blocks = subChunk.getBlockData()
    const metadata = subChunk.getMetadataData()
    let cells: number[] | null = null
    for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
      if (blocks[i] === BlockIds.AIR) continue
      if (!cells) cells = []
      cells.push(i, blocks[i], metadata[i])
    }
    return cells
  }

  /**
   * Write placeholder cells back over freshly applied data, relighting each
   * cell whose block changed. With intoAirOnly (saved data) only air cells
   * take them.
   */
  private restorePlaceholderCells(subChunk: SubChunk, cells: number[], intoAirOnly: boolean): void {
    const blocks = subChunk.getBlockData()
    const metadata = subChunk.getMetadataData()
    const baseX = subChunk.cx * CHUNK_SIZE_X
    const baseY = subChunk.coordinate.subY * SUB_CHUNK_HEIGHT
    const baseZ = subChunk.cz * CHUNK_SIZE_Z
    let changed = false
    for (let c = 0; c < cells.length; c += 3) {
      const i = cells[c]
      const id = cells[c + 1]
      const generatedId = blocks[i]
      if (intoAirOnly && generatedId !== BlockIds.AIR) continue
      if (metadata[i] !== cells[c + 2]) changed = true
      metadata[i] = cells[c + 2]
      if (generatedId === id) continue
      blocks[i] = id
      changed = true
      this.lightEngine.onBlockChanged(baseX + (i & 31), baseY + (i >> 10), baseZ + ((i >> 5) & 31), generatedId, id)
    }
    if (changed) subChunk.markDataChanged()
  }

  /**
   * Merge re-applied data into an already loaded sub-chunk: existing non-air
   * blocks are kept, air cells take the new data, and every filled cell is
   * relit.
   */
  private mergeIntoLoadedSubChunk(subChunk: SubChunk, blocks: Uint16Array, metadata?: Uint8Array): void {
    const current = subChunk.getBlockData()
    const currentMetadata = subChunk.getMetadataData()
    const baseX = subChunk.cx * CHUNK_SIZE_X
    const baseY = subChunk.coordinate.subY * SUB_CHUNK_HEIGHT
    const baseZ = subChunk.cz * CHUNK_SIZE_Z
    let changed = false
    for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
      const id = blocks[i]
      if (current[i] !== BlockIds.AIR || id === BlockIds.AIR) continue
      current[i] = id
      currentMetadata[i] = metadata ? metadata[i] : 0
      changed = true
      this.lightEngine.onBlockChanged(baseX + (i & 31), baseY + (i >> 10), baseZ + ((i >> 5) & 31), BlockIds.AIR, id)
    }
    if (changed) subChunk.markDataChanged()
  }

  /**
   * Restore runtime block states for blocks loaded from persistence.
   * Iterates through all blocks and calls onLoad() for blocks that need state restoration.
   */
  private restoreBlockStates(coordinate: ISubChunkCoordinate, blocks: Uint16Array): void {
    // Nothing in this sub-chunk can define onLoad/createBlockEntity - skip the scan entirely.
    if (this.onLoadOrEntityIdSet.size === 0) return

    const worldYOffset = coordinate.subY * SUB_CHUNK_HEIGHT
    const chunkWorldX = coordinate.x * BigInt(CHUNK_SIZE_X)
    const chunkWorldZ = coordinate.z * BigInt(CHUNK_SIZE_Z)

    // Create a minimal IWorld adapter for block callbacks
    const worldAdapter = {
      getBlock: (x: bigint, y: bigint, z: bigint) => this.getBlock(x, y, z),
      setBlock: (x: bigint, y: bigint, z: bigint, blockId: BlockId) => this.setBlock(x, y, z, blockId),
      getBlockId: (x: bigint, y: bigint, z: bigint) => this.getBlockId(x, y, z),
      getMetadata: (x: bigint, y: bigint, z: bigint) => this.getMetadata(x, y, z),
    }

    // Scan the raw block array; only blocks needing runtime state pay for coordinate
    // math (BigInt allocation) and a registry lookup.
    for (let index = 0; index < blocks.length; index++) {
      const blockId = blocks[index]
      if (blockId === BlockIds.AIR) continue
      if (!this.onLoadOrEntityIdSet.has(blockId)) continue

      // Decode local coordinates from the y-major flat index
      const localY = (index / (CHUNK_SIZE_X * CHUNK_SIZE_Z)) | 0
      const rem = index - localY * CHUNK_SIZE_X * CHUNK_SIZE_Z
      const localZ = (rem / CHUNK_SIZE_X) | 0
      const localX = rem - localZ * CHUNK_SIZE_X

      const worldX = chunkWorldX + BigInt(localX)
      const worldY = BigInt(worldYOffset + localY)
      const worldZ = chunkWorldZ + BigInt(localZ)

      const block = getBlock(blockId)

      // Call onLoad to restore runtime state
      if (block.onLoad) {
        block.onLoad(worldAdapter, worldX, worldY, worldZ)
      }
      // A persisted record parked until this block's sub-chunk loaded
      if (this.pendingPersistedStates.size > 0) this.applyPendingPersistedState(worldX, worldY, worldZ)

      // Create block entity if the block type supports it
      if (this.entityManager && block.createBlockEntity) {
        const blockEntity = block.createBlockEntity({ x: worldX, y: worldY, z: worldZ }, worldAdapter)
        if (blockEntity) {
          this.entityManager.addEntity(blockEntity)
        }
      }
    }
  }

  /**
   * Restore persisted block state data (inventory contents, smelting progress, etc.)
   * from IndexedDB. Called once per chunk column when loading from persistence.
   *
   * This populates the empty states created by onLoad() with saved inventory data
   * by calling deserialize() on each existing state.
   */
  private async restorePersistedBlockStates(chunkCoord: IChunkCoordinate): Promise<void> {
    const chunkKey = createChunkKey(chunkCoord.x, chunkCoord.z)

    // Only restore once per chunk
    if (this.restoredBlockStateChunks.has(chunkKey)) {
      return
    }
    this.restoredBlockStateChunks.add(chunkKey)

    // Skip if no persistence manager
    if (!this.persistenceManager) {
      return
    }

    try {
      // Load block states for this chunk from persistence
      const serializedStates = await this.persistenceManager.loadBlockStatesForChunk(
        chunkCoord.x,
        chunkCoord.z
      )

      if (serializedStates.length === 0) {
        return
      }

      console.log(
        `[WorldManager] Restoring ${serializedStates.length} block states for chunk ${chunkCoord.x},${chunkCoord.z}`
      )

      const blockStateManager = BlockStateManager.getInstance()

      for (const serialized of serializedStates) {
        const position = {
          x: BigInt(serialized.position.x),
          y: BigInt(serialized.position.y),
          z: BigInt(serialized.position.z),
        }

        // Get the existing empty state that was created by onLoad()
        // It should already be registered with BlockTickManager
        const existingState = blockStateManager.getState<IBlockState>(position)

        if (existingState) {
          // Verify the state type matches
          if (existingState.stateType !== serialized.stateType) {
            console.warn(
              `[WorldManager] State type mismatch at ${serialized.position.x},${serialized.position.y},${serialized.position.z}: ` +
              `expected ${serialized.stateType}, got ${existingState.stateType}`
            )
            continue
          }

          // Populate the existing state with saved data
          // This preserves the BlockTickManager registration
          existingState.deserialize(serialized.data)
          markBlockStateRestored(existingState)
        } else {
          // State doesn't exist (block wasn't loaded yet, or was broken)
          // Create a new state with the saved data
          const newState = deserializeBlockState(serialized)
          if (!newState) {
            // Its block can't be named from the record: keep the data until
            // the block's sub-chunk loads and onLoad creates the state
            this.pendingPersistedStates.set(`${serialized.position.x},${serialized.position.y},${serialized.position.z}`, serialized)
          }
          if (newState) {
            markBlockStateRestored(newState)
            blockStateManager.setState(position, newState)
            // Note: This state won't be registered with BlockTickManager
            // It will be registered when the block's sub-chunk is loaded
            console.log(
              `[WorldManager] Created new block state at ${serialized.position.x},${serialized.position.y},${serialized.position.z}`
            )
          }
        }
      }
    } catch (error) {
      console.error(`[WorldManager] Failed to restore block states for chunk ${chunkCoord.x},${chunkCoord.z}:`, error)
    }
  }

  /**
   * Fill the state onLoad just created at a position with its parked persisted
   * record (see pendingPersistedStates), if the state types match.
   */
  private applyPendingPersistedState(x: bigint, y: bigint, z: bigint): void {
    const key = `${x},${y},${z}`
    const parked = this.pendingPersistedStates.get(key)
    if (!parked) return
    const state = BlockStateManager.getInstance().getState<IBlockState>({ x, y, z })
    if (!state || state.stateType !== parked.stateType) return
    state.deserialize(parked.data)
    markBlockStateRestored(state)
    this.pendingPersistedStates.delete(key)
  }

  /**
   * Create block entities for blocks in a freshly generated chunk.
   * Similar to restoreBlockStates but only creates entities, no onLoad() calls.
   */
  private createBlockEntitiesForChunk(coordinate: ISubChunkCoordinate, blocks: Uint16Array): void {
    if (!this.entityManager) return
    // No block type in this world defines createBlockEntity - skip the scan entirely.
    if (this.blockEntityIdSet.size === 0) return

    const worldYOffset = coordinate.subY * SUB_CHUNK_HEIGHT
    const chunkWorldX = coordinate.x * BigInt(CHUNK_SIZE_X)
    const chunkWorldZ = coordinate.z * BigInt(CHUNK_SIZE_Z)

    // Create a minimal IWorld adapter for block entity callbacks
    const worldAdapter = {
      getBlock: (x: bigint, y: bigint, z: bigint) => this.getBlock(x, y, z),
      setBlock: (x: bigint, y: bigint, z: bigint, blockId: BlockId) => this.setBlock(x, y, z, blockId),
      getBlockId: (x: bigint, y: bigint, z: bigint) => this.getBlockId(x, y, z),
      getMetadata: (x: bigint, y: bigint, z: bigint) => this.getMetadata(x, y, z),
    }

    // Scan the raw block array; only entity-defining blocks pay for coordinate math.
    for (let index = 0; index < blocks.length; index++) {
      const blockId = blocks[index]
      if (blockId === BlockIds.AIR) continue
      if (!this.blockEntityIdSet.has(blockId)) continue

      // Decode local coordinates from the y-major flat index
      const localY = (index / (CHUNK_SIZE_X * CHUNK_SIZE_Z)) | 0
      const rem = index - localY * CHUNK_SIZE_X * CHUNK_SIZE_Z
      const localZ = (rem / CHUNK_SIZE_X) | 0
      const localX = rem - localZ * CHUNK_SIZE_X

      const block = getBlock(blockId)
      const worldX = chunkWorldX + BigInt(localX)
      const worldY = BigInt(worldYOffset + localY)
      const worldZ = chunkWorldZ + BigInt(localZ)

      const blockEntity = block.createBlockEntity!({ x: worldX, y: worldY, z: worldZ }, worldAdapter)
      if (blockEntity) {
        this.entityManager.addEntity(blockEntity)
      }
    }
  }

  /**
   * A worker for the next mesh job, or null while WORKER_COUNT jobs are
   * pending: the one with the fewest jobs inside it.
   */
  private getIdleWorker(): Worker | null {
    if (this.pendingSubChunks.size >= this.WORKER_COUNT) return null
    let best = this.meshWorkers[0]
    let bestLoad = Infinity
    for (const worker of this.meshWorkers) {
      let load = 0
      for (const jobWorker of this.meshJobWorkers.values()) if (jobWorker === worker) load++
      if (load < bestLoad) {
        best = worker
        bestLoad = load
      }
    }
    return best
  }

  /** Forget a sub-chunk's pending mesh job (its result/error will be ignored). */
  private clearPendingMeshJob(subChunkKey: SubChunkKey): void {
    this.pendingSubChunks.delete(subChunkKey)
    this.pendingMeshJobIds.delete(subChunkKey)
  }

  /**
   * A mesh job failed in the worker. If it is its sub-chunk's pending job, the
   * remesh it stood for is not dropped: retried when the input changed since
   * (remesh requested meanwhile) or a couple of times for the same input (a
   * mesher bug that always fails the same data must not loop forever).
   */
  private handleMeshJobError(error: GreedyMeshError): void {
    const key = createSubChunkKey(BigInt(error.chunkX), BigInt(error.chunkZ), error.subY)
    console.warn(`Greedy mesh worker error for chunk ${error.chunkX},${error.chunkZ} subY=${error.subY}:`, error.error)
    if (this.pendingMeshJobIds.get(key) !== error.jobId) return // an unloaded sub-chunk's or superseded job
    const subChunk = this.pendingSubChunks.get(key)
    this.clearPendingMeshJob(key)
    if (subChunk) {
      const changed = subChunk.remeshPending || subChunk.meshVersion !== subChunk.meshJobVersion
      subChunk.remeshPending = false
      subChunk.meshJobErrors = changed ? 0 : subChunk.meshJobErrors + 1
      if (subChunk.meshJobErrors <= WorldManager.MAX_MESH_JOB_RETRIES && !subChunk.meshDirty) {
        this.queueSubChunkForMeshing(subChunk, 'high')
      }
    }
    this.processSubChunkWorkerQueue()
  }

  /**
   * Process the sub-chunk worker queue.
   * Priority queue items are always processed immediately.
   * Background queue items are limited per frame to prevent spikes.
   */
  private processSubChunkWorkerQueue(): void {
    // Always process all high-priority items (player interactions)
    while (this.prioritySubChunkQueue.length > 0) {
      const worker = this.getIdleWorker()
      if (!worker) break

      const subChunk = this.prioritySubChunkQueue.shift()!
      this.prioritySubChunkSet.delete(subChunk) // Keep Set in sync
      if (!subChunk.lightReady) continue // unloaded while queued
      this.sendSubChunkToWorker(subChunk, worker)
    }

    // Process limited background items to prevent frame spikes
    let backgroundJobsSent = 0
    while (this.subChunkWorkerQueue.length > 0 && backgroundJobsSent < this.MAX_BACKGROUND_MESH_JOBS_PER_FRAME) {
      const worker = this.getIdleWorker()
      if (!worker) break

      const subChunk = this.subChunkWorkerQueue.shift()!
      this.subChunkWorkerSet.delete(subChunk) // Keep Set in sync
      if (!subChunk.lightReady) continue // unloaded while queued
      this.sendSubChunkToWorker(subChunk, worker)
      backgroundJobsSent++
    }
  }

  /**
   * Handle sub-chunk mesh result from worker.
   * Queues the result for throttled processing to prevent GPU command buffer flooding.
   */
  private handleSubChunkMeshResult(result: GreedyMeshResponse): void {
    this.pendingMeshResults.push(result)
    if (this.pendingMeshResults.length > this.MESH_QUEUE_WARNING_THRESHOLD) {
      console.error(`pendingMeshResults queue exceeded threshold: ${this.pendingMeshResults.length}`)
    }
  }

  /**
   * Per-frame mesh pump: hands sub-chunks whose light has settled to the mesh
   * queue (coalescing all of the frame's edits), then applies worker results
   * with throttling (count cap + time budget) to prevent compositor blocking.
   * Call this once per frame from the update loop.
   */
  processPendingMeshResults(): void {
    this.syncLightMsThisFrame = 0
    this.lightEngine.releaseSettled()

    const start = performance.now()
    let processed = 0
    while (this.pendingMeshResults.length > 0 && processed < this.MAX_MESH_RESULTS_PER_FRAME) {
      if (processed > 0 && performance.now() - start >= this.MESH_RESULT_BUDGET_MS) break
      const result = this.pendingMeshResults.shift()!
      this.processSingleMeshResult(result)
      processed++
    }
  }

  /**
   * Process a single mesh result from worker.
   */
  private processSingleMeshResult(result: GreedyMeshResponse): void {
    if (!this.scene) return

    const subChunkKey = createSubChunkKey(BigInt(result.chunkX), BigInt(result.chunkZ), result.subY)
    // Only the sub-chunk's pending job counts: a job of an unloaded (maybe
    // since reloaded) sub-chunk, or one requeued after a worker crash, is
    // discarded - its data is gone or superseded
    if (this.pendingMeshJobIds.get(subChunkKey) !== result.jobId) return

    const subChunk = this.pendingSubChunks.get(subChunkKey)
    this.clearPendingMeshJob(subChunkKey)

    if (!subChunk) return
    subChunk.meshJobErrors = 0

    // Never drop a remesh: if a request arrived while this job was in flight,
    // or anything in the padded volume changed since it was sent, mesh again.
    // (Still show this result meanwhile - it is newer than the current mesh.)
    // Sub-chunks the light engine still holds are requeued when their light settles.
    const stale = subChunk.remeshPending || subChunk.meshVersion !== subChunk.meshJobVersion
    // (Read before the requeue below re-stamps the sub-chunk for the next job.)
    const current = subChunk.meshJobDataVersion === subChunk.meshDataVersion
    subChunk.remeshPending = false
    if (stale && !subChunk.meshDirty) {
      this.queueSubChunkForMeshing(subChunk, 'high')
    }

    // Defense-in-depth: verify chunk is still loaded before creating mesh
    const chunkCoord: IChunkCoordinate = { x: subChunk.coordinate.x, z: subChunk.coordinate.z }
    if (!this.chunkManager.getColumn(chunkCoord)) {
      return // Chunk was unloaded, discard stale result
    }

    // Remove existing mesh for this sub-chunk
    this.removeSubChunkMesh(subChunkKey)

    // Build greedy mesh from worker result
    const greedyMesh = new GreedyChunkMesh(chunkCoord, result.subY)

    greedyMesh.build(result)
    greedyMesh.addToScene(this.scene)
    this.subChunkMeshes.set(subChunkKey, greedyMesh)

    // Notify listeners. The mesh is current only if no data arrived for the
    // sub-chunk or its neighbours after the job was sent (see meshDataVersion).
    for (const callback of this.subChunkMeshAddedCallbacks) {
      callback(subChunk.coordinate, current)
    }

    // Process next items in queue
    this.processSubChunkWorkerQueue()
  }

  /**
   * Send a sub-chunk to a worker for greedy mesh calculation.
   */
  private sendSubChunkToWorker(subChunk: SubChunk, worker: Worker): void {
    const coord = subChunk.coordinate
    const subChunkKey = createSubChunkKey(coord.x, coord.z, coord.subY)

    // One-block shell of neighbour blocks + light for faces, smooth light and AO
    const shell = this.getMeshNeighborShell(coord)

    // Copy block, light, and metadata data
    const blocksCopy = new Uint16Array(subChunk.getBlockData())
    const lightCopy = new Uint8Array(subChunk.getLightData())
    const metadataCopy = new Uint8Array(subChunk.getMetadataData())

    // Check if this worker needs initialization data
    const workerIndex = this.meshWorkers.indexOf(worker)
    const needsInit = !this.workersInitialized.has(workerIndex)

    const jobId = ++this.meshJobSeq
    const request: GreedyMeshRequest = {
      type: 'greedy-mesh',
      jobId,
      chunkX: Number(coord.x),
      chunkZ: Number(coord.z),
      subY: coord.subY,
      minWorldY: coord.subY * SUB_CHUNK_HEIGHT,
      blocks: blocksCopy,
      lightData: lightCopy,
      metadata: metadataCopy,
      shellBlocks: shell.blocks,
      shellLight: shell.light,
      shellPresentMask: shell.presentMask,
      opaqueBlockIds: this.opaqueBlockIds,
      // Send face texture map and texture layers on first request to each worker
      faceTextureMapEntries: needsInit ? this.faceTextureMapEntries : undefined,
      textureLayerEntries: needsInit ? this.textureLayerEntries : undefined,
      nonGreedyBlockIds: needsInit ? this.nonGreedyBlockIds : undefined,
      liquidBlockEntries: needsInit ? this.liquidBlockEntries : undefined,
      liquidGlowEntries: needsInit ? this.liquidGlowEntries : undefined,
    }

    // Mark this worker as initialized
    if (needsInit) {
      this.workersInitialized.add(workerIndex)
    }

    this.pendingSubChunks.set(subChunkKey, subChunk)
    this.pendingMeshJobIds.set(subChunkKey, jobId)
    this.meshJobWorkers.set(jobId, worker)
    // Version stamps: the result is stale if the padded volume changes before
    // it lands, and not current if data arrives meanwhile
    subChunk.meshJobVersion = subChunk.meshVersion
    subChunk.meshJobDataVersion = subChunk.meshDataVersion

    // Transfer the copied data plus the freshly built neighbour shell. All are
    // private copies owned by this call, so transferring (zero-copy) is safe and
    // avoids structured-cloning them on the main thread.
    const transfer: Transferable[] = [
      blocksCopy.buffer, lightCopy.buffer, metadataCopy.buffer, shell.blocks.buffer, shell.light.buffer,
    ]
    worker.postMessage(request, transfer)
  }

  /**
   * Mesh-request payload builder: the one-block shell around a sub-chunk that
   * the greedy mesher needs (6 face slabs, 12 edge lines and 8 corner cells of
   * block ids AND light from the 26 neighbouring sub-chunks; layout in
   * world/meshing/MeshNeighborShell.ts).
   *
   * `presentMask` has bit (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1) set for each
   * neighbour whose data was copied. Missing neighbours are never guessed: the
   * worker culls faces toward a missing face neighbour and reuses the face's
   * own light for AO/smooth-light samples in missing edge/corner data, so the
   * sub-chunk must be remeshed once any missing neighbour loads. Above the top
   * of the world counts as present open sky.
   */
  private getMeshNeighborShell(coord: ISubChunkCoordinate): NeighborShell {
    const { x, z, subY } = coord
    return buildNeighborShell(subY, (dx, dy, dz) => {
      const neighbor = this.chunkManager.getSubChunk({ x: x + NEIGHBOR_OFFSETS[dx + 1], z: z + NEIGHBOR_OFFSETS[dz + 1], subY: subY + dy })
      // Only light-engine-integrated data counts as present (an unloading
      // column's sub-chunks are unregistered only after their light is gone)
      return neighbor?.lightReady ? neighbor : null
    })
  }

  /**
   * Queue a sub-chunk for background meshing via Web Worker.
   * Requests are never dropped: while a job for the sub-chunk is in flight the
   * request is remembered and served when that job's result lands.
   * @param subChunk The sub-chunk to mesh
   * @param priority 'high' for player interactions (immediate), 'normal' for background (throttled)
   */
  queueSubChunkForMeshing(subChunk: SubChunk, priority: 'high' | 'normal' = 'normal'): void {
    // Only sub-chunks integrated with the light engine have final data to mesh
    if (!subChunk.lightReady) return

    const subChunkKey = createSubChunkKey(
      subChunk.coordinate.x,
      subChunk.coordinate.z,
      subChunk.coordinate.subY
    )

    if (this.pendingSubChunks.has(subChunkKey)) {
      subChunk.remeshPending = true
      return
    }
    if (this.prioritySubChunkSet.has(subChunk)) return
    if (this.subChunkWorkerSet.has(subChunk)) {
      if (priority !== 'high') return
      // Promote a background request to high priority
      const normalIdx = this.subChunkWorkerQueue.indexOf(subChunk)
      if (normalIdx !== -1) this.subChunkWorkerQueue.splice(normalIdx, 1)
      this.subChunkWorkerSet.delete(subChunk)
    }

    if (priority === 'high') {
      this.prioritySubChunkQueue.push(subChunk)
      this.prioritySubChunkSet.add(subChunk) // Keep Set in sync
    } else {
      this.subChunkWorkerQueue.push(subChunk)
      this.subChunkWorkerSet.add(subChunk) // Keep Set in sync
    }
    this.processSubChunkWorkerQueue()
  }

  /**
   * Process queued light updates for up to budgetMs (one unit of the
   * budget-aware lighting task). Returns true while work remains.
   */
  processLighting(budgetMs: number): boolean {
    return this.lightEngine.process(budgetMs)
  }

  /**
   * Lighting statistics for debug display: queued light-update entries and
   * sub-chunks waiting for their light to settle before remeshing.
   */
  getLightingStats(): {
    queued: number
    awaitingRemesh: number
  } {
    return {
      queued: this.lightEngine.queuedEntries,
      awaitingRemesh: this.lightEngine.dirtySubChunks,
    }
  }

  /**
   * Cumulative light engine counters (main-thread time, work done).
   * @internal test hook (the Node lighting harness and churn probes read it;
   * the debug HUD uses getLightingStats).
   */
  getLightEngineStats(): Readonly<LightEngineStats> {
    return this.lightEngine.stats
  }

  /**
   * Get liquid physics statistics for debug display.
   */
  getLiquidPhysicsStats(): {
    columnsProcessed: number
    columnsQueued: number
  } {
    return this.liquidPhysicsManager.getStats()
  }

  /**
   * Get the set of chunk column keys currently queued for liquid physics.
   * Used for debug visualization.
   */
  getLiquidPhysicsQueuedColumns(): ReadonlySet<ChunkKey> {
    return this.liquidPhysicsManager.getQueuedColumnKeys()
  }

  /**
   * Register a callback for when a sub-chunk's light is integrated into a
   * column (debug visualization). Returns an unsubscribe function.
   */
  onSubChunkLightIntegrated(callback: (coord: IChunkCoordinate) => void): () => void {
    this.lightIntegratedCallbacks.push(callback)
    return () => {
      const index = this.lightIntegratedCallbacks.indexOf(callback)
      if (index !== -1) {
        this.lightIntegratedCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Update the liquid physics queue (does NOT process blocks).
   * Call this every frame to keep the queue up to date.
   */
  updateLiquidPhysicsQueue(playerX: number, playerZ: number): void {
    this.liquidPhysicsManager.setPlayerPosition(playerX, playerZ)
    this.liquidPhysicsManager.updateQueue()
  }

  /**
   * Process a single liquid physics column.
   * Used by the task scheduler for budget-aware processing.
   * @returns true if work was done (more may remain), false if no work
   */
  processNextLiquidPhysicsColumn(): boolean {
    return this.liquidPhysicsManager.processNextColumn()
  }

  /**
   * Remove a sub-chunk mesh.
   * @param subChunkKey The key of the sub-chunk to remove
   * @param isUnloading If true, also removes from opacity cache (only for actual unloads, not mesh updates)
   */
  private removeSubChunkMesh(subChunkKey: SubChunkKey, isUnloading: boolean = false): void {
    const chunkMesh = this.subChunkMeshes.get(subChunkKey)
    if (chunkMesh && this.scene) {
      // Notify listeners before removal
      const coord = parseSubChunkKey(subChunkKey)
      for (const callback of this.subChunkMeshRemovedCallbacks) {
        callback(coord)
      }

      chunkMesh.removeFromScene(this.scene)
      chunkMesh.dispose()
    }
    this.subChunkMeshes.delete(subChunkKey)

    // Only remove from opacity cache during actual unloads, not mesh updates
    if (isUnloading && this.opacityCache) {
      this.opacityCache.removeSubChunkByKey(subChunkKey)
    }
  }

  /**
   * Get block at world coordinates.
   */
  getBlock(x: bigint, y: bigint, z: bigint): IBlock {
    const blockId = this.getBlockId(x, y, z)
    return getBlock(blockId)
  }

  /**
   * Get block ID at world coordinates.
   */
  getBlockId(x: bigint, y: bigint, z: bigint): BlockId {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    const column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      return BlockIds.AIR
    }

    return column.getBlockId(local.x, local.y, local.z)
  }

  /**
   * Get block metadata at world coordinates.
   */
  getBlockMetadata(x: bigint, y: bigint, z: bigint): number {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    const column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      return 0
    }

    return column.getMetadata(local.x, local.y, local.z)
  }

  /**
   * Alias for getBlockMetadata (for IWorld interface compatibility).
   */
  getMetadata(x: bigint, y: bigint, z: bigint): number {
    return this.getBlockMetadata(x, y, z)
  }

  /**
   * Numeric fast-path block queries.
   *
   * These bypass the BigInt/string-key funnel used by getBlockId/getBlock for
   * hot, spatially-coherent callers (physics collision, DDA raycast, entity
   * light). Chunk coords are derived with bitwise ops (chunk columns are 32
   * blocks wide -- a power of two -- so `>> 5`/`& 31` floor correctly even for
   * negative coordinates), and the column is resolved through ChunkManager's
   * last-hit numeric cache. Zero allocations per call on the hot path.
   *
   * Inputs are floored to block positions. Valid for |x|,|z| < 2^31 blocks,
   * which comfortably covers all reachable gameplay positions; far cold
   * callers should keep using the BigInt API.
   */
  getBlockIdFast(x: number, y: number, z: number): BlockId {
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const column = this.chunkManager.getColumnFast(bx >> 5, bz >> 5)
    if (!column) {
      return BlockIds.AIR
    }
    return column.getBlockId(bx & 31, by, bz & 31)
  }

  /**
   * Numeric fast-path variant of getBlock. See getBlockIdFast for constraints.
   */
  getBlockFast(x: number, y: number, z: number): IBlock {
    return getBlock(this.getBlockIdFast(x, y, z))
  }

  /**
   * Numeric fast-path variant of getBlockMetadata. See getBlockIdFast.
   */
  getBlockMetadataFast(x: number, y: number, z: number): number {
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const column = this.chunkManager.getColumnFast(bx >> 5, bz >> 5)
    if (!column) {
      return 0
    }
    return column.getMetadata(bx & 31, by, bz & 31)
  }

  /**
   * Sky and block light at a position packed as `sky << 4 | block` (the
   * stored nibble layout), for lighting things drawn outside the chunk meshes
   * (held item, entities) with lightLevelsToColor. Returns open sky (0xF0)
   * when the column is not loaded.
   */
  getPackedLightFast(x: number, y: number, z: number): number {
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const column = this.chunkManager.getColumnFast(bx >> 5, bz >> 5)
    if (!column) {
      return 0xF0
    }
    return (column.getSkylight(bx & 31, by, bz & 31) << 4) | column.getBlocklight(bx & 31, by, bz & 31)
  }

  /**
   * Set block metadata at world coordinates.
   * Returns true if the metadata was set.
   */
  setBlockMetadata(x: bigint, y: bigint, z: bigint, metadata: number): boolean {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    const column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      return false
    }

    const changed = column.setMetadata(local.x, local.y, local.z, metadata)
    if (changed) {
      const subY = Math.floor(local.y / SUB_CHUNK_HEIGHT)
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        subChunk.markModifiedByPlayer()
        this.persistenceManager?.markSubChunkModified(subChunk.coordinate)
      }
    }

    return changed
  }

  /**
   * Wire the dropped-item spawner (see dropSpawner field).
   */
  setDropSpawner(spawner: (item: IItem, x: number, y: number, z: number) => void): void {
    this.dropSpawner = spawner
  }

  /**
   * Scatter items as dropped item entities at a block position.
   * IWorld.spawnBlockDrops - used by world-driven breaks like tree felling.
   */
  spawnBlockDrops(x: bigint, y: bigint, z: bigint, items: IItem[]): void {
    if (!this.dropSpawner) return
    for (const item of items) {
      this.dropSpawner(item, Number(x), Number(y), Number(z))
    }
  }

  // Raw block writes (liquid physics) awaiting a relight in flushBlockChanges()
  private readonly pendingRawChanges = new PendingBlockChanges()

  /**
   * Set block at world coordinates without triggering updates.
   * Use flushBlockChanges() after bulk updates to trigger lighting/meshing.
   * Returns true if the block was changed.
   */
  setBlockRaw(x: bigint, y: bigint, z: bigint, blockId: BlockId): boolean {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    // Only into loaded data. Liquid flow computed toward a neighbour that isn't
    // loaded used to create a column (or placeholder sub-chunk) holding just
    // that cell, whose contents later overrode the neighbour's saved data.
    const column = this.chunkManager.getColumn(chunkCoord)
    if (!column?.getSubChunk(Math.floor(local.y / SUB_CHUNK_HEIGHT))?.lightReady) {
      return false
    }

    const oldBlockId = column.getBlockId(local.x, local.y, local.z)
    const changed = column.setBlockId(local.x, local.y, local.z, blockId)
    if (changed) {
      const subY = Math.floor(local.y / SUB_CHUNK_HEIGHT)
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        subChunk.markModifiedByPlayer()
        this.persistenceManager?.markSubChunkModified(subChunk.coordinate)
      }

      // Track the exact cell for the relight at flush time
      this.pendingRawChanges.record(Number(x), Number(y), Number(z), oldBlockId)
    }

    return changed
  }

  /**
   * Flush pending block changes - queue the relight of every changed cell
   * (run by the lighting task; the light engine remeshes whatever the changes
   * touched once their light has settled).
   * Call this after a batch of setBlockRaw calls.
   */
  flushBlockChanges(): void {
    if (this.pendingRawChanges.size === 0) return
    this.pendingRawChanges.drain((x, y, z, oldBlockId) => {
      this.lightEngine.onBlockChanged(x, y, z, oldBlockId, this.getBlockIdFast(x, y, z))
    })
  }

  /**
   * Set block at world coordinates.
   * Optionally set block metadata (for directional blocks like furnaces).
   * Returns true if the block was changed.
   */
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId, metadata?: number): boolean {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    // Get or create the column
    let column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      column = this.chunkManager.loadColumn(chunkCoord)
    }

    // Get old block ID to determine if this is a removal
    const oldBlockId = column.getBlockId(local.x, local.y, local.z)
    const wasBlockRemoved = blockId === BlockIds.AIR && oldBlockId !== BlockIds.AIR

    const changed = column.setBlockId(local.x, local.y, local.z, blockId)

    // Set metadata if provided (even if block didn't change - allows metadata updates)
    if (metadata !== undefined) {
      column.setMetadata(local.x, local.y, local.z, metadata)
    }

    if (changed) {
      const subY = Math.floor(local.y / SUB_CHUNK_HEIGHT)

      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        // Mark as modified by player for persistence
        subChunk.markModifiedByPlayer()
        this.persistenceManager?.markSubChunkModified(subChunk.coordinate)
      }

      // Relight synchronously (typically well under a millisecond; big
      // relights and bulk edits continue in the lighting task). Every
      // sub-chunk whose padded mesh volume changed - including edge/corner
      // neighbours - is remeshed once the light around it has settled
      // (released once per frame).
      this.lightEngine.onBlockChanged(Number(x), Number(y), Number(z), oldBlockId, blockId, true)
      this.relightWithinFrameBudget()

      // Trigger liquid physics for the chunk column containing this block
      const isLiquid = this.isLiquidBlockId(blockId)
      const wasLiquid = this.isLiquidBlockId(oldBlockId)
      if (isLiquid || wasLiquid || wasBlockRemoved) {
        this.liquidPhysicsManager.queueColumnAndNeighbors(x, z)
      }

      // Schedule interval ticks for this block and its neighbors (leaf decay, etc.)
      this.scheduledBlockTicks.onBlockChanged(x, y, z)

      // Handle block entities: remove old one and create new one if needed
      if (this.entityManager) {
        // Remove existing block entity at this position
        this.removeBlockEntityAt(x, y, z)

        // Create new block entity if the new block supports it
        const newBlock = getBlock(blockId)
        if (newBlock.createBlockEntity) {
          this.createBlockEntityAt(x, y, z, newBlock)
        }
      }
    }

    return changed
  }

  /**
   * A writer for one main-thread decoration pass (trees, mushrooms, ...): its
   * setBlock writes block arrays directly without per-block side effects
   * (persistence marks, scheduled ticks, block entities, liquid wake-ups,
   * synchronous relight) and records each cell for one deferred relight;
   * flush() queues those relights (the light engine remeshes whatever the
   * writes touched, including edge-adjacent neighbours) - call it when the
   * pass ends, also on failure.
   *
   * An explicit writer instead of a global batch mode: decoration passes
   * yield across frames, and a global mode made every setBlock in those
   * frames - the player's edits included - skip its side effects.
   */
  createDecorationWriter(): IDecorationWorld & { flush(): void } {
    return {
      getBlockId: (x, y, z) => this.getBlockId(x, y, z),
      setBlock: (x, y, z, blockId, metadata) => this.setBlockDecoration(x, y, z, blockId, metadata),
      flush: () => this.flushDecorationBatch(),
    }
  }

  /**
   * Lightweight raw block write used by decoration writers.
   * Records the cell for a single deferred relight.
   * Does NOT mark chunks player-modified.
   */
  private setBlockDecoration(x: bigint, y: bigint, z: bigint, blockId: BlockId, metadata?: number): boolean {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    let column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      column = this.chunkManager.loadColumn(chunkCoord)
    }

    const oldBlockId = column.getBlockId(local.x, local.y, local.z)
    const changed = column.setBlockId(local.x, local.y, local.z, blockId)
    if (metadata !== undefined) {
      column.setMetadata(local.x, local.y, local.z, metadata)
    }

    if (changed) {
      this.decorationChanges.record(Number(x), Number(y), Number(z), oldBlockId)
    }

    return changed
  }

  /**
   * Flush deferred decoration work: queue the relight of each written cell
   * once (run by the lighting task). Writes into not-yet-generated
   * sub-chunks only affect the sky above loaded data; they are lit when
   * their sub-chunk loads.
   */
  private flushDecorationBatch(): void {
    if (this.decorationChanges.size === 0) return
    this.decorationChanges.drain((x, y, z, oldBlockId) => {
      this.lightEngine.onBlockChanged(x, y, z, oldBlockId, this.getBlockIdFast(x, y, z))
    })
  }

  /**
   * Process queued light updates now, within what is left of this frame's
   * synchronous budget (player-edit priority for the sub-chunks it dirties).
   */
  private relightWithinFrameBudget(): void {
    const budgetMs = WorldManager.SYNC_LIGHT_BUDGET_MS - this.syncLightMsThisFrame
    if (budgetMs <= 0 || this.lightEngine.isQueueEmpty()) return
    const start = performance.now()
    this.lightEngine.process(budgetMs, true)
    this.syncLightMsThisFrame += performance.now() - start
  }

  /**
   * Check if a block ID is a liquid block.
   */
  private isLiquidBlockId(blockId: BlockId): boolean {
    return getBlock(blockId).properties.isLiquid
  }

  /**
   * Load chunk at the given coordinates.
   */
  loadChunk(coordinate: IChunkCoordinate): Chunk {
    return this.chunkManager.loadChunk(coordinate)
  }

  /**
   * Get chunk at the given coordinates.
   */
  getChunk(coordinate: IChunkCoordinate): Chunk | undefined {
    return this.chunkManager.getChunk(coordinate)
  }

  /**
   * Get a sub-chunk at the given coordinates.
   */
  getSubChunk(coordinate: ISubChunkCoordinate): SubChunk | undefined {
    return this.chunkManager.getSubChunk(coordinate)
  }

  /**
   * Get a chunk column at the given coordinates.
   */
  getChunkColumn(coordinate: IChunkCoordinate): ChunkColumn | undefined {
    return this.chunkManager.getColumn(coordinate)
  }

  /**
   * Get all sub-chunk meshes (frustum/occlusion culling, debug wireframes).
   */
  *getChunkMeshes(): Generator<IChunkMesh> {
    yield* this.subChunkMeshes.values()
  }

  /**
   * Get chunk containing the given world coordinates.
   */
  getChunkAt(x: bigint, y: bigint, z: bigint): Chunk | undefined {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    return this.chunkManager.getChunk(chunkCoord)
  }

  /**
   * Get the light level at a world position (float coordinates).
   * Returns combined light level (0-15) based on skylight and blocklight.
   * Returns 15 (full light) if the chunk is not loaded.
   */
  getLightLevelAtWorld(x: number, y: number, z: number): number {
    const world: IWorldCoordinate = {
      x: BigInt(Math.floor(x)),
      y: BigInt(Math.floor(y)),
      z: BigInt(Math.floor(z)),
    }
    const chunkCoord = worldToChunk(world)
    const column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      return 15 // Default to full light if chunk not loaded
    }

    const local = worldToLocal(world)
    return column.getLightLevel(local.x, local.y, local.z)
  }

  /**
   * Check if a chunk is loaded.
   */
  isChunkLoaded(coordinate: IChunkCoordinate): boolean {
    return this.chunkManager.hasChunk(coordinate)
  }

  /**
   * Check if a chunk exists without loading it.
   * Alias for isChunkLoaded for terrain generator convenience.
   */
  hasChunk(coordinate: IChunkCoordinate): boolean {
    return this.chunkManager.hasChunk(coordinate)
  }

  /**
   * Get the block registry for terrain generators to access block types.
   */
  getBlockRegistry(): BlockRegistry {
    return this.blockRegistry
  }

  /**
   * Get highest non-air block Y at world coordinates.
   * Returns null if no solid blocks exist at this column or chunk is not loaded.
   */
  getHighestBlockAt(x: bigint, z: bigint): bigint | null {
    const world: IWorldCoordinate = { x, y: 0n, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    const column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      return null
    }

    const worldY = column.getHighestBlockAt(local.x, local.z)
    return worldY !== null ? BigInt(worldY) : null
  }

  /**
   * Find ground level near a specific Y position at world coordinates.
   * Scans downward from startY to find a solid block with air above it.
   * This is useful for underground biomes where getHighestBlockAt would return the ceiling.
   *
   * @param x World X coordinate
   * @param z World Z coordinate
   * @param startY World Y coordinate to start scanning from
   * @returns World Y of the ground (solid block), or null if none found
   */
  getGroundNearY(x: bigint, z: bigint, startY: number): bigint | null {
    const world: IWorldCoordinate = { x, y: 0n, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    const column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      return null
    }

    const worldY = column.getGroundNearY(local.x, local.z, startY)
    return worldY !== null ? BigInt(worldY) : null
  }

  /**
   * Fill a region with a block type.
   * Coordinates are inclusive (both corners are filled).
   */
  fillRegion(
    x1: bigint,
    y1: bigint,
    z1: bigint,
    x2: bigint,
    y2: bigint,
    z2: bigint,
    blockId: BlockId
  ): void {
    const minX = x1 < x2 ? x1 : x2
    const maxX = x1 > x2 ? x1 : x2
    const minY = y1 < y2 ? y1 : y2
    const maxY = y1 > y2 ? y1 : y2
    const minZ = z1 < z2 ? z1 : z2
    const maxZ = z1 > z2 ? z1 : z2

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          this.setBlock(x, y, z, blockId)
        }
      }
    }
  }

  /**
   * Iterate over all blocks in a region.
   * Coordinates are inclusive (both corners are visited).
   */
  forEachBlockInRegion(
    x1: bigint,
    y1: bigint,
    z1: bigint,
    x2: bigint,
    y2: bigint,
    z2: bigint,
    callback: (x: bigint, y: bigint, z: bigint, blockId: BlockId) => void
  ): void {
    const minX = x1 < x2 ? x1 : x2
    const maxX = x1 > x2 ? x1 : x2
    const minY = y1 < y2 ? y1 : y2
    const maxY = y1 > y2 ? y1 : y2
    const minZ = z1 < z2 ? z1 : z2
    const maxZ = z1 > z2 ? z1 : z2

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const blockId = this.getBlockId(x, y, z)
          callback(x, y, z, blockId)
        }
      }
    }
  }

  /**
   * Get all loaded chunk columns.
   */
  getLoadedColumns(): ChunkColumn[] {
    return this.chunkManager.getLoadedColumns()
  }

  /**
   * Get the number of loaded columns.
   */
  getLoadedColumnCount(): number {
    return this.chunkManager.getLoadedColumnCount()
  }

  /**
   * Save a sub-chunk that is being unloaded, unless the store already holds
   * exactly its data (SubChunk.isPersistClean: loaded from a confirmed record
   * or saved, and not changed since - no edit, liquid flow, decoration or
   * merged data). Everything else that completed generation is saved.
   * `blockStates` (see collectBlockStatesForUnload) go in the same
   * transaction, or alone when the blocks need no save.
   */
  private saveSubChunkIfChanged(subChunk: SubChunk, blockStates: SerializedBlockState[] = []): void {
    if (!this.persistenceManager || subChunk.state < ChunkState.LOADED) return
    if (subChunk.isPersistClean()) {
      this.persistStats.skipped++
      // Its blocks are stored as they are; only its states (chest contents) may have changed
      if (blockStates.length > 0) {
        this.persistenceManager.saveBlockStates(blockStates)
          .catch(err => console.error('Failed to save block states on unload:', err))
      }
      return
    }
    this.persistStats.saved++
    this.persistenceManager.saveSubChunk(
      subChunk.coordinate,
      subChunk.getBlockData(),
      subChunk.getMetadataData(),
      subChunk.skyOpenAbove,
      blockStates
    ).catch(err => console.error('Failed to save sub-chunk on unload:', err))
  }

  /**
   * Serialize the block states inside a column (or one of its sub-chunks)
   * for its unload save, grouped by sub-chunk Y. Must run while the
   * sub-chunks are still loaded: afterwards the world can't name the states'
   * blocks, so regular saves skip them (getBlockStatesToPersist) and a
   * chest edited since the last save would come back with its old contents.
   *
   * The states themselves stay in BlockStateManager: the persisted records
   * are restored only once per column per session (restoredBlockStateChunks),
   * so the in-memory state is what a reload of the column in this session
   * shows - dropping it would leave that reload with an empty state.
   */
  private collectBlockStatesForUnload(chunkX: bigint, chunkZ: bigint, subY?: number): Map<number, SerializedBlockState[]> {
    const bySubY = new Map<number, SerializedBlockState[]>()
    const minX = chunkX * BigInt(CHUNK_SIZE_X)
    const minZ = chunkZ * BigInt(CHUNK_SIZE_Z)
    const maxX = minX + BigInt(CHUNK_SIZE_X)
    const maxZ = minZ + BigInt(CHUNK_SIZE_Z)
    const inside: IBlockState[] = []
    for (const state of BlockStateManager.getInstance().getAllStates()) {
      const { x, y, z } = state.position
      if (x < minX || x >= maxX || z < minZ || z >= maxZ) continue
      if (subY !== undefined && Math.floor(Number(y) / SUB_CHUNK_HEIGHT) !== subY) continue
      inside.push(state)
    }
    if (inside.length === 0) return bySubY
    for (const serialized of getBlockStatesToPersist(inside.values(), this)) {
      const stateSubY = Math.floor(Number(serialized.position.y) / SUB_CHUNK_HEIGHT)
      let list = bySubY.get(stateSubY)
      if (!list) bySubY.set(stateSubY, (list = []))
      list.push(serialized)
    }
    return bySubY
  }

  /**
   * Unload a column and remove all its sub-chunk meshes.
   * Saves its sub-chunks first (see saveSubChunkIfChanged).
   */
  unloadChunk(coordinate: IChunkCoordinate): void {
    // Save its sub-chunks, with their block states, before unloading (fire and forget)
    const column = this.chunkManager.getColumn(coordinate)
    if (column) {
      const blockStates = this.collectBlockStatesForUnload(coordinate.x, coordinate.z)
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        const subChunk = column.getSubChunk(subY)
        if (subChunk) this.saveSubChunkIfChanged(subChunk, blockStates.get(subY))
      }
    }

    // Its light stops being known: remove what it contributed to neighbouring
    // columns (unknown = dark) and invalidate every mesh that sampled it.
    if (column) {
      this.lightEngine.onColumnUnloading(column)
    }

    // Filter out any pending mesh results for this column (prevents processing stale results)
    const chunkX = Number(coordinate.x)
    const chunkZ = Number(coordinate.z)
    for (let i = this.pendingMeshResults.length - 1; i >= 0; i--) {
      const result = this.pendingMeshResults[i]
      if (result.chunkX === chunkX && result.chunkZ === chunkZ) {
        this.pendingMeshResults.splice(i, 1)
      }
    }

    // Clean up all pending mesh state and remove meshes for this column
    for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
      const subChunkKey = createSubChunkKey(coordinate.x, coordinate.z, subY)

      // Forget its pending job: a result still to come from a worker no longer
      // matches the key's pending job id and is discarded - never taken for
      // a reloaded sub-chunk's job
      this.clearPendingMeshJob(subChunkKey)

      // Remove from worker queues if present
      const queuedSubChunk = column?.getSubChunk(subY)
      if (queuedSubChunk) {
        // Priority queue
        if (this.prioritySubChunkSet.has(queuedSubChunk)) {
          const idx = this.prioritySubChunkQueue.indexOf(queuedSubChunk)
          if (idx !== -1) this.prioritySubChunkQueue.splice(idx, 1)
          this.prioritySubChunkSet.delete(queuedSubChunk)
        }
        // Normal queue
        if (this.subChunkWorkerSet.has(queuedSubChunk)) {
          const idx = this.subChunkWorkerQueue.indexOf(queuedSubChunk)
          if (idx !== -1) this.subChunkWorkerQueue.splice(idx, 1)
          this.subChunkWorkerSet.delete(queuedSubChunk)
        }
      }

      this.removeSubChunkMesh(subChunkKey, true) // true = isUnloading, also clears opacity cache
    }

    // Remove all block entities and dropped items in this chunk
    if (this.entityManager) {
      this.entityManager.removeBlockEntitiesInChunk(coordinate.x, coordinate.z)
      this.entityManager.removeDroppedItemsInChunk(coordinate.x, coordinate.z)
    }

    // Then unload the column data
    this.chunkManager.unloadColumn(coordinate)
  }

  /**
   * Unload a single sub-chunk (its column stays loaded) - e.g. one that left
   * the vertical view range: save it, take its light out of the world
   * (unknown = dark, neighbours relit and remeshed), drop its mesh, pending
   * mesh work and entities. A later load of it comes from persistence.
   * Returns false if it wasn't loaded.
   */
  unloadSubChunk(coordinate: ISubChunkCoordinate): boolean {
    const column = this.chunkManager.getColumn({ x: coordinate.x, z: coordinate.z })
    const subChunk = column?.getSubChunk(coordinate.subY)
    if (!column || !subChunk || !subChunk.lightReady) return false

    // Save it with its block states (like unloadChunk)
    this.saveSubChunkIfChanged(
      subChunk,
      this.collectBlockStatesForUnload(coordinate.x, coordinate.z, coordinate.subY).get(coordinate.subY)
    )

    // Above its column's sky proof an unloaded sub-chunk counts as open sky -
    // but this one is known to hold sky-stopping blocks (a player's platform
    // high above the ground). Keep just those cells as a placeholder, which the
    // sky scans read (like decoration writes above the loaded band), so the
    // ground below stays in their shadow instead of being lit as open sky.
    const skyBlockers = coordinate.subY > column.skyProofSubY ? this.collectSkyBlockers(subChunk) : null

    // Out of the column first: the light engine then treats it as unloaded
    column.removeSubChunk(coordinate.subY)
    if (skyBlockers) this.writePlaceholderCells(column.getOrCreateSubChunk(coordinate.subY), skyBlockers)
    this.liquidPhysicsManager.onColumnDataChanged(coordinate.x, coordinate.z)
    this.chunkManager.unregisterSubChunk(coordinate)
    this.lightEngine.onSubChunkUnloaded(column, subChunk)
    subChunk.setState(ChunkState.UNLOADED)

    // Mesh work: a result already back is dropped; a job still in a worker
    // is discarded when it answers (its id is no longer the key's pending job)
    const subChunkKey = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    const chunkX = Number(coordinate.x)
    const chunkZ = Number(coordinate.z)
    for (let i = this.pendingMeshResults.length - 1; i >= 0; i--) {
      const result = this.pendingMeshResults[i]
      if (result.chunkX === chunkX && result.chunkZ === chunkZ && result.subY === coordinate.subY) {
        this.pendingMeshResults.splice(i, 1)
      }
    }
    this.clearPendingMeshJob(subChunkKey)
    if (this.prioritySubChunkSet.delete(subChunk)) {
      const idx = this.prioritySubChunkQueue.indexOf(subChunk)
      if (idx !== -1) this.prioritySubChunkQueue.splice(idx, 1)
    }
    if (this.subChunkWorkerSet.delete(subChunk)) {
      const idx = this.subChunkWorkerQueue.indexOf(subChunk)
      if (idx !== -1) this.subChunkWorkerQueue.splice(idx, 1)
    }
    this.removeSubChunkMesh(subChunkKey, true)

    const minY = coordinate.subY * SUB_CHUNK_HEIGHT
    this.entityManager?.removeEntitiesInSubChunk(coordinate.x, coordinate.z, minY, minY + SUB_CHUNK_HEIGHT - 1)
    return true
  }

  /** Cells of a sub-chunk that stop direct sky, as flat (index, blockId, metadata) triples, or null. */
  private collectSkyBlockers(subChunk: SubChunk): number[] | null {
    const opacity = getLightTables().opacity
    const blocks = subChunk.getBlockData()
    const metadata = subChunk.getMetadataData()
    let cells: number[] | null = null
    for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
      if (opacity[blocks[i]] === 0) continue
      if (!cells) cells = []
      cells.push(i, blocks[i], metadata[i])
    }
    return cells
  }

  /** Write (index, blockId, metadata) triples into a placeholder sub-chunk (not light-ready). */
  private writePlaceholderCells(placeholder: SubChunk, cells: number[]): void {
    const blocks = placeholder.getBlockData()
    const metadata = placeholder.getMetadataData()
    for (let c = 0; c < cells.length; c += 3) {
      blocks[cells[c]] = cells[c + 1]
      metadata[cells[c]] = cells[c + 2]
    }
    placeholder.markDataChanged()
  }

  /**
   * Register a callback for when a sub-chunk mesh is added to the scene.
   * `current` is false when data arrived for the sub-chunk or one of its 26
   * neighbours after the mesh job was sent: the mesh is newer than the one it
   * replaces, but was built without that data (faces toward a neighbour that
   * was missing are culled) and a remesh is on its way.
   * Returns an unsubscribe function.
   */
  onSubChunkMeshAdded(callback: (coord: ISubChunkCoordinate, current: boolean) => void): () => void {
    this.subChunkMeshAddedCallbacks.push(callback)
    return () => {
      const index = this.subChunkMeshAddedCallbacks.indexOf(callback)
      if (index !== -1) {
        this.subChunkMeshAddedCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Register a callback for when a displayed sub-chunk mesh stops being
   * current because data arrived for the sub-chunk or one of its neighbours
   * (its remesh is queued; onSubChunkMeshAdded follows).
   * Returns an unsubscribe function.
   */
  onSubChunkMeshStale(callback: (coord: ISubChunkCoordinate) => void): () => void {
    this.subChunkMeshStaleCallbacks.push(callback)
    return () => {
      const index = this.subChunkMeshStaleCallbacks.indexOf(callback)
      if (index !== -1) {
        this.subChunkMeshStaleCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Register a callback for when a sub-chunk mesh is removed from the scene.
   * Returns an unsubscribe function.
   */
  onSubChunkMeshRemoved(callback: (coord: ISubChunkCoordinate) => void): () => void {
    this.subChunkMeshRemovedCallbacks.push(callback)
    return () => {
      const index = this.subChunkMeshRemovedCallbacks.indexOf(callback)
      if (index !== -1) {
        this.subChunkMeshRemovedCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Register a callback for when ore positions are generated for a sub-chunk.
   * Used for debug visualization.
   * Returns an unsubscribe function.
   */
  onOrePositionsGenerated(callback: (coord: ISubChunkCoordinate, positions: OrePosition[]) => void): () => void {
    this.orePositionCallbacks.push(callback)
    return () => {
      const index = this.orePositionCallbacks.indexOf(callback)
      if (index !== -1) {
        this.orePositionCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Set the scene for rendering. Call this once before any chunk rendering.
   */
  setScene(scene: THREE.Scene): void {
    this.scene = scene
  }

  /**
   * Set the WebGL renderer for proper GPU resource cleanup.
   */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost)
    this.renderer = renderer
    applyBlockTextureAnisotropy(renderer)
    renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
  }

  /**
   * Chunk geometry keeps no CPU copy once it is on the GPU (GreedyChunkMesh),
   * so it can't be re-uploaded after the WebGL context is lost: drop every
   * sub-chunk mesh and rebuild it from the world data. The new meshes upload
   * once the context is restored.
   */
  private onContextLost = (): void => {
    for (const subChunkKey of Array.from(this.subChunkMeshes.keys())) {
      this.removeSubChunkMesh(subChunkKey)
      const subChunk = this.chunkManager.getSubChunk(parseSubChunkKey(subChunkKey))
      if (subChunk) this.queueSubChunkForMeshing(subChunk)
    }
  }

  /**
   * Clear all meshes from the scene.
   */
  private clearAllMeshes(): void {
    if (!this.scene) return

    for (const subChunkMesh of this.subChunkMeshes.values()) {
      subChunkMesh.removeFromScene(this.scene)
      subChunkMesh.dispose()
    }
    this.subChunkMeshes.clear()
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.clearAllMeshes()
    this.chunkManager.dispose()

    // Terminate mesh workers
    for (const worker of this.meshWorkers) {
      worker.terminate()
    }
    this.meshWorkers.length = 0

    // Terminate generation workers
    for (const worker of this.generationWorkers) {
      worker.terminate()
    }
    this.generationWorkers.length = 0
    this.subChunkCallbackMap.clear()

    // Drop any queued block ticks
    this.scheduledBlockTicks.dispose()
  }
}
