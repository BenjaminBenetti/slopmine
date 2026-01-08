import * as THREE from 'three'
import type { BlockId, IBlock } from './interfaces/IBlock.ts'
import type { IChunkCoordinate, IWorldCoordinate, ISubChunkCoordinate } from './interfaces/ICoordinates.ts'
import { createChunkKey, parseChunkKey, createSubChunkKey, parseSubChunkKey, type ChunkKey, type SubChunkKey } from './interfaces/ICoordinates.ts'
import { worldToChunk, worldToLocal, localToWorld } from './coordinates/CoordinateUtils.ts'
import { ChunkManager } from './chunks/ChunkManager.ts'
import { BlockRegistry, getBlock } from './blocks/BlockRegistry.ts'
import { Chunk } from './chunks/Chunk.ts'
import { BlockIds } from './blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, ChunkState, SUB_CHUNK_VOLUME } from './interfaces/IChunk.ts'
import { ChunkMesh, type IChunkMesh } from '../renderer/ChunkMesh.ts'
import { GreedyChunkMesh } from '../renderer/GreedyChunkMesh.ts'
import type { SubChunkOpacityCache } from '../renderer/SubChunkOpacityCache.ts'
import GreedyMeshWorker from '../workers/GreedyMeshWorker.ts?worker'
import type { GreedyMeshRequest, GreedyMeshResponse, GreedyMeshError } from '../workers/GreedyMeshWorker.ts'
import { buildFaceTextureMap } from './blocks/FaceTextureRegistry.ts'
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
import { BackgroundLightingManager } from './lighting/BackgroundLightingManager.ts'
import type { PersistenceManager, IModifiedChunkProvider } from '../persistence/PersistenceManager.ts'

/**
 * Main world coordinator.
 * Provides high-level API for world access and modification.
 * Implements IModifiedChunkProvider for persistence integration.
 */
