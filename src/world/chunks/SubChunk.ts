import type { BlockId } from '../interfaces/IBlock.ts'
import type { ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_VOLUME, ChunkState } from '../interfaces/IChunk.ts'
import { localToSubChunkIndex, isValidSubChunkLocal } from '../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

/**
 * SubChunk implementation using Uint16Array for block storage.
 * Each sub-chunk is 32x32x32 blocks (1/16th of a full 512-block column).
 * Memory layout: Y-major for cache-friendly horizontal access.
 */
export class SubChunk {
  readonly coordinate: ISubChunkCoordinate

  /** Numeric chunk coordinates (hot-path lookups without BigInt). */
  readonly cx: number
  readonly cz: number

  private _state: ChunkState = ChunkState.UNLOADED
  private _dirty = false
  private _isFullyOpaque = false
  private _modifiedByPlayer = false

  /**
   * Maximum skylight value for this sub-chunk's biome (0-15).
   * Set during generation based on the biome's layer.
   * Default is 15 (full brightness for surface biomes).
   */
  skylightValue: number = 15

  /**
   * Sky proof: nothing generated in this chunk column lies above this
   * sub-chunk (no terrain above it, nothing crossing its top face - see
   * provesSkyAbove). Unloaded sub-chunks above it are then treated as clear
   * sky by the light engine. Persisted with the sub-chunk.
   */
  skyOpenAbove = false

  /**
   * Set by the LightEngine once this sub-chunk's light is integrated with the
   * world. Only light-ready sub-chunks hold light and take part in
   * propagation; anything else (not generated yet, or a placeholder created by
   * decoration writes) is unknown and treated as dark/opaque.
   */
  lightReady = false

  /** Pending LightEngine queue entries referencing this sub-chunk. */
  lightQueueRefs = 0

  // ---- Mesh invalidation (see WorldManager mesh-job lifecycle) ----
  /** Bumped whenever a cell in this sub-chunk's padded (34^3) mesh volume changes. */
  meshVersion = 0
  /** meshVersion captured when the in-flight mesh job was sent. */
  meshJobVersion = -1
  /** A remesh was requested while a job was in flight. */
  remeshPending = false
  /** Held by the LightEngine: padded volume changed, waiting for light to settle. */
  meshDirty = false
  /** The pending remesh stems from a player edit (mesh with high priority). */
  meshDirtyHigh = false
  /**
   * Bumped whenever data arrives for this sub-chunk or for any sub-chunk in
   * its 26-neighbourhood (a load, or re-applied data). A mesh built at an
   * older data version shows the world as it was before that data existed -
   * e.g. faces toward a neighbour that was missing are culled - so it is not
   * current, however recent its light (see WorldManager.onSubChunkMeshAdded).
   */
  meshDataVersion = 0
  /** meshDataVersion captured when the in-flight mesh job was sent. */
  meshJobDataVersion = -1
  /** Consecutive failed mesh jobs for unchanged input (see WorldManager.handleMeshJobError). */
  meshJobErrors = 0

  // ---- Persistence (see WorldManager.saveSubChunkIfChanged) ----
  /**
   * Bumped whenever block ids or metadata change: setBlockId, setMetadata,
   * setBlockData, fill*, and markDataChanged() for direct array writes.
   */
  dataVersion = 0
  /**
   * dataVersion whose exact content is already in the store (loaded from a
   * confirmed record, or saved); -1 = none. Together with
   * persistedSkyOpenAbove it decides whether an unload or autosave has to
   * write the sub-chunk.
   */
  persistedDataVersion = -1
  /** skyOpenAbove as stored with persistedDataVersion (null = the record has no sky proof). */
  persistedSkyOpenAbove: boolean | null = null

  /**
   * Block data stored as flat Uint16Array.
   * Size: 32 * 32 * 32 = 32,768 blocks
   * Memory: 32,768 * 2 bytes = 64 KB per sub-chunk
   */
  private readonly blocks: Uint16Array

  /**
   * Light data stored as flat Uint8Array.
   * Each byte: high nibble = skylight (0-15), low nibble = blocklight (0-15)
   * Size: 32 * 32 * 32 = 32,768 bytes = 32 KB per sub-chunk
   */
  private readonly lightData: Uint8Array

  /**
   * Block metadata stored as flat Uint8Array.
   * Each byte stores per-block metadata:
   * - Bits 0-1: Horizontal facing (0=NORTH, 1=EAST, 2=SOUTH, 3=WEST)
   * - Higher bits: 3D rotation, flip, chest-loot and player-placed flags (see BlockFacing.ts)
   * Size: 32 * 32 * 32 = 32,768 bytes = 32 KB per sub-chunk
   */
  private readonly metadata: Uint8Array

