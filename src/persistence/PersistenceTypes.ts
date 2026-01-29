/**
 * Persistence system type definitions.
 * Defines binary format, serialization structures, and worker messages.
 */

// Binary format constants
export const MAGIC_NUMBER = 0x534c4f50 // "SLOP" in ASCII
export const PERSISTENCE_VERSION = 2
export const HEADER_SIZE = 22 // 4 + 2 + 4 + 4 + 4 + 4 bytes (added metadata length)

// Flags for sub-chunk binary format
export const FLAG_HAS_LIGHT_DATA = 1 << 0
export const FLAG_HAS_METADATA = 1 << 1

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
  lightData: Uint8Array
  metadata?: Uint8Array
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
      lightData: Uint8Array
      metadata?: Uint8Array
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
    }
  | { type: 'load-inventory' }
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
        lightData: Uint8Array
        metadata?: Uint8Array
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

// Worker response message types
export type PersistenceWorkerResponse =
  | { type: 'init-complete'; persisted: boolean }
  | { type: 'subchunk-saved'; chunkX: string; chunkZ: string; subY: number }
  | {
      type: 'subchunk-loaded'
      chunkX: string
      chunkZ: string
      subY: number
      blocks: Uint16Array
      lightData: Uint8Array
      metadata?: Uint8Array
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
