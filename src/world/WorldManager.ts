import * as THREE from 'three'
import type { BlockId, IBlock } from './interfaces/IBlock.ts'
import type { IChunkCoordinate, IWorldCoordinate } from './interfaces/ICoordinates.ts'
import { worldToChunk, worldToLocal, localToWorld } from './coordinates/CoordinateUtils.ts'
import { ChunkManager, type ChunkManagerConfig } from './chunks/ChunkManager.ts'
import { BlockRegistry, getBlock } from './blocks/BlockRegistry.ts'
import { Chunk } from './chunks/Chunk.ts'
import { BlockIds } from './blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, ChunkState } from './interfaces/IChunk.ts'

/**
 * Main world coordinator.
 * Provides high-level API for world access and modification.
 */
export class WorldManager {
  private readonly chunkManager: ChunkManager
  private readonly blockRegistry: BlockRegistry
  private scene: THREE.Scene | null = null
  private readonly blockMeshes: Map<string, THREE.Mesh> = new Map()
  private readonly generationCallbacks: Array<(chunk: Chunk) => void> = []

  constructor(config?: Partial<ChunkManagerConfig>) {
    this.chunkManager = new ChunkManager(config)
    this.blockRegistry = BlockRegistry.getInstance()
  }

  /**
   * Create a unique key for a block position.
   */
  private getBlockKey(x: bigint, y: bigint, z: bigint): string {
    return `${x},${y},${z}`
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
   * Unload a chunk.
   */
  unloadChunk(coordinate: IChunkCoordinate): void {
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
   * Render all blocks in loaded chunks to the scene.
   * Call this after making changes to rebuild the visual representation.
   */
  render(scene: THREE.Scene): void {
    this.scene = scene

    // Clear existing meshes
    for (const mesh of this.blockMeshes.values()) {
      scene.remove(mesh)
    }
    this.blockMeshes.clear()

    // Iterate through all loaded chunks
    for (const chunk of this.chunkManager.getLoadedChunks()) {
      this.renderChunk(chunk)
    }
  }

  /**
   * Render a single chunk's blocks.
   */
  private renderChunk(chunk: Chunk): void {
    if (!this.scene) return

    const chunkCoord = chunk.coordinate

    // Iterate through all blocks in the chunk
    for (let localY = 0; localY < CHUNK_HEIGHT; localY++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
          const blockId = chunk.getBlockId(localX, localY, localZ)

          // Skip air blocks
          if (blockId === BlockIds.AIR) continue

          // Get the block type and create its mesh
          const block = getBlock(blockId)
          const mesh = block.createMesh()

          if (mesh) {
            // Convert local coords to world coords for positioning
            const worldCoord = localToWorld(chunkCoord, { x: localX, y: localY, z: localZ })
            mesh.position.set(
              Number(worldCoord.x),
              Number(worldCoord.y),
              Number(worldCoord.z)
            )

            // Track and add to scene
            const key = this.getBlockKey(worldCoord.x, worldCoord.y, worldCoord.z)
            this.blockMeshes.set(key, mesh)
            this.scene.add(mesh)
          }
        }
      }
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    // Remove all meshes from scene
    if (this.scene) {
      for (const mesh of this.blockMeshes.values()) {
        this.scene.remove(mesh)
      }
    }
    this.blockMeshes.clear()
    this.chunkManager.dispose()
  }
}