  constructor(coordinate: ISubChunkCoordinate) {
    this.coordinate = coordinate
    this.cx = Number(coordinate.x)
    this.cz = Number(coordinate.z)
    this.blocks = new Uint16Array(SUB_CHUNK_VOLUME)
    this.lightData = new Uint8Array(SUB_CHUNK_VOLUME)
    this.metadata = new Uint8Array(SUB_CHUNK_VOLUME)
  }

  get state(): ChunkState {
    return this._state
  }

  setState(state: ChunkState): void {
    this._state = state
  }

  /**
   * Get the world Y offset for this sub-chunk.
   * Sub-chunk 0 starts at Y=0, sub-chunk 1 at Y=32, etc.
   */
  get worldYOffset(): number {
    return this.coordinate.subY * SUB_CHUNK_HEIGHT
  }

  getBlockId(x: number, y: number, z: number): BlockId {
    if (!isValidSubChunkLocal(x, y, z)) {
      return BlockIds.AIR
    }
    return this.blocks[localToSubChunkIndex(x, y, z)]
  }

  setBlockId(x: number, y: number, z: number, blockId: BlockId): boolean {
    if (!isValidSubChunkLocal(x, y, z)) {
      return false
    }

    const index = localToSubChunkIndex(x, y, z)
    const oldId = this.blocks[index]

    if (oldId === blockId) {
      return false
    }

    this.blocks[index] = blockId
    this._dirty = true
    this.dataVersion++
    return true
  }

  isInBounds(x: number, y: number, z: number): boolean {
    return isValidSubChunkLocal(x, y, z)
  }

  markDirty(): void {
    this._dirty = true
  }

  /** Block or metadata arrays were written directly (getBlockData()/getMetadataData()). */
  markDataChanged(): void {
    this._dirty = true
    this.dataVersion++
  }

  /** Whether the store already holds exactly this data. */
  isPersistClean(): boolean {
    return this.persistedDataVersion === this.dataVersion && this.persistedSkyOpenAbove === this.skyOpenAbove
  }

  /** Record that `version` (with skyOpenAbove) is what the store holds. */
  markPersisted(version: number, skyOpenAbove: boolean | null): void {
    this.persistedDataVersion = version
    this.persistedSkyOpenAbove = skyOpenAbove
  }

  isDirty(): boolean {
    return this._dirty
  }

  clearDirty(): void {
    this._dirty = false
  }

  /**
   * Mark this sub-chunk as modified by player action.
   * Used for persistence - only player-modified chunks are saved.
   */
  markModifiedByPlayer(): void {
    this._modifiedByPlayer = true
    this._dirty = true
  }

  /**
   * Check if this sub-chunk was modified by player action.
   */
  isModifiedByPlayer(): boolean {
    return this._modifiedByPlayer
  }

  /**
   * Clear the player modification flag (after saving).
   */
  clearModifiedByPlayer(): void {
    this._modifiedByPlayer = false
  }

  getBlockData(): Uint16Array {
    return this.blocks
  }

  getLightData(): Uint8Array {
    return this.lightData
  }

  getMetadataData(): Uint8Array {
    return this.metadata
  }

  /**
   * Get block metadata at local coordinates.
   * Returns 0 for out-of-bounds (no metadata).
   */
  getMetadata(x: number, y: number, z: number): number {
    if (!isValidSubChunkLocal(x, y, z)) {
      return 0
    }
    return this.metadata[localToSubChunkIndex(x, y, z)]
  }

  /**
   * Set block metadata at local coordinates.
   * Returns true if metadata was set, false if out of bounds.
   */
  setMetadata(x: number, y: number, z: number, value: number): boolean {
    if (!isValidSubChunkLocal(x, y, z)) {
      return false
    }
    const index = localToSubChunkIndex(x, y, z)
    if (this.metadata[index] !== (value & 0xff)) this.dataVersion++
    this.metadata[index] = value
    this._dirty = true
    return true
  }

  /**
   * Get skylight level at local coordinates (0-15).
   * Returns 15 for out-of-bounds (full sky exposure).
   */
  getSkylight(x: number, y: number, z: number): number {
    if (!isValidSubChunkLocal(x, y, z)) {
      return 15
    }
    return (this.lightData[localToSubChunkIndex(x, y, z)] >> 4) & 0xf
  }

  /**
   * Set skylight level at local coordinates (0-15).
   */
  setSkylight(x: number, y: number, z: number, level: number): void {
    if (!isValidSubChunkLocal(x, y, z)) return
    const idx = localToSubChunkIndex(x, y, z)
    this.lightData[idx] = (this.lightData[idx] & 0x0f) | ((level & 0xf) << 4)
  }