export class WorldManager implements IModifiedChunkProvider {
  private readonly chunkManager: ChunkManager
  private readonly blockRegistry: BlockRegistry
  private scene: THREE.Scene | null = null
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
  private readonly WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 4)
  private readonly MAX_BACKGROUND_MESH_JOBS_PER_FRAME = 2

  // Mesh result throttling to prevent GPU command buffer flooding
  private readonly pendingMeshResults: GreedyMeshResponse[] = []
  private readonly MAX_MESH_RESULTS_PER_FRAME = 2

  // Cache of opaque block IDs for worker visibility checks
  private opaqueBlockIds: number[] = []
  private opaqueBlockIdSet: Set<number> = new Set()

  // Face texture map for greedy meshing (built once, sent to workers)
  private faceTextureMapEntries: Array<[number, number]> = []
  private nonGreedyBlockIds: number[] = []
  private faceTextureMapSent: boolean = false

  // Pre-allocated boundary layer buffers to avoid per-mesh allocation
  // 2 for blocks (posY, negY), 2 for lights (posY, negY)
  private readonly boundaryBlockPosY = new Uint16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)
  private readonly boundaryBlockNegY = new Uint16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)
  private readonly boundaryLightPosY = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)
  private readonly boundaryLightNegY = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)

  // Opacity cache for software occlusion culling
  private opacityCache: SubChunkOpacityCache | null = null

  // Background lighting manager for all lighting updates (generation and block changes)
  private readonly backgroundLightingManager: BackgroundLightingManager

  // Persistence manager for saving/loading world data
  private persistenceManager: PersistenceManager | null = null

  // Web Worker pool for chunk generation (terrain, caves, lighting)
  private readonly generationWorkers: Worker[] = []
  private readonly subChunkCallbackMap: Map<
    string,
    {
      resolve: (data: SubChunkGenerationResponse) => void
      reject: (error: Error) => void
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
  }

  /**
   * Update the cached list of opaque block IDs.
   * Call this after registering new blocks.
   */
  updateOpaqueBlockIds(): void {
    this.opaqueBlockIds = this.blockRegistry
      .getAllBlockIds()
      .filter((id) => getBlock(id).properties.isOpaque)
    this.opaqueBlockIdSet = new Set(this.opaqueBlockIds)
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

    // Reset sent flag so workers get updated map on next request
    this.faceTextureMapSent = false
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
   * Get all loaded sub-chunks for persistence (implements IModifiedChunkProvider).
   * Returns all loaded sub-chunks since terrain generation isn't fully deterministic.
   */
  getModifiedSubChunks(): Array<{
    coordinate: ISubChunkCoordinate
    blocks: Uint16Array
    lightData: Uint8Array
  }> {
    const chunks: Array<{
      coordinate: ISubChunkCoordinate
      blocks: Uint16Array
      lightData: Uint8Array
    }> = []

    for (const subChunk of this.chunkManager.getLoadedSubChunks()) {
      chunks.push({
        coordinate: subChunk.coordinate,
        blocks: subChunk.getBlockData(),
        lightData: subChunk.getLightData(),
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
        // Clear pending subchunks to prevent permanent stuck state
        this.pendingSubChunks.clear()
        this.pendingRemeshSet.clear()
        this.processSubChunkWorkerQueue()
      }
      this.meshWorkers.push(worker)
    }

    // Generation workers (module workers for sub-chunk generation)
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('../workers/ChunkGenerationWorker.ts', import.meta.url),
        { type: 'module' }
      )
      worker.onmessage = (
        event: MessageEvent<SubChunkGenerationResponse | SubChunkGenerationError>
      ) => {
        this.handleSubChunkGenerationResult(event.data)
      }
      this.generationWorkers.push(worker)
    }
  }

  /**
   * Handle sub-chunk generation result from worker.
   */
  private handleSubChunkGenerationResult(
    result: SubChunkGenerationResponse | SubChunkGenerationError
  ): void {
    const subChunkKey = createSubChunkKey(BigInt(result.chunkX), BigInt(result.chunkZ), result.subY)
    const callbacks = this.subChunkCallbackMap.get(subChunkKey)

    if (!callbacks) return
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
    minWorldY: number,
    maxWorldY: number,
    biomeData: BiomeBlendData
  ): Promise<{ blocks: Uint16Array; lightData: Uint8Array; orePositions: OrePosition[]; isFullyOpaque: boolean }> {
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
            orePositions: response.orePositions,
            isFullyOpaque: response.isFullyOpaque,
          })
        },
        reject,
      })

      // Round-robin worker selection
      const worker = this.generationWorkers[
        this.generationWorkerIndex++ % this.generationWorkers.length
      ]

      // Transfer buffers to worker
      worker.postMessage(request, [blocks.buffer, lightData.buffer])
    })
  }

  /**
   * Apply worker-generated data to a sub-chunk.
   * Creates the sub-chunk and ChunkColumn if necessary.
   * @param isFullyOpaque - Opacity computed in worker (avoids main thread computation)
   */
  async applySubChunkData(
    coordinate: ISubChunkCoordinate,
    blocks: Uint16Array,
    lightData: Uint8Array,
    isFullyOpaque?: boolean
  ): Promise<void> {
    // Get or create the chunk column
    const chunkCoord: IChunkCoordinate = { x: coordinate.x, z: coordinate.z }
    let column = this.chunkManager.getColumn(chunkCoord)

    if (!column) {
      column = this.chunkManager.loadColumn(chunkCoord)
    }

    // Get or create the sub-chunk
    const subChunk = column.getOrCreateSubChunk(coordinate.subY)

    // Apply the block and light data
    subChunk.applyWorkerData(blocks, lightData)

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

    // Copy block and light data
    const blocksCopy = new Uint16Array(subChunk.getBlockData())
    const lightCopy = new Uint8Array(subChunk.getLightData())

    const request: GreedyMeshRequest = {
      type: 'greedy-mesh',
      chunkX: Number(coord.x),
      chunkZ: Number(coord.z),
      subY: coord.subY,
      minWorldY: coord.subY * SUB_CHUNK_HEIGHT,
      blocks: blocksCopy,
      lightData: lightCopy,
      neighbors,
      neighborLights,
      opaqueBlockIds: this.opaqueBlockIds,
      // Send face texture map on first request to each worker
      faceTextureMapEntries: this.faceTextureMapSent ? undefined : this.faceTextureMapEntries,
      nonGreedyBlockIds: this.faceTextureMapSent ? undefined : this.nonGreedyBlockIds,
    }

    // Mark as sent after first request (workers cache it)
    this.faceTextureMapSent = true

    this.pendingSubChunks.set(subChunkKey, subChunk)

    // Transfer the copied data to worker
    worker.postMessage(request, [blocksCopy.buffer, lightCopy.buffer])
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

    // Horizontal neighbors (full sub-chunks)
    const posXCoord = createSubChunkKey(x + 1n, z, subY)
    const negXCoord = createSubChunkKey(x - 1n, z, subY)
    const posZCoord = createSubChunkKey(x, z + 1n, subY)
    const negZCoord = createSubChunkKey(x, z - 1n, subY)

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
        negY = this.extractBoundaryLayer(belowSub, SUB_CHUNK_HEIGHT - 1) // y=63 layer of sub-chunk below
      }
    }

    return {
      posX: posXSub?.getBlockData() ?? null,
      negX: negXSub?.getBlockData() ?? null,
      posZ: posZSub?.getBlockData() ?? null,
      negZ: negZSub?.getBlockData() ?? null,
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

    return {
      posX: posXSub?.getLightData() ?? null,
      negX: negXSub?.getLightData() ?? null,
      posZ: posZSub?.getLightData() ?? null,
      negZ: negZSub?.getLightData() ?? null,
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
   * Register a callback for when a column starts being lit.
   */
  onColumnLightingStarted(callback: (coord: IChunkCoordinate) => void): () => void {
    return this.backgroundLightingManager.onLightingStarted(callback)
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
   * Set block at world coordinates.
   * Returns true if the block was changed.
   */
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId): boolean {
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
    }

    return changed
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
    const column = this.chunkManager.getColumn(coordinate)
    if (column && this.persistenceManager) {
      for (let subY = 0; subY < 16; subY++) {
        const subChunk = column.getSubChunk(subY)
        if (subChunk) {
          // Save this sub-chunk before it's unloaded
          this.persistenceManager.saveSubChunk(
            subChunk.coordinate,
            subChunk.getBlockData(),
            subChunk.getLightData()
          ).catch(err => console.error('Failed to save sub-chunk on unload:', err))
        }
      }
    }

    // Clean up all pending mesh state and remove meshes for this column
    for (let subY = 0; subY < 16; subY++) {
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
   * Clear all meshes from the scene.
   */
  private clearAllMeshes(): void {
    if (!this.scene) return

    for (const chunkMesh of this.chunkMeshes.values()) {
      chunkMesh.removeFromScene(this.scene)
      chunkMesh.dispose()
    }
    this.chunkMeshes.clear()

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

    // Dispose background lighting manager
    this.backgroundLightingManager.dispose()
  }
}
