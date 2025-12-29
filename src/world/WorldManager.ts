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

/**
 * Main world coordinator.
 * Provides high-level API for world access and modification.
 */
export class WorldManager {
  private readonly chunkManager: ChunkManager
  private readonly blockRegistry: BlockRegistry
  private scene: THREE.Scene | null = null
  private readonly chunkMeshes: Map<ChunkKey, THREE.Mesh[]> = new Map()
  private readonly generationCallbacks: Array<(chunk: Chunk) => void> = []

  constructor(config?: Partial<ChunkManagerConfig>) {
    this.chunkManager = new ChunkManager(config)
    this.blockRegistry = BlockRegistry.getInstance()
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
   * Unload a chunk and remove its meshes.
   */
  unloadChunk(coordinate: IChunkCoordinate): void {
    // Remove meshes first
    const chunkKey = createChunkKey(coordinate.x, coordinate.z)
    this.removeChunkMeshes(chunkKey)

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
   * Remove all meshes for a specific chunk.
   */
  removeChunkMeshes(chunkKey: ChunkKey): void {
    const meshes = this.chunkMeshes.get(chunkKey)
    if (meshes && this.scene) {
      for (const mesh of meshes) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose())
        } else {
          mesh.material.dispose()
        }
      }
    }
    this.chunkMeshes.delete(chunkKey)
  }

  /**
   * Clear all meshes from the scene.
   */
  private clearAllMeshes(): void {
    if (!this.scene) return

    for (const [chunkKey, meshes] of this.chunkMeshes) {
      for (const mesh of meshes) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose())
        } else {
          mesh.material.dispose()
        }
      }
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
   * Render a single chunk's blocks (internal).
   */
  private renderChunk(chunk: Chunk): void {
    if (!this.scene) return

    const chunkCoord = chunk.coordinate
    const chunkKey = createChunkKey(chunkCoord.x, chunkCoord.z)
    const meshes: THREE.Mesh[] = []

    for (let localY = 0; localY < CHUNK_HEIGHT; localY++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
          const blockId = chunk.getBlockId(localX, localY, localZ)

          if (blockId === BlockIds.AIR) continue

          const worldCoord = localToWorld(chunkCoord, { x: localX, y: localY, z: localZ })

          if (!this.hasExposedFace(worldCoord.x, worldCoord.y, worldCoord.z)) {
            continue
          }

          const block = getBlock(blockId)
          const mesh = block.createMesh()

          if (mesh) {
            mesh.position.set(
              Number(worldCoord.x),
              Number(worldCoord.y),
              Number(worldCoord.z)
            )

            meshes.push(mesh)
            this.scene.add(mesh)
          }
        }
      }
    }

    this.chunkMeshes.set(chunkKey, meshes)
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.clearAllMeshes()
    this.chunkManager.dispose()
  }
}
