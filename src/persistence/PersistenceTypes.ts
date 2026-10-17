/**
 * Persistence system type definitions.
 * Defines binary format, serialization structures, and worker messages.
 */

// Binary format constants
export const MAGIC_NUMBER = 0x534c4f50 // "SLOP" in ASCII
// Sub-chunk records are written as version 2 - the same layout older builds
// read (they accept only versions 1 and 2 and treat anything else as "never
// saved", regenerating the sub-chunk and overwriting the record). What changed
// since is carried in flags older builds ignore: light is no longer stored
// (FLAG_HAS_LIGHT_DATA clear; the light engine relights every loaded
// sub-chunk and ignores light in older saves), and FLAG_HAS_SKY_PROOF marks
// records whose FLAG_SKY_OPEN_ABOVE holds the generation sky proof. Records
// written as version 3 by an earlier build of this engine carry the proof
// without FLAG_HAS_SKY_PROOF and are still read.
export const PERSISTENCE_VERSION = 2
/** Highest record version this build reads. */
export const PERSISTENCE_MAX_READ_VERSION = 3
export const HEADER_SIZE = 22 // 4 + 2 + 4 + 4 + 4 + 4 bytes (added metadata length)

// Flags for sub-chunk binary format
export const FLAG_HAS_LIGHT_DATA = 1 << 0
export const FLAG_HAS_METADATA = 1 << 1
/** With FLAG_HAS_SKY_PROOF (or version 3): the sub-chunk has no generated terrain above it (SubChunk.skyOpenAbove). */
export const FLAG_SKY_OPEN_ABOVE = 1 << 2
/** FLAG_SKY_OPEN_ABOVE is meaningful (records older than the sky proof lack it). */
export const FLAG_HAS_SKY_PROOF = 1 << 3

/**
 * Serialized inventory slot (item ID + count).
 */
export interface SerializedSlot {
  itemId: string
  count: number
}

/**
 * Serialized inventory state for persistence.
 */
export interface SerializedInventory {
  version: number
  toolbar: {
    selectedIndex: number
    slots: (SerializedSlot | null)[]
  }
  inventory: {
    width: number
    height: number
    slots: (SerializedSlot | null)[]
  }
}

/**
 * World metadata stored in world.json.
 */
export interface WorldMetadata {
  version: number
  seed: number
  createdAt: string
  lastSavedAt: string
  playerPosition?: { x: number; y: number; z: number }
  playerHealth?: number
  /** The original spawn point when the world was created (never changes) */
  originalSpawnPoint?: { x: number; y: number; z: number }
  /** The player's bed spawn point (set when sleeping in a bed) */
  bedSpawnPoint?: { x: number; y: number; z: number }
}

/**
 * Sub-chunk data returned from persistence.
 */
export interface PersistedSubChunkData {
  blocks: Uint16Array
  metadata?: Uint8Array
  /** Generation sky proof; undefined for saves older than the sky proof. */
  skyOpenAbove?: boolean
  /**
   * True when read from the store; false when served from a save the worker
   * hasn't confirmed yet (it may still fail, so the data isn't known stored).
   */
  confirmed?: boolean
}

/**
 * Serialized block state for persistence.
 * Block states are stored separately from chunk data because:
 * - They have complex nested data (inventory slots)
 * - They need to be loaded/saved independently for efficiency
 * - They may need to be deleted when blocks are broken
 */
export interface SerializedBlockState {
  /** Block name that owns this state (e.g., 'chest', 'forge') - used for deserialization */
  blockName: string
  /** Type identifier for validation/debugging (e.g., 'forge', 'apothecary_workbench') */
  stateType: string
  /** World coordinates as strings (bigint serialization) */
  position: { x: string; y: string; z: string }
  /** State-specific data (defined by each block state class) */
  data: unknown
  /**
   * Save requests only: the state is now empty - delete its stored record
   * (never stored itself). See getBlockStatesToPersist.
   */
  removed?: true
}

/**
 * Serialized forge block state.
 */