  /**
   * Get blocklight level at local coordinates (0-15).
   * Returns 0 for out-of-bounds (no artificial light).
   */
  getBlocklight(x: number, y: number, z: number): number {
    if (!isValidSubChunkLocal(x, y, z)) {
      return 0
    }
    return this.lightData[localToSubChunkIndex(x, y, z)] & 0xf
  }

  /**
   * Set blocklight level at local coordinates (0-15).
   */
  setBlocklight(x: number, y: number, z: number, level: number): void {
    if (!isValidSubChunkLocal(x, y, z)) return
    const idx = localToSubChunkIndex(x, y, z)
    this.lightData[idx] = (this.lightData[idx] & 0xf0) | (level & 0xf)
  }

  /**
   * Get combined light level at local coordinates (max of skylight and blocklight).
   */
  getLightLevel(x: number, y: number, z: number): number {
    if (!isValidSubChunkLocal(x, y, z)) {
      return 15
    }
    const data = this.lightData[localToSubChunkIndex(x, y, z)]
    const sky = (data >> 4) & 0xf
    const block = data & 0xf
    return Math.max(sky, block)
  }

  /**
   * Fill entire sub-chunk with a block type.
   */
  fill(blockId: BlockId): void {
    this.blocks.fill(blockId)
    this._dirty = true
    this.dataVersion++
  }

  /**
   * Fill a horizontal layer with a block type.
   * Y is local to the sub-chunk (0-63).
   */
  fillLayer(y: number, blockId: BlockId): void {
    if (y < 0 || y >= SUB_CHUNK_HEIGHT) return

    const startIndex = y * CHUNK_SIZE_X * CHUNK_SIZE_Z
    const endIndex = startIndex + CHUNK_SIZE_X * CHUNK_SIZE_Z

    for (let i = startIndex; i < endIndex; i++) {
      this.blocks[i] = blockId
    }
    this._dirty = true
    this.dataVersion++
  }

  /**
   * Iterate over all blocks in the sub-chunk.
   * Callback receives local coordinates and block ID.
   */
  forEachBlock(callback: (x: number, y: number, z: number, blockId: BlockId) => void): void {
    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = this.blocks[localToSubChunkIndex(x, y, z)]
          callback(x, y, z, blockId)
        }
      }
    }
  }

  /**
   * Get highest non-air block Y at local x,z position (top-down scan).
   * Returns local Y (0-63), not world Y.
   * Returns null if no solid blocks exist at this column.
   */
  getHighestBlockAt(x: number, z: number): number | null {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z) {
      return null
    }

    for (let y = SUB_CHUNK_HEIGHT - 1; y >= 0; y--) {
      const blockId = this.blocks[localToSubChunkIndex(x, y, z)]
      if (blockId !== BlockIds.AIR) {
        return y
      }
    }

    return null
  }

  /**
   * Check if the sub-chunk is entirely empty (all air).
   * Useful for skipping mesh generation.
   */
  isEmpty(): boolean {
    for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
      if (this.blocks[i] !== BlockIds.AIR) {
        return false
      }
    }
    return true
  }

  /**
   * Whether this sub-chunk is fully opaque (all blocks are opaque).
   * Used for software occlusion culling - fully opaque sub-chunks can act as occluders.
   */
  get isFullyOpaque(): boolean {
    return this._isFullyOpaque
  }

  /**
   * Compute whether this sub-chunk is fully opaque.
   * Call after generation or when blocks are modified.
   * @param opaqueBlockIds Set of block IDs that are opaque
   */
  computeOpacity(opaqueBlockIds: Set<number>): void {
    this._isFullyOpaque = true
    for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
      if (!opaqueBlockIds.has(this.blocks[i])) {
        this._isFullyOpaque = false
        return
      }
    }
  }

  /**
   * Set the opacity value directly (used when worker pre-computed it).
   */
  setOpacity(isFullyOpaque: boolean): void {
    this._isFullyOpaque = isFullyOpaque
  }

  /**
   * Replace all block (and optionally metadata) data, e.g. with a generation
   * result. Light is owned by the LightEngine and not touched here.
   */
  setBlockData(blocks: Uint16Array, metadataData?: Uint8Array): void {
    this.blocks.set(blocks)
    if (metadataData) {
      this.metadata.set(metadataData)
    } else {
      this.metadata.fill(0)
    }
    this._dirty = true
    this.dataVersion++
  }

  dispose(): void {
    // Uint16Array will be garbage collected
  }
}
