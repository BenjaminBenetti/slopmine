import * as THREE from 'three'
import type { BlockId, IBlock } from './interfaces/IBlock.ts'
import type { IChunkCoordinate, IWorldCoordinate } from './interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from './interfaces/ICoordinates.ts'
import { worldToChunk, worldToLocal, localToWorld } from './coordinates/CoordinateUtils.ts'
import { ChunkManager, type ChunkManagerConfig } from './chunks/ChunkManager.ts'
import { BlockRegistry, getBlock } from './blocks/BlockRegistry.ts'
import { Chunk } from './chunks/Chunk.ts'
import { BlockIds } from './blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, ChunkState } from './interfaces/IChunk.ts'
import { ChunkMesh } from '../renderer/ChunkMesh.ts'
import type { HeightmapCache } from '../renderer/HeightmapCache.ts'
import ChunkMeshWorker from '../workers/ChunkMeshWorker.ts?worker'
import type { ChunkMeshRequest, ChunkMeshResponse } from '../workers/ChunkMeshWorker.ts'

/**
 * Main world coordinator.
 * Provides high-level API for world access and modification.
 */
export class WorldManager {
  private readonly chunkManager: ChunkManager
  private readonly blockRegistry: BlockRegistry
  private scene: THREE.Scene | null = null
  private readonly chunkMeshes: Map<ChunkKey, ChunkMesh> = new Map()
  private readonly generationCallbacks: Array<(chunk: Chunk) => void> = []

