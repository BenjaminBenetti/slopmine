/**
 * Persistence system type definitions.
 * Defines binary format, serialization structures, and worker messages.
 */

// Binary format constants
export const MAGIC_NUMBER = 0x534c4f50 // "SLOP" in ASCII
export const PERSISTENCE_VERSION = 1
export const HEADER_SIZE = 18 // 4 + 2 + 4 + 4 + 4 bytes

// Flags for sub-chunk binary format
export const FLAG_HAS_LIGHT_DATA = 1 << 0

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
}

/**
 * Sub-chunk data returned from persistence.
 */
export interface PersistedSubChunkData {
  blocks: Uint16Array
  lightData: Uint8Array
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
      }>
    }
  | { type: 'clear-all' }

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