export interface SerializedForgeState {
  oreSlots: (SerializedSlot | null)[]
  fuelSlot: SerializedSlot | null
  outputSlots: (SerializedSlot | null)[]
  smeltProgress: number
  smeltTime: number
  fuelRemaining: number
  fuelTotal: number
  activeOreSlot: number
}

/**
 * Serialized apothecary workbench state.
 */
export interface SerializedApothecaryState {
  ingredientSlots: (SerializedSlot | null)[]
  fuelSlot: SerializedSlot | null
  outputSlot: SerializedSlot | null
  brewProgress: number
  brewTime: number
  fuelRemaining: number
  fuelTotal: number
}

// Worker request message types
export type PersistenceWorkerRequest =
  | { type: 'init' }
  | {
      type: 'save-subchunk'
      chunkX: string
      chunkZ: string
      subY: number
      blocks: Uint16Array
      metadata?: Uint8Array
      skyOpenAbove: boolean
      /** Block states inside the sub-chunk, written in the same transaction (unload saves) */
      blockStates?: SerializedBlockState[]
    }
  | {
      type: 'load-subchunk'
      chunkX: string
      chunkZ: string
      subY: number
    }
  | {
      type: 'check-subchunk-exists'
      chunkX: string
      chunkZ: string
      subY: number
    }
  | {
      type: 'save-inventory'
      inventory: SerializedInventory
      /**
       * Keyed player data written in the SAME transaction as the inventory
       * (items move between the inventory and worn armor: saving one without
       * the other loses or duplicates them).
       */
      playerData?: Array<{ key: string; data: unknown }>
    }
  | { type: 'load-inventory' }
  | {
      /** Keyed player data (journal progress, equipment, ...) in the player store. */
      type: 'save-player-data'
      key: string
      data: unknown
    }
  | { type: 'load-player-data'; key: string }
  | {
      type: 'save-metadata'
      metadata: WorldMetadata
    }
  | { type: 'load-metadata' }
  | {
      type: 'batch-save-subchunks'
      subchunks: Array<{
        chunkX: string
        chunkZ: string
        subY: number
        blocks: Uint16Array
        metadata?: Uint8Array
        skyOpenAbove: boolean
      }>
    }
  | { type: 'clear-all' }
  // Block state persistence messages
  | {
      type: 'save-block-states'
      states: SerializedBlockState[]
    }
  | {
      type: 'load-block-states'
      chunkX: string
      chunkZ: string
    }
  | {
      type: 'delete-block-state'
      position: { x: string; y: string; z: string }
    }

/**
 * Every request is posted with a unique requestId that the worker echoes in
 * its response (errors included): the main thread pairs them by id, never by
 * sub-chunk coordinate - a save and a load of the same sub-chunk can be in
 * flight together.
 */
export type PersistenceWorkerEnvelope = PersistenceWorkerRequest & { requestId: number }

// Worker response message types (posted with the request's requestId)
export type PersistenceWorkerResponse =
  | { type: 'init-complete'; persisted: boolean }
  | { type: 'subchunk-saved'; chunkX: string; chunkZ: string; subY: number }
  | {
      type: 'subchunk-loaded'
      chunkX: string
      chunkZ: string
      subY: number
      blocks: Uint16Array
      metadata?: Uint8Array
      skyOpenAbove?: boolean
    }
  | { type: 'subchunk-not-found'; chunkX: string; chunkZ: string; subY: number }
  | {
      type: 'subchunk-exists'
      chunkX: string
      chunkZ: string
      subY: number
      exists: boolean
    }
  | { type: 'inventory-saved' }
  | { type: 'inventory-loaded'; inventory: SerializedInventory | null }
  | { type: 'player-data-saved'; key: string }
  | { type: 'player-data-loaded'; key: string; data: unknown }
  | { type: 'metadata-saved' }
  | { type: 'metadata-loaded'; metadata: WorldMetadata | null }
  | { type: 'batch-save-complete'; count: number }
  | { type: 'clear-all-complete' }
  | { type: 'error'; message: string; operation: string }
  // Block state persistence responses
  | { type: 'block-states-saved'; count: number }
  | {
      type: 'block-states-loaded'
      chunkX: string
      chunkZ: string
      states: SerializedBlockState[]
    }
  | { type: 'block-state-deleted' }
