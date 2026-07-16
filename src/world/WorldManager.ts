import * as THREE from 'three'
import type { BlockId, IBlock } from './interfaces/IBlock.ts'
import type { IChunkCoordinate, IWorldCoordinate, ISubChunkCoordinate } from './interfaces/ICoordinates.ts'
import { createChunkKey, parseChunkKey, createSubChunkKey, parseSubChunkKey, type ChunkKey, type SubChunkKey } from './interfaces/ICoordinates.ts'
import { worldToChunk, worldToLocal, localToWorld } from './coordinates/CoordinateUtils.ts'
import { ChunkManager } from './chunks/ChunkManager.ts'
import { BlockRegistry, getBlock } from './blocks/BlockRegistry.ts'
import { Chunk } from './chunks/Chunk.ts'
import { BlockIds } from './blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, ChunkState, SUB_CHUNK_VOLUME, SUB_CHUNK_COUNT } from './interfaces/IChunk.ts'
import { ChunkMesh, type IChunkMesh } from '../renderer/ChunkMesh.ts'
import { GreedyChunkMesh } from '../renderer/GreedyChunkMesh.ts'
import type { SubChunkOpacityCache } from '../renderer/SubChunkOpacityCache.ts'
import GreedyMeshWorker from '../workers/GreedyMeshWorker.ts?worker'
import type { GreedyMeshRequest, GreedyMeshResponse, GreedyMeshError } from '../workers/GreedyMeshWorker.ts'
import { buildFaceTextureMap } from './blocks/FaceTextureRegistry.ts'
import { buildTextureAtlas, serializeAtlasRegions, type AtlasRegion } from '../renderer/TextureAtlas.ts'
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
import type { WaterEdgeEffects } from './generate/features/WaterFeature.ts'
import { BackgroundLightingManager } from './lighting/BackgroundLightingManager.ts'
import { BackgroundLiquidPhysicsManager } from './liquid/BackgroundLiquidPhysicsManager.ts'
import type { PersistenceManager, IModifiedChunkProvider } from '../persistence/PersistenceManager.ts'
import type { EntityManager } from '../entities/EntityManager.ts'
import { BlockStateManager } from './blockstate/BlockStateManager.ts'
import type { IBlockState } from './blockstate/interfaces/IBlockState.ts'
import type { ITickableBlockState } from './blockstate/interfaces/ITickableBlockState.ts'
import { deserializeBlockState } from '../persistence/BlockStateSerializer.ts'

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
  private readonly chunkMeshes: Map<ChunkKey, ChunkMesh> = new Map()
  private readonly subChunkMeshes: Map<SubChunkKey, GreedyChunkMesh> = new Map()
  private readonly subChunkMeshAddedCallbacks: Array<(coord: ISubChunkCoordinate) => void> = []
  private readonly subChunkMeshRemovedCallbacks: Array<(coord: ISubChunkCoordinate) => void> = []
  private readonly orePositionCallbacks: Array<(coord: ISubChunkCoordinate, positions: OrePosition[]) => void> = []

  // Web Worker pool for mesh building
  private readonly meshWorkers: Worker[] = []
  private readonly prioritySubChunkQueue: SubChunk[] = [] // High priority (player interactions)
  private readonly subChunkWorkerQueue: SubChunk[] = [] // Normal priority (background updates)
  // Sets for O(1) queue membership checks (mirrors queues above)
  private readonly prioritySubChunkSet: Set<SubChunk> = new Set()
  private readonly subChunkWorkerSet: Set<SubChunk> = new Set()
  private readonly pendingSubChunks: Map<SubChunkKey, SubChunk> = new Map()
  // Track sub-chunks that need re-meshing after their current worker job finishes
  // (handles race condition where lighting update arrives while mesh is being built)
  private readonly pendingRemeshSet: Set<SubChunkKey> = new Set()
  private readonly WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 8)
  private readonly MAX_BACKGROUND_MESH_JOBS_PER_FRAME = 2

  // Mesh result throttling to prevent GPU command buffer flooding
  private readonly pendingMeshResults: GreedyMeshResponse[] = []
  private readonly MAX_MESH_RESULTS_PER_FRAME = 4
  private readonly MESH_QUEUE_WARNING_THRESHOLD = 100

  // Cache of opaque block IDs for worker visibility checks
  private opaqueBlockIds: number[] = []
  private opaqueBlockIdSet: Set<number> = new Set()

  // Numeric sets of block IDs that need per-block handling when a sub-chunk is
  // applied. Typically <5 ids, so scanning the raw block array against these
  // avoids a registry lookup (and BigInt coordinate allocation) per non-air block.
  private blockEntityIdSet: Set<number> = new Set() // ids defining createBlockEntity
  private onLoadOrEntityIdSet: Set<number> = new Set() // ids defining onLoad or createBlockEntity

  // Decoration batching. While a batch is active, setBlock takes a lightweight
  // path (raw array write only) and defers lighting/meshing until the batch ends,
  // so structure placement (trees, etc.) pays one lighting + mesh enqueue per
  // touched sub-chunk instead of the full per-block side-effect cascade.
  private decorationBatchDepth = 0
  private readonly decorationTouchedSubChunks: Set<SubChunk> = new Set()
  private readonly decorationNeighborSubChunks: Set<SubChunk> = new Set()

  // Face texture map for greedy meshing (built once, sent to workers)
  private faceTextureMapEntries: Array<[number, number]> = []
  private atlasRegionEntries: Array<[number, AtlasRegion]> = []
  private nonGreedyBlockIds: number[] = []
  // Track which workers have received the initialization data
  private readonly workersInitialized: Set<number> = new Set()

  // Opacity cache for software occlusion culling
  private opacityCache: SubChunkOpacityCache | null = null

  // Background lighting manager for all lighting updates (generation and block changes)
  private readonly backgroundLightingManager: BackgroundLightingManager

  // Liquid physics manager for water flow simulation (background worker pool)
  private readonly liquidPhysicsManager: BackgroundLiquidPhysicsManager

  // Persistence manager for saving/loading world data
  private persistenceManager: PersistenceManager | null = null

  // Entity manager for block entities
  private entityManager: EntityManager | null = null

  // Track chunks that have had their block states restored from persistence
  // Prevents duplicate restoration when loading multiple sub-chunks from same chunk
  private readonly restoredBlockStateChunks: Set<ChunkKey> = new Set()

  // Web Worker pool for chunk generation (terrain, caves, lighting)
  private readonly generationWorkers: Worker[] = []
  private readonly readyGenerationWorkers: Worker[] = [] // Only workers that have initialized
  private readonly subChunkCallbackMap: Map<
    string,
    {
      resolve: (data: SubChunkGenerationResponse) => void
      reject: (error: Error) => void
      timestamp: number
    }
  > = new Map()
  private generationWorkerIndex = 0

  constructor() {
    this.chunkManager = new ChunkManager()
    this.blockRegistry = BlockRegistry.getInstance()
    this.initWorkers()
    this.updateOpaqueBlockIds()
    this.buildFaceTextureMap()

    // Initialize background lighting manager
    this.backgroundLightingManager = new BackgroundLightingManager({
      columnsPerUpdate: 1, // Process 1 column per frame to reduce frame time impact
      reprocessCooldown: 60000, // Re-check columns every 60 seconds
    })
    this.backgroundLightingManager.setCallbacks(
      (coord) => this.chunkManager.getColumn(coord),
      (subChunk, priority, forceRequeue) => this.queueSubChunkForMeshing(subChunk, priority, forceRequeue)
    )

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

    // Reset per-worker flags so workers get updated map on next request
    this.workersInitialized.clear()
  }

  /**
   * Initialize the texture atlas for reduced draw calls.
   * Call this after blocks are registered and before rendering.
   */
  async initializeAtlas(): Promise<void> {
    await buildTextureAtlas()
    this.atlasRegionEntries = serializeAtlasRegions()
    console.log(`Texture atlas built with ${this.atlasRegionEntries.length} regions`)
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
    lightData: Uint8Array
    metadata: Uint8Array
  }> {
    const chunks: Array<{
      coordinate: ISubChunkCoordinate
      blocks: Uint16Array
      lightData: Uint8Array
      metadata: Uint8Array
    }> = []

    for (const subChunk of this.chunkManager.getLoadedSubChunks()) {
      chunks.push({
        coordinate: subChunk.coordinate,
        blocks: subChunk.getBlockData(),
        lightData: subChunk.getLightData(),
        metadata: subChunk.getMetadataData(),
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

    for (const [key, callback] of this.subChunkCallbackMap.entries()) {
      const age = now - callback.timestamp
      if (age > stuckThreshold) {
        stuckCount++
        if (stuckCount <= 5) {
          console.warn(`[WorldManager] Stuck generation request: ${key} (${(age / 1000).toFixed(1)}s)`)
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
        if (event.data.type === 'greedy-mesh-error') {
          // Clean up the stuck entry so chunk can be re-queued
          const key = createSubChunkKey(BigInt(event.data.chunkX), BigInt(event.data.chunkZ), event.data.subY)
          this.pendingSubChunks.delete(key)
          this.pendingRemeshSet.delete(key)
          console.warn(`Greedy mesh worker error for chunk ${event.data.chunkX},${event.data.chunkZ} subY=${event.data.subY}:`, event.data.error)
          return
        }
        this.handleSubChunkMeshResult(event.data)
      }
      worker.onerror = (error) => {
        console.error('Greedy mesh worker error:', error)
        // Save all pending sub-chunks before clearing, then re-queue them
        // This prevents losing mesh results from other workers that are still processing
        const toRequeue = Array.from(this.pendingSubChunks.values())
        this.pendingSubChunks.clear()
        this.pendingRemeshSet.clear()
        // Re-queue all pending sub-chunks with high priority
        for (const subChunk of toRequeue) {
          this.queueSubChunkForMeshing(subChunk, 'high')
        }
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
   * Create a single generation worker with retry logic.
   */
  private createGenerationWorker(index: number, retryCount = 0): void {
    const worker = new Worker(
      new URL('../workers/ChunkGenerationWorker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (
      event: MessageEvent<SubChunkGenerationResponse | SubChunkGenerationError | { type: 'worker-ready' }>
    ) => {
      if (event.data.type === 'worker-ready') {
        this.readyGenerationWorkers.push(worker)
        console.log(`[WorldManager] Generation worker ${index} ready (${this.readyGenerationWorkers.length}/${this.WORKER_COUNT})`)
        return
      }
      this.handleSubChunkGenerationResult(event.data)
    }
    worker.onerror = (event) => {
      const errorEvent = event as ErrorEvent
      console.error(`[WorldManager] Generation worker ${index} error (attempt ${retryCount + 1}):`, {
        message: errorEvent.message,
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
      })
      // Remove this worker from the ready pool if it was there
      const idx = this.readyGenerationWorkers.indexOf(worker)
      if (idx !== -1) {
        this.readyGenerationWorkers.splice(idx, 1)
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
    const subChunkKey = createSubChunkKey(BigInt(result.chunkX), BigInt(result.chunkZ), result.subY)
    const callbacks = this.subChunkCallbackMap.get(subChunkKey)

    if (!callbacks) {
      console.warn(`[WorldManager] Received generation result for unknown sub-chunk: ${subChunkKey}`)
      return
    }
    this.subChunkCallbackMap.delete(subChunkKey)

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
  ): Promise<{ blocks: Uint16Array; lightData: Uint8Array; metadataData: Uint8Array; orePositions: OrePosition[]; isFullyOpaque: boolean; waterEdgeEffects?: WaterEdgeEffects }> {
    const subChunkKey = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)

    // Pre-allocate buffers (will be transferred to worker)
    const blocks = new Uint16Array(SUB_CHUNK_VOLUME)
    const lightData = new Uint8Array(SUB_CHUNK_VOLUME)

    const request: SubChunkGenerationRequest = {
      type: 'generate-subchunk',
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
    }

    return new Promise((resolve, reject) => {
      this.subChunkCallbackMap.set(subChunkKey, {
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
            waterEdgeEffects: response.waterEdgeEffects,
          })
        },
        reject,
        timestamp: Date.now(),
      })

      // Round-robin worker selection - only use ready workers
      if (this.readyGenerationWorkers.length === 0) {
        reject(new Error('No generation workers ready'))
        this.subChunkCallbackMap.delete(subChunkKey)
        return
      }
      const worker = this.readyGenerationWorkers[
        this.generationWorkerIndex++ % this.readyGenerationWorkers.length
      ]

      // Transfer buffers to worker
      worker.postMessage(request, [blocks.buffer, lightData.buffer])
    })
  }

  /**
   * Apply worker-generated data to a sub-chunk.
   * Creates the sub-chunk and ChunkColumn if necessary.
   * @param isFullyOpaque - Opacity computed in worker (avoids main thread computation)
   * @param skylightValue - Maximum skylight value for this chunk's biome (0-15)
   * @param metadata - Block metadata (rotation, etc.) from persistence
   */
  async applySubChunkData(
    coordinate: ISubChunkCoordinate,
    blocks: Uint16Array,
    lightData: Uint8Array,
    isFullyOpaque?: boolean,
    skylightValue?: number,
    metadata?: Uint8Array
  ): Promise<void> {
    // Get or create the chunk column
    const chunkCoord: IChunkCoordinate = { x: coordinate.x, z: coordinate.z }
    let column = this.chunkManager.getColumn(chunkCoord)

    if (!column) {
      column = this.chunkManager.loadColumn(chunkCoord)
    }

    // Get or create the sub-chunk
    const subChunk = column.getOrCreateSubChunk(coordinate.subY)

    // Set the biome's skylight value on the sub-chunk (if provided)
    // Each sub-chunk can have a different skylight value based on its layer/biome
    if (skylightValue !== undefined) {
      subChunk.skylightValue = skylightValue
      // Also update column for backward compatibility (use max of all sub-chunks)
      column.skylightValue = Math.max(column.skylightValue, skylightValue)
    }

    // Apply the block, light, and metadata data
    subChunk.applyWorkerData(blocks, lightData, metadata)

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

    // Queue for meshing
    this.queueSubChunkForMeshing(subChunk)

    // Queue column for background lighting correction
    this.backgroundLightingManager.queueColumn(chunkCoord)
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
        } else {
          // State doesn't exist (block wasn't loaded yet, or was broken)
          // Create a new state with the saved data
          const newState = deserializeBlockState(serialized)
          if (newState) {
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
   * Get an idle worker (simple round-robin for now).
   */
  private getIdleWorker(): Worker | null {
    if (this.pendingSubChunks.size < this.WORKER_COUNT) {
      return this.meshWorkers[this.pendingSubChunks.size % this.WORKER_COUNT]
    }
    return null
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
      this.sendSubChunkToWorker(subChunk, worker)
    }

    // Process limited background items to prevent frame spikes
    let backgroundJobsSent = 0
    while (this.subChunkWorkerQueue.length > 0 && backgroundJobsSent < this.MAX_BACKGROUND_MESH_JOBS_PER_FRAME) {
      const worker = this.getIdleWorker()
      if (!worker) break

      const subChunk = this.subChunkWorkerQueue.shift()!
      this.subChunkWorkerSet.delete(subChunk) // Keep Set in sync
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
   * Process pending mesh results with throttling.
   * Call this once per frame from the update loop.
   * Limits GPU buffer uploads to prevent compositor blocking.
   */
  processPendingMeshResults(): void {
    let processed = 0

    while (this.pendingMeshResults.length > 0 && processed < this.MAX_MESH_RESULTS_PER_FRAME) {
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
    const subChunk = this.pendingSubChunks.get(subChunkKey)
    this.pendingSubChunks.delete(subChunkKey)

    // Check if this sub-chunk needs to be re-meshed with updated data
    // (happens when lighting update arrived while mesh was being built)
    if (this.pendingRemeshSet.has(subChunkKey)) {
      this.pendingRemeshSet.delete(subChunkKey)
      // Re-queue for meshing with latest light data
      if (subChunk) {
        this.queueSubChunkForMeshing(subChunk, 'high')
      }
      // Still process this result to show something, but it will be replaced
    }

    if (!subChunk) return

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

    // Notify listeners
    for (const callback of this.subChunkMeshAddedCallbacks) {
      callback(subChunk.coordinate)
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

    // Get neighbor sub-chunk data for edge visibility checks
    const neighbors = this.getSubChunkNeighborData(coord)
    const neighborLights = this.getSubChunkNeighborLightData(coord)

    // Copy block, light, and metadata data
    const blocksCopy = new Uint16Array(subChunk.getBlockData())
    const lightCopy = new Uint8Array(subChunk.getLightData())
    const metadataCopy = new Uint8Array(subChunk.getMetadataData())

    // Check if this worker needs initialization data
    const workerIndex = this.meshWorkers.indexOf(worker)
    const needsInit = !this.workersInitialized.has(workerIndex)

    const request: GreedyMeshRequest = {
      type: 'greedy-mesh',
      chunkX: Number(coord.x),
      chunkZ: Number(coord.z),
      subY: coord.subY,
      minWorldY: coord.subY * SUB_CHUNK_HEIGHT,
      blocks: blocksCopy,
      lightData: lightCopy,
      metadata: metadataCopy,
      neighbors,
      neighborLights,
      opaqueBlockIds: this.opaqueBlockIds,
      // Send face texture map and atlas regions on first request to each worker
      faceTextureMapEntries: needsInit ? this.faceTextureMapEntries : undefined,
      atlasRegionEntries: needsInit ? this.atlasRegionEntries : undefined,
      nonGreedyBlockIds: needsInit ? this.nonGreedyBlockIds : undefined,
    }

    // Mark this worker as initialized
    if (needsInit) {
      this.workersInitialized.add(workerIndex)
    }

    this.pendingSubChunks.set(subChunkKey, subChunk)

    // Transfer the copied data plus the freshly extracted neighbor boundary slabs.
    // The slabs are private copies owned by this call, so transferring (zero-copy)
    // is safe and avoids structured-cloning them on the main thread.
    const transfer: Transferable[] = [blocksCopy.buffer, lightCopy.buffer, metadataCopy.buffer]
    for (const slab of [neighbors.posX, neighbors.negX, neighbors.posZ, neighbors.negZ, neighbors.posY, neighbors.negY]) {
      if (slab) transfer.push(slab.buffer)
    }
    for (const slab of [neighborLights.posX, neighborLights.negX, neighborLights.posZ, neighborLights.negZ, neighborLights.posY, neighborLights.negY]) {
      if (slab) transfer.push(slab.buffer)
    }
    worker.postMessage(request, transfer)
  }

  /**
   * Get neighbor sub-chunk block data for meshing (6 neighbors).
   */
  private getSubChunkNeighborData(coord: ISubChunkCoordinate): {
    posX: Uint16Array | null
    negX: Uint16Array | null
    posZ: Uint16Array | null
    negZ: Uint16Array | null
    posY: Uint16Array | null
    negY: Uint16Array | null
  } {
    const { x, z, subY } = coord

    const posXSub = this.chunkManager.getSubChunk({ x: x + 1n, z, subY })
    const negXSub = this.chunkManager.getSubChunk({ x: x - 1n, z, subY })
    const posZSub = this.chunkManager.getSubChunk({ x, z: z + 1n, subY })
    const negZSub = this.chunkManager.getSubChunk({ x, z: z - 1n, subY })

    // Vertical neighbors (boundary layers only: 32x32 = 1024 elements)
    let posY: Uint16Array | null = null
    let negY: Uint16Array | null = null

    if (subY < 15) {
      const aboveSub = this.chunkManager.getSubChunk({ x, z, subY: subY + 1 })
      if (aboveSub) {
        posY = this.extractBoundaryLayer(aboveSub, 0) // y=0 layer of sub-chunk above
      }
    }

    if (subY > 0) {
      const belowSub = this.chunkManager.getSubChunk({ x, z, subY: subY - 1 })
      if (belowSub) {
        negY = this.extractBoundaryLayer(belowSub, SUB_CHUNK_HEIGHT - 1) // y=31 layer of sub-chunk below
      }
    }

    // Horizontal neighbors: only the single boundary face is read by the worker,
    // so extract 32x32 slabs (~2KB) instead of cloning the full 64KB arrays.
    // negX face is the neighbor's x=31 plane; posX its x=0 plane;
    // negZ its z=31 plane; posZ its z=0 plane.
    return {
      posX: posXSub ? this.extractBoundaryLayerX(posXSub, 0) : null,
      negX: negXSub ? this.extractBoundaryLayerX(negXSub, CHUNK_SIZE_X - 1) : null,
      posZ: posZSub ? this.extractBoundaryLayerZ(posZSub, 0) : null,
      negZ: negZSub ? this.extractBoundaryLayerZ(negZSub, CHUNK_SIZE_Z - 1) : null,
      posY,
      negY,
    }
  }

  /**
   * Get neighbor sub-chunk light data for meshing.
   */
  private getSubChunkNeighborLightData(coord: ISubChunkCoordinate): {
    posX: Uint8Array | null
    negX: Uint8Array | null
    posZ: Uint8Array | null
    negZ: Uint8Array | null
    posY: Uint8Array | null
    negY: Uint8Array | null
  } {
    const { x, z, subY } = coord

    const posXSub = this.chunkManager.getSubChunk({ x: x + 1n, z, subY })
    const negXSub = this.chunkManager.getSubChunk({ x: x - 1n, z, subY })
    const posZSub = this.chunkManager.getSubChunk({ x, z: z + 1n, subY })
    const negZSub = this.chunkManager.getSubChunk({ x, z: z - 1n, subY })

    // Vertical neighbors
    let posY: Uint8Array | null = null
    let negY: Uint8Array | null = null

    if (subY < 15) {
      const aboveSub = this.chunkManager.getSubChunk({ x, z, subY: subY + 1 })
      if (aboveSub) {
        posY = this.extractLightBoundaryLayer(aboveSub, 0)
      }
    }

    if (subY > 0) {
      const belowSub = this.chunkManager.getSubChunk({ x, z, subY: subY - 1 })
      if (belowSub) {
        negY = this.extractLightBoundaryLayer(belowSub, SUB_CHUNK_HEIGHT - 1)
      }
    }

    // Horizontal neighbors: extract the single boundary face read by the worker
    // (mirrors getSubChunkNeighborData) instead of cloning the full light arrays.
    return {
      posX: posXSub ? this.extractLightBoundaryLayerX(posXSub, 0) : null,
      negX: negXSub ? this.extractLightBoundaryLayerX(negXSub, CHUNK_SIZE_X - 1) : null,
      posZ: posZSub ? this.extractLightBoundaryLayerZ(posZSub, 0) : null,
      negZ: negZSub ? this.extractLightBoundaryLayerZ(negZSub, CHUNK_SIZE_Z - 1) : null,
      posY,
      negY,
    }
  }

  /**
   * Extract a 32x32 boundary layer of blocks from a sub-chunk.
   */
  private extractBoundaryLayer(subChunk: SubChunk, y: number): Uint16Array {
    const layer = new Uint16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)
    const blocks = subChunk.getBlockData()

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const srcIdx = y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
        const dstIdx = z * CHUNK_SIZE_X + x
        layer[dstIdx] = blocks[srcIdx]
      }
    }

    return layer
  }

  /**
   * Extract a 32x32 boundary layer of light data from a sub-chunk.
   */
  private extractLightBoundaryLayer(subChunk: SubChunk, y: number): Uint8Array {
    const layer = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)
    const lightData = subChunk.getLightData()

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const srcIdx = y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
        const dstIdx = z * CHUNK_SIZE_X + x
        layer[dstIdx] = lightData[srcIdx]
      }
    }

    return layer
  }

  /**
   * Extract an X-face boundary slab of blocks (fixed x, all y/z) from a sub-chunk.
   * Layout: index = y * CHUNK_SIZE_Z + z. Worker reads posX/negX with this layout.
   */
  private extractBoundaryLayerX(subChunk: SubChunk, x: number): Uint16Array {
    const slab = new Uint16Array(SUB_CHUNK_HEIGHT * CHUNK_SIZE_Z)
    const blocks = subChunk.getBlockData()

    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const srcIdx = y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
        slab[y * CHUNK_SIZE_Z + z] = blocks[srcIdx]
      }
    }

    return slab
  }

  /**
   * Extract a Z-face boundary slab of blocks (fixed z, all y/x) from a sub-chunk.
   * Layout: index = y * CHUNK_SIZE_X + x. Worker reads posZ/negZ with this layout.
   */
  private extractBoundaryLayerZ(subChunk: SubChunk, z: number): Uint16Array {
    const slab = new Uint16Array(SUB_CHUNK_HEIGHT * CHUNK_SIZE_X)
    const blocks = subChunk.getBlockData()

    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const srcIdx = y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
        slab[y * CHUNK_SIZE_X + x] = blocks[srcIdx]
      }
    }

    return slab
  }

  /**
   * Extract an X-face boundary slab of light data (fixed x, all y/z) from a sub-chunk.
   */
  private extractLightBoundaryLayerX(subChunk: SubChunk, x: number): Uint8Array {
    const slab = new Uint8Array(SUB_CHUNK_HEIGHT * CHUNK_SIZE_Z)
    const lightData = subChunk.getLightData()

    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const srcIdx = y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
        slab[y * CHUNK_SIZE_Z + z] = lightData[srcIdx]
      }
    }

    return slab
  }

  /**
   * Extract a Z-face boundary slab of light data (fixed z, all y/x) from a sub-chunk.
   */
  private extractLightBoundaryLayerZ(subChunk: SubChunk, z: number): Uint8Array {
    const slab = new Uint8Array(SUB_CHUNK_HEIGHT * CHUNK_SIZE_X)
    const lightData = subChunk.getLightData()

    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const srcIdx = y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
        slab[y * CHUNK_SIZE_X + x] = lightData[srcIdx]
      }
    }

    return slab
  }

  /**
   * Queue a sub-chunk for background meshing via Web Worker.
   * @param subChunk The sub-chunk to mesh
   * @param priority 'high' for player interactions (immediate), 'normal' for background (throttled)
   */
  queueSubChunkForMeshing(
    subChunk: SubChunk,
    priority: 'high' | 'normal' = 'normal',
    forceRequeue: boolean = false
  ): void {
    const subChunkKey = createSubChunkKey(
      subChunk.coordinate.x,
      subChunk.coordinate.z,
      subChunk.coordinate.subY
    )

    // Handle force requeue - remove from existing queues to re-add with updated data
    if (forceRequeue) {
      // Remove from priority queue if present
      if (this.prioritySubChunkSet.has(subChunk)) {
        const priorityIdx = this.prioritySubChunkQueue.indexOf(subChunk)
        if (priorityIdx !== -1) {
          this.prioritySubChunkQueue.splice(priorityIdx, 1)
        }
        this.prioritySubChunkSet.delete(subChunk)
      }
      // Remove from normal queue if present
      if (this.subChunkWorkerSet.has(subChunk)) {
        const normalIdx = this.subChunkWorkerQueue.indexOf(subChunk)
        if (normalIdx !== -1) {
          this.subChunkWorkerQueue.splice(normalIdx, 1)
        }
        this.subChunkWorkerSet.delete(subChunk)
      }
    }

    // Don't queue if already pending (worker is processing) or in queue
    // Skip these checks if forceRequeue already removed from queues
    if (this.pendingSubChunks.has(subChunkKey)) {
      // Sub-chunk is currently being processed by worker
      if (forceRequeue) {
        // Mark for re-mesh after worker finishes (handles race where lighting
        // update arrives while mesh is being built with stale light data)
        this.pendingRemeshSet.add(subChunkKey)
      }
      return
    }
    if (!forceRequeue) {
      if (this.prioritySubChunkSet.has(subChunk)) return
      if (this.subChunkWorkerSet.has(subChunk)) return
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
   * Update background systems (lighting correction, etc).
   * Call this each frame from the main loop.
   * @param playerX Player world X position for priority lighting
   * @param playerZ Player world Z position for priority lighting
   */
  update(playerX: number, playerZ: number): void {
    this.backgroundLightingManager.setPlayerPosition(playerX, playerZ)
    this.backgroundLightingManager.update()
  }

  /**
   * Update the lighting queue (does NOT process columns).
   * Call this every frame to keep the queue up to date.
   */
  updateLightingQueue(playerX: number, playerZ: number): void {
    this.backgroundLightingManager.setPlayerPosition(playerX, playerZ)
    this.backgroundLightingManager.updateQueue()
  }

  /**
   * Process a single lighting column.
   * Used by the task scheduler for budget-aware processing.
   * @returns true if work was done (more may remain), false if no work
   */
  processNextLightingColumn(): boolean {
    return this.backgroundLightingManager.processNextColumn()
  }

  /**
   * Check if there is lighting work pending.
   */
  hasLightingWorkPending(): boolean {
    return this.backgroundLightingManager.hasWorkPending()
  }

  /**
   * Get background lighting statistics for debug display.
   */
  getBackgroundLightingStats(): {
    queued: number
    processing: number
  } {
    return this.backgroundLightingManager.getStats()
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
   * Register a callback for when a column starts being lit.
   */
  onColumnLightingStarted(callback: (coord: IChunkCoordinate) => void): () => void {
    return this.backgroundLightingManager.onLightingStarted(callback)
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
      chunkMesh.dispose(this.renderer ?? undefined)
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
   * Numeric fast-path variant of getLightLevelAtWorld. See getBlockIdFast.
   * Returns 15 (full light) when the column is not loaded.
   */
  getLightLevelFast(x: number, y: number, z: number): number {
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const column = this.chunkManager.getColumnFast(bx >> 5, bz >> 5)
    if (!column) {
      return 15
    }
    return column.getLightLevel(bx & 31, by, bz & 31)
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

  // Track pending block changes for bulk updates
  private readonly pendingBlockChanges: Map<string, { coord: IChunkCoordinate; subY: number; wasRemoval: boolean }> = new Map()

  /**
   * Set block at world coordinates without triggering updates.
   * Use flushBlockChanges() after bulk updates to trigger lighting/meshing.
   * Returns true if the block was changed.
   */
  setBlockRaw(x: bigint, y: bigint, z: bigint, blockId: BlockId): boolean {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    let column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      column = this.chunkManager.loadColumn(chunkCoord)
    }

    const oldBlockId = column.getBlockId(local.x, local.y, local.z)
    const wasBlockRemoved = blockId === BlockIds.AIR && oldBlockId !== BlockIds.AIR

    const changed = column.setBlockId(local.x, local.y, local.z, blockId)
    if (changed) {
      const subY = Math.floor(local.y / SUB_CHUNK_HEIGHT)
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        subChunk.markModifiedByPlayer()
        this.persistenceManager?.markSubChunkModified(subChunk.coordinate)
      }

      // Track this change for later flushing
      const key = `${chunkCoord.x},${chunkCoord.z},${subY}`
      const existing = this.pendingBlockChanges.get(key)
      if (!existing || wasBlockRemoved) {
        this.pendingBlockChanges.set(key, { coord: chunkCoord, subY, wasRemoval: wasBlockRemoved || existing?.wasRemoval || false })
      }
    }

    return changed
  }

  /**
   * Flush pending block changes - trigger lighting and meshing updates.
   * Call this after a batch of setBlockRaw calls.
   */
  flushBlockChanges(): void {
    for (const [, { coord, subY, wasRemoval }] of this.pendingBlockChanges) {
      const column = this.chunkManager.getColumn(coord)
      if (!column) continue

      // Queue lighting update for this subchunk
      this.backgroundLightingManager.queueBlockChange(
        column,
        16, // middle of chunk - lighting will propagate
        subY * SUB_CHUNK_HEIGHT + 16,
        16,
        wasRemoval
      )
    }

    this.pendingBlockChanges.clear()
  }

  /**
   * Set block at world coordinates.
   * Optionally set block metadata (for directional blocks like furnaces).
   * Returns true if the block was changed.
   */
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId, metadata?: number): boolean {
    // Decoration batch fast path: write raw, defer side effects to endDecorationBatch.
    if (this.decorationBatchDepth > 0) {
      return this.setBlockDecoration(x, y, z, blockId, metadata)
    }

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

      // Immediately queue mesh rebuild with high priority for responsive feedback
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        // this.queueSubChunkForMeshing(subChunk, 'high') <--- THIS IS THE TREE ISSUE

        // Mark as modified by player for persistence
        subChunk.markModifiedByPlayer()
        this.persistenceManager?.markSubChunkModified(subChunk.coordinate)
      }

      // Also queue lighting update - will remesh again with correct lighting
      this.backgroundLightingManager.queueBlockChange(
        column,
        local.x,
        local.y,
        local.z,
        wasBlockRemoved
      )

      // Mark horizontal neighbor sub-chunks dirty if on chunk edge
      // Also trigger lighting updates for neighboring columns
      this.markSubChunkNeighborsDirtyIfEdge(chunkCoord, local.x, local.y, local.z, subY, wasBlockRemoved)

      // Note: Vertical neighbor sub-chunks at Y boundaries are handled by the
      // lighting worker callback - it marks them as changed so they get remeshed
      // with correct lighting data (avoiding race condition with stale light)

      // Trigger liquid physics for the chunk column containing this block
      const isLiquid = this.isLiquidBlockId(blockId)
      const wasLiquid = this.isLiquidBlockId(oldBlockId)
      if (isLiquid || wasLiquid || wasBlockRemoved) {
        this.liquidPhysicsManager.queueColumnAndNeighbors(x, z)
      }

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
   * Begin a decoration batch. While active, setBlock writes blocks directly into
   * sub-chunk arrays without per-block lighting/meshing/persistence side effects.
   * Nestable / safe under concurrent (interleaved async) decoration passes.
   * Must be paired with endDecorationBatch().
   */
  beginDecorationBatch(): void {
    this.decorationBatchDepth++
  }

  /**
   * End a decoration batch and flush deferred work: one meshing + lighting enqueue
   * per touched sub-chunk (plus a mesh-only refresh of edge-adjacent neighbors so
   * cross-chunk face culling stays correct). Flushing on every end (rather than only
   * at depth 0) keeps writes from being stranded when async batches interleave.
   */
  endDecorationBatch(): void {
    if (this.decorationBatchDepth > 0) {
      this.decorationBatchDepth--
    }
    this.flushDecorationBatch()
  }

  /**
   * Lightweight raw block write used during decoration batches.
   * Records touched sub-chunks (and edge neighbors) for a single deferred flush.
   * Does NOT mark chunks player-modified (decorations regenerate deterministically).
   */
  private setBlockDecoration(x: bigint, y: bigint, z: bigint, blockId: BlockId, metadata?: number): boolean {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)
    const local = worldToLocal(world)

    let column = this.chunkManager.getColumn(chunkCoord)
    if (!column) {
      column = this.chunkManager.loadColumn(chunkCoord)
    }

    const changed = column.setBlockId(local.x, local.y, local.z, blockId)
    if (metadata !== undefined) {
      column.setMetadata(local.x, local.y, local.z, metadata)
    }

    if (changed) {
      const subY = Math.floor(local.y / SUB_CHUNK_HEIGHT)
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        this.decorationTouchedSubChunks.add(subChunk)
      }
      // Edge writes need the horizontal neighbor's boundary mesh refreshed (face culling).
      if (local.x === 0) this.recordDecorationNeighbor(chunkCoord.x - 1n, chunkCoord.z, subY)
      else if (local.x === CHUNK_SIZE_X - 1) this.recordDecorationNeighbor(chunkCoord.x + 1n, chunkCoord.z, subY)
      if (local.z === 0) this.recordDecorationNeighbor(chunkCoord.x, chunkCoord.z - 1n, subY)
      else if (local.z === CHUNK_SIZE_Z - 1) this.recordDecorationNeighbor(chunkCoord.x, chunkCoord.z + 1n, subY)
    }

    return changed
  }

  /**
   * Record a horizontal neighbor sub-chunk for a mesh-only refresh at batch end.
   */
  private recordDecorationNeighbor(chunkX: bigint, chunkZ: bigint, subY: number): void {
    const column = this.chunkManager.getColumn({ x: chunkX, z: chunkZ })
    if (!column) return
    const subChunk = column.getSubChunk(subY)
    if (subChunk) {
      this.decorationNeighborSubChunks.add(subChunk)
    }
  }

  /**
   * Flush deferred decoration work: mesh + light each touched sub-chunk once,
   * and mesh-only each edge neighbor that wasn't itself written to.
   */
  private flushDecorationBatch(): void {
    if (this.decorationTouchedSubChunks.size === 0 && this.decorationNeighborSubChunks.size === 0) {
      return
    }

    for (const subChunk of this.decorationTouchedSubChunks) {
      // forceRequeue so the tree data meshes even if a pre-decoration mesh job is
      // still in flight for this sub-chunk (applySubChunkData queued one earlier).
      this.queueSubChunkForMeshing(subChunk, 'normal', true)
      // Full-column relight rather than a single fixed-position queueBlockChange:
      // the worker's 'update-block-lighting' path propagates only from the one
      // supplied (x,z) column, so a representative coordinate never blocks skylight
      // under the tree's actual trunk/leaf blocks. This matters most for canopy that
      // overhangs into an already-generated neighbor column (that column gets no
      // applySubChunkData relight of its own). queueColumn recomputes skylight
      // top-down and dedupes per column, so repeat calls here collapse to one.
      this.backgroundLightingManager.queueColumn({
        x: subChunk.coordinate.x,
        z: subChunk.coordinate.z,
      })
    }

    for (const subChunk of this.decorationNeighborSubChunks) {
      if (!this.decorationTouchedSubChunks.has(subChunk)) {
        this.queueSubChunkForMeshing(subChunk)
      }
    }

    this.decorationTouchedSubChunks.clear()
    this.decorationNeighborSubChunks.clear()
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
   * Get all chunk meshes for frustum culling.
   * Includes both legacy full-chunk meshes and sub-chunk meshes.
   */
  *getChunkMeshes(): Generator<IChunkMesh> {
    yield* this.chunkMeshes.values()
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
   * Unload a column and remove all its sub-chunk meshes.
   * Saves all sub-chunks before unloading (terrain gen isn't deterministic).
   */
  unloadChunk(coordinate: IChunkCoordinate): void {
    // Save all sub-chunks before unloading (fire and forget)
    // Only save sub-chunks that completed generation (state >= LOADED)
    const column = this.chunkManager.getColumn(coordinate)
    if (column && this.persistenceManager) {
      for (let subY = 0; subY < 16; subY++) {
        const subChunk = column.getSubChunk(subY)
        if (subChunk && subChunk.state >= ChunkState.LOADED) {
          this.persistenceManager.saveSubChunk(
            subChunk.coordinate,
            subChunk.getBlockData(),
            subChunk.getLightData(),
            subChunk.getMetadataData()
          ).catch(err => console.error('Failed to save sub-chunk on unload:', err))
        }
      }
    }

    // Clean up all pending mesh state and remove meshes for this column
    for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
      const subChunkKey = createSubChunkKey(coordinate.x, coordinate.z, subY)

      // Remove from pending subchunks (prevents worker result from creating orphaned mesh)
      const pendingSubChunk = this.pendingSubChunks.get(subChunkKey)
      this.pendingSubChunks.delete(subChunkKey)

      // Remove from pending remesh set
      this.pendingRemeshSet.delete(subChunkKey)

      // Remove from worker queues if present
      if (pendingSubChunk) {
        // Priority queue
        if (this.prioritySubChunkSet.has(pendingSubChunk)) {
          const idx = this.prioritySubChunkQueue.indexOf(pendingSubChunk)
          if (idx !== -1) this.prioritySubChunkQueue.splice(idx, 1)
          this.prioritySubChunkSet.delete(pendingSubChunk)
        }
        // Normal queue
        if (this.subChunkWorkerSet.has(pendingSubChunk)) {
          const idx = this.subChunkWorkerQueue.indexOf(pendingSubChunk)
          if (idx !== -1) this.subChunkWorkerQueue.splice(idx, 1)
          this.subChunkWorkerSet.delete(pendingSubChunk)
        }
      }

      this.removeSubChunkMesh(subChunkKey, true) // true = isUnloading, also clears opacity cache
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

    // Remove from background lighting queue
    this.backgroundLightingManager.unloadColumn(coordinate)

    // Remove all block entities in this chunk
    if (this.entityManager) {
      this.entityManager.removeBlockEntitiesInChunk(coordinate.x, coordinate.z)
    }

    // Then unload the column data
    this.chunkManager.unloadColumn(coordinate)
  }

  /**
   * Register a callback for when a sub-chunk mesh is added to the scene.
   * Returns an unsubscribe function.
   */
  onSubChunkMeshAdded(callback: (coord: ISubChunkCoordinate) => void): () => void {
    this.subChunkMeshAddedCallbacks.push(callback)
    return () => {
      const index = this.subChunkMeshAddedCallbacks.indexOf(callback)
      if (index !== -1) {
        this.subChunkMeshAddedCallbacks.splice(index, 1)
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
   * Get all chunk mesh coordinates for initial sync.
   */
  getChunkMeshCoordinates(): IChunkCoordinate[] {
    const coords: IChunkCoordinate[] = []
    for (const chunkMesh of this.chunkMeshes.values()) {
      coords.push(chunkMesh.chunkCoordinate)
    }
    return coords
  }

  /**
   * Mark neighbor sub-chunks dirty if a block change is on the chunk edge.
   * This queues horizontal neighbor sub-chunks for remeshing.
   */
  private markSubChunkNeighborsDirtyIfEdge(
    chunkCoord: IChunkCoordinate,
    localX: number,
    localY: number,
    localZ: number,
    subY: number,
    wasBlockRemoved: boolean
  ): void {
    if (localX === 0) {
      const neighborChunkCoord: IChunkCoordinate = { x: chunkCoord.x - 1n, z: chunkCoord.z }
      const neighborColumn = this.chunkManager.getColumn(neighborChunkCoord)
      if (neighborColumn) {
        const neighborSubChunk = neighborColumn.getSubChunk(subY)
        if (neighborSubChunk) {
          this.queueSubChunkForMeshing(neighborSubChunk)
        }
        // Only queue lighting update for neighbor when block is REMOVED
        // For block placement, cross-chunk lighting is handled by propagateToNeighborsImmediately
        // Queueing the neighbor here would cause a race condition where the worker
        // overwrites propagated light with stale data
        if (wasBlockRemoved) {
          this.backgroundLightingManager.queueBlockChange(
            neighborColumn,
            CHUNK_SIZE_X - 1, // opposite edge
            localY,
            localZ,
            wasBlockRemoved
          )
        }
      }
    } else if (localX === CHUNK_SIZE_X - 1) {
      const neighborChunkCoord: IChunkCoordinate = { x: chunkCoord.x + 1n, z: chunkCoord.z }
      const neighborColumn = this.chunkManager.getColumn(neighborChunkCoord)
      if (neighborColumn) {
        const neighborSubChunk = neighborColumn.getSubChunk(subY)
        if (neighborSubChunk) {
          this.queueSubChunkForMeshing(neighborSubChunk)
        }
        // Only queue lighting update for neighbor when block is REMOVED
        if (wasBlockRemoved) {
          this.backgroundLightingManager.queueBlockChange(
            neighborColumn,
            0, // opposite edge
            localY,
            localZ,
            wasBlockRemoved
          )
        }
      }
    }

    if (localZ === 0) {
      const neighborChunkCoord: IChunkCoordinate = { x: chunkCoord.x, z: chunkCoord.z - 1n }
      const neighborColumn = this.chunkManager.getColumn(neighborChunkCoord)
      if (neighborColumn) {
        const neighborSubChunk = neighborColumn.getSubChunk(subY)
        if (neighborSubChunk) {
          this.queueSubChunkForMeshing(neighborSubChunk)
        }
        // Only queue lighting update for neighbor when block is REMOVED
        if (wasBlockRemoved) {
          this.backgroundLightingManager.queueBlockChange(
            neighborColumn,
            localX,
            localY,
            CHUNK_SIZE_Z - 1, // opposite edge
            wasBlockRemoved
          )
        }
      }
    } else if (localZ === CHUNK_SIZE_Z - 1) {
      const neighborChunkCoord: IChunkCoordinate = { x: chunkCoord.x, z: chunkCoord.z + 1n }
      const neighborColumn = this.chunkManager.getColumn(neighborChunkCoord)
      if (neighborColumn) {
        const neighborSubChunk = neighborColumn.getSubChunk(subY)
        if (neighborSubChunk) {
          this.queueSubChunkForMeshing(neighborSubChunk)
        }
        // Only queue lighting update for neighbor when block is REMOVED
        if (wasBlockRemoved) {
          this.backgroundLightingManager.queueBlockChange(
            neighborColumn,
            localX,
            localY,
            0, // opposite edge
            wasBlockRemoved
          )
        }
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
    this.renderer = renderer
  }

  /**
   * Clear all meshes from the scene.
   */
  private clearAllMeshes(): void {
    if (!this.scene) return

    for (const chunkMesh of this.chunkMeshes.values()) {
      chunkMesh.removeFromScene(this.scene)
      chunkMesh.dispose(this.renderer ?? undefined)
    }
    this.chunkMeshes.clear()

    for (const subChunkMesh of this.subChunkMeshes.values()) {
      subChunkMesh.removeFromScene(this.scene)
      subChunkMesh.dispose(this.renderer ?? undefined)
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

    // Dispose background lighting manager
    this.backgroundLightingManager.dispose()
  }
}