  // Web Worker pool for mesh building
  private readonly meshWorkers: Worker[] = []
  private readonly workerQueue: Chunk[] = []
  private readonly pendingChunks: Map<string, Chunk> = new Map()
  private readonly WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 4)

  // Cache of opaque block IDs for worker visibility checks
  private opaqueBlockIds: number[] = []

  // Heightmap cache for horizon culling
  private heightmapCache: HeightmapCache | null = null

  constructor(config?: Partial<ChunkManagerConfig>) {
    this.chunkManager = new ChunkManager(config)
    this.blockRegistry = BlockRegistry.getInstance()
    this.initWorkers()
    this.updateOpaqueBlockIds()
  }

  /**
   * Update the cached list of opaque block IDs.
   * Call this after registering new blocks.
   */
  updateOpaqueBlockIds(): void {
    this.opaqueBlockIds = this.blockRegistry
      .getAllBlockIds()
      .filter((id) => getBlock(id).properties.isOpaque)
  }

  /**
   * Set the heightmap cache for horizon culling updates.
   */
  setHeightmapCache(cache: HeightmapCache): void {
    this.heightmapCache = cache
  }

  /**
   * Initialize the Web Worker pool for mesh building.
   */
  private initWorkers(): void {
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const worker = new ChunkMeshWorker()
      worker.onmessage = (event: MessageEvent<ChunkMeshResponse>) => {
        this.handleWorkerResult(event.data)
      }
      this.meshWorkers.push(worker)
    }
  }

  /**
   * Handle mesh result from worker.
   */
  private handleWorkerResult(result: ChunkMeshResponse): void {
    if (!this.scene) return

    const chunkKey = createChunkKey(BigInt(result.chunkX), BigInt(result.chunkZ))
    const chunk = this.pendingChunks.get(chunkKey)
    this.pendingChunks.delete(chunkKey)

    if (!chunk) return

    // Remove existing meshes
    this.removeChunkMeshes(chunkKey)

    // Build mesh from worker result (array of [blockId, positions] pairs)
    const chunkMesh = new ChunkMesh(chunk.coordinate)

    for (const [blockId, positions] of result.visibleBlocks) {
      for (let i = 0; i < positions.length; i += 3) {
        chunkMesh.addBlock(blockId, positions[i], positions[i + 1], positions[i + 2])
      }
    }

    chunkMesh.build()
    chunkMesh.addToScene(this.scene)
    this.chunkMeshes.set(chunkKey, chunkMesh)

    // Update heightmap cache for horizon culling
    if (this.heightmapCache) {
      this.heightmapCache.updateChunk(chunk)
    }

    // Process next chunk in queue
    this.processWorkerQueue()
  }

  /**
   * Get an idle worker (simple round-robin for now).
   */
  private getIdleWorker(): Worker | null {
    // Find worker with least pending work
    if (this.pendingChunks.size < this.WORKER_COUNT) {
      return this.meshWorkers[this.pendingChunks.size % this.WORKER_COUNT]
    }
    return null
  }

  /**
   * Process the worker queue - send chunks to available workers.
   */
  private processWorkerQueue(): void {
    while (this.workerQueue.length > 0) {
      const worker = this.getIdleWorker()
      if (!worker) break

      const chunk = this.workerQueue.shift()!
      this.sendChunkToWorker(chunk, worker)
    }
  }

  /**
   * Send a chunk to a worker for mesh calculation.
   */
  private sendChunkToWorker(chunk: Chunk, worker: Worker): void {
    const coord = chunk.coordinate
    const chunkKey = createChunkKey(coord.x, coord.z)

    // Get neighbor chunk data for edge visibility checks
    const neighbors = {
      posX: this.getNeighborBlockData(coord, 1, 0),
      negX: this.getNeighborBlockData(coord, -1, 0),
      posZ: this.getNeighborBlockData(coord, 0, 1),
      negZ: this.getNeighborBlockData(coord, 0, -1),
    }

    // Copy block data since we can't transfer it (chunk still needs it)
    const blocksCopy = new Uint16Array(chunk.getBlockData())

    const request: ChunkMeshRequest = {
      type: 'mesh',
      chunkX: Number(coord.x),
      chunkZ: Number(coord.z),
      blocks: blocksCopy,
      neighbors,
      opaqueBlockIds: this.opaqueBlockIds,
    }

    this.pendingChunks.set(chunkKey, chunk)

    // Transfer the copied block data to worker
    worker.postMessage(request, [blocksCopy.buffer])
  }

  /**
   * Get block data from a neighbor chunk, or null if not loaded.
   */
  private getNeighborBlockData(coord: IChunkCoordinate, dx: number, dz: number): Uint16Array | null {
    const neighborCoord: IChunkCoordinate = {
      x: coord.x + BigInt(dx),
      z: coord.z + BigInt(dz),
    }
    const neighbor = this.chunkManager.getChunk(neighborCoord)
    return neighbor ? neighbor.getBlockData() : null
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
    const chunk = this.chunkManager.getChunk(chunkCoord)

    if (!chunk) {
      return BlockIds.AIR
    }

    const local = worldToLocal(world)
    return chunk.getBlockId(local.x, local.y, local.z)
  }

  /**
   * Set block at world coordinates.
   * Returns true if the block was changed.
   */
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId): boolean {
    const world: IWorldCoordinate = { x, y, z }
    const chunkCoord = worldToChunk(world)

    const chunk = this.chunkManager.loadChunk(chunkCoord)
    const local = worldToLocal(world)

    const changed = chunk.setBlockId(local.x, local.y, local.z, blockId)

    if (changed) {
      this.markNeighborsDirtyIfEdge(chunkCoord, local.x, local.z)
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
   * Get all chunk meshes for frustum culling.
   */
  getChunkMeshes(): IterableIterator<ChunkMesh> {
    return this.chunkMeshes.values()
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
    const chunk = this.chunkManager.getChunk(chunkCoord)

    if (!chunk) {
      return null
    }

    const local = worldToLocal(world)
    const localY = chunk.getHighestBlockAt(local.x, local.z)

    if (localY === null) {
      return null
    }

    return BigInt(localY)
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
   * Get all loaded chunks.
   */
  getLoadedChunks(): Chunk[] {
    return this.chunkManager.getLoadedChunks()
  }

  /**
   * Get all dirty chunks.
   */
  getDirtyChunks(): Chunk[] {
    return this.chunkManager.getDirtyChunks()
  }

  /**
   * Get the number of loaded chunks.
   */
  getLoadedChunkCount(): number {
    return this.chunkManager.getLoadedChunkCount()
  }

  /**
   * Unload a chunk and remove its meshes.
   */
  unloadChunk(coordinate: IChunkCoordinate): void {
    // Remove meshes first
    const chunkKey = createChunkKey(coordinate.x, coordinate.z)
    this.removeChunkMeshes(chunkKey)

    // Remove from heightmap cache
    if (this.heightmapCache) {
      this.heightmapCache.removeChunk(chunkKey)
    }

    // Then unload the chunk data
    this.chunkManager.unloadChunk(coordinate)
  }

  /**
   * Generate a chunk asynchronously using a custom generator function.
   * The generator receives the chunk and world manager to populate blocks.
   * Chunk state is set to GENERATING during generation and LOADED when complete.
   */
  async generateChunkAsync(
    coordinate: IChunkCoordinate,
    generator: (chunk: Chunk, world: WorldManager) => Promise<void>
  ): Promise<Chunk> {
    const chunk = this.chunkManager.loadChunk(coordinate)
    chunk.setState(ChunkState.GENERATING)

    try {
      await generator(chunk, this)
      chunk.setState(ChunkState.LOADED)
      chunk.markDirty()

      // Notify listeners
      for (const callback of this.generationCallbacks) {
        callback(chunk)
      }

      return chunk
    } catch (error) {
      chunk.setState(ChunkState.LOADED)
      throw error
    }
  }

  /**
   * Register a callback to be called when a chunk finishes generating.
   * Returns an unsubscribe function.
   */
  onChunkGenerated(callback: (chunk: Chunk) => void): () => void {
    this.generationCallbacks.push(callback)
    return () => {
      const index = this.generationCallbacks.indexOf(callback)
      if (index !== -1) {
        this.generationCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Mark neighbor chunks dirty if a block change is on the chunk edge.
   */
  private markNeighborsDirtyIfEdge(
    chunkCoord: IChunkCoordinate,
    localX: number,
    localZ: number
  ): void {
    if (localX === 0) {
      const neighbor = this.chunkManager.getChunk({
        x: chunkCoord.x - 1n,
        z: chunkCoord.z,
      })
      neighbor?.markDirty()
    } else if (localX === CHUNK_SIZE_X - 1) {
      const neighbor = this.chunkManager.getChunk({
        x: chunkCoord.x + 1n,
        z: chunkCoord.z,
      })
      neighbor?.markDirty()
    }

    if (localZ === 0) {
      const neighbor = this.chunkManager.getChunk({
        x: chunkCoord.x,
        z: chunkCoord.z - 1n,
      })
      neighbor?.markDirty()
    } else if (localZ === CHUNK_SIZE_Z - 1) {
      const neighbor = this.chunkManager.getChunk({
        x: chunkCoord.x,
        z: chunkCoord.z + 1n,
      })
      neighbor?.markDirty()
    }
  }

  /**
   * Set the scene for rendering. Call this once before any chunk rendering.
   */
  setScene(scene: THREE.Scene): void {
    this.scene = scene
  }

  /**
   * Render all blocks in loaded chunks to the scene.
   * Call this to do a full re-render of all chunks.
   */
  render(scene: THREE.Scene): void {
    this.scene = scene

    // Clear all existing chunk meshes
    this.clearAllMeshes()

    // Render all loaded chunks
    for (const chunk of this.chunkManager.getLoadedChunks()) {
      this.renderChunk(chunk)
    }
  }

  /**
   * Render a single chunk. Use this for incremental updates.
   * Note: Consider using queueChunkForMeshing for better performance.
   */
  renderSingleChunk(chunk: Chunk): void {
    if (!this.scene) return

    const chunkKey = createChunkKey(chunk.coordinate.x, chunk.coordinate.z)

    // Remove existing meshes for this chunk
    this.removeChunkMeshes(chunkKey)

    // Render the chunk
    this.renderChunk(chunk)
  }

  /**
   * Queue a chunk for background meshing via Web Worker.
   * Chunks are processed in parallel by the worker pool.
   */
  queueChunkForMeshing(chunk: Chunk): void {
    const chunkKey = createChunkKey(chunk.coordinate.x, chunk.coordinate.z)

    // Don't queue if already pending or in queue
    if (this.pendingChunks.has(chunkKey)) return
    if (this.workerQueue.includes(chunk)) return

    this.workerQueue.push(chunk)
    this.processWorkerQueue()
  }

  /**
   * Remove all meshes for a specific chunk.
   */
  removeChunkMeshes(chunkKey: ChunkKey): void {
    const chunkMesh = this.chunkMeshes.get(chunkKey)
    if (chunkMesh && this.scene) {
      chunkMesh.removeFromScene(this.scene)
      chunkMesh.dispose()
    }
    this.chunkMeshes.delete(chunkKey)
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
  }

  /**
   * Check if a block has any exposed faces (not fully surrounded by opaque blocks).
   */
  private hasExposedFace(x: bigint, y: bigint, z: bigint): boolean {
    const neighbors = [
      [x + 1n, y, z], [x - 1n, y, z],
      [x, y + 1n, z], [x, y - 1n, z],
      [x, y, z + 1n], [x, y, z - 1n],
    ] as const

    for (const [nx, ny, nz] of neighbors) {
      if (ny < 0n || ny >= BigInt(CHUNK_HEIGHT)) {
        return true
      }

      const neighborId = this.getBlockId(nx, ny, nz)
      const neighbor = getBlock(neighborId)

      if (!neighbor.properties.isOpaque) {
        return true
      }
    }

    return false
  }

  /**
   * Render a single chunk's blocks using InstancedMesh for performance.
   */
  private renderChunk(chunk: Chunk): void {
    if (!this.scene) return

    const chunkCoord = chunk.coordinate
    const chunkKey = createChunkKey(chunkCoord.x, chunkCoord.z)
    const chunkMesh = new ChunkMesh(chunkCoord)

    // Collect all exposed blocks by type
    for (let localY = 0; localY < CHUNK_HEIGHT; localY++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
          const blockId = chunk.getBlockId(localX, localY, localZ)

          if (blockId === BlockIds.AIR) continue

          const worldCoord = localToWorld(chunkCoord, { x: localX, y: localY, z: localZ })

          if (!this.hasExposedFace(worldCoord.x, worldCoord.y, worldCoord.z)) {
            continue
          }

          // Add block to instanced mesh
          chunkMesh.addBlock(
            blockId,
            Number(worldCoord.x),
            Number(worldCoord.y),
            Number(worldCoord.z)
          )
        }
      }
    }

    // Build all InstancedMesh objects and add to scene
    chunkMesh.build()
    chunkMesh.addToScene(this.scene)
    this.chunkMeshes.set(chunkKey, chunkMesh)
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.clearAllMeshes()
    this.chunkManager.dispose()

    // Terminate workers
    for (const worker of this.meshWorkers) {
      worker.terminate()
    }
    this.meshWorkers.length = 0
  }
}
