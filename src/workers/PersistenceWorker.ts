/**
 * Web Worker for persistence operations using IndexedDB.
 * Handles all storage for world chunks and player inventory.
 *
 * Uses IndexedDB instead of OPFS to avoid stale state issues.
 */

import type {
  PersistenceWorkerRequest,
  PersistenceWorkerResponse,
  SerializedInventory,
  WorldMetadata,
  SerializedBlockState,
} from '../persistence/PersistenceTypes.ts'
import {
  MAGIC_NUMBER,
  PERSISTENCE_VERSION,
  HEADER_SIZE,
  FLAG_HAS_LIGHT_DATA,
  FLAG_HAS_METADATA,
  FLAG_SKY_OPEN_ABOVE,
  FLAG_HAS_SKY_PROOF,
  PERSISTENCE_MAX_READ_VERSION,
} from '../persistence/PersistenceTypes.ts'

const DB_NAME = 'slopmine'
const DB_VERSION = 2 // Incremented for block states store
const CHUNKS_STORE = 'chunks'
const PLAYER_STORE = 'player'
const META_STORE = 'metadata'
const BLOCK_STATES_STORE = 'blockStates'

let db: IDBDatabase | null = null

/**
 * Open or create the IndexedDB database.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message}`))
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Create chunks store with composite key
      if (!database.objectStoreNames.contains(CHUNKS_STORE)) {
        database.createObjectStore(CHUNKS_STORE)
      }

      // Create player store
      if (!database.objectStoreNames.contains(PLAYER_STORE)) {
        database.createObjectStore(PLAYER_STORE)
      }

      // Create metadata store
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE)
      }

      // Create block states store with chunk coordinate index
      // Key: "x,y,z" coordinate string
      // Value: SerializedBlockState JSON
      if (!database.objectStoreNames.contains(BLOCK_STATES_STORE)) {
        const store = database.createObjectStore(BLOCK_STATES_STORE)
        // Create index for efficient chunk-based lookups
        // The index key is "chunkX:chunkZ" computed from world coordinates
        store.createIndex('chunkIndex', 'chunkKey')
      }
    }
  })
}

/**
 * Create a sub-chunk key from coordinates.
 */
function makeChunkKey(chunkX: string, chunkZ: string, subY: number): string {
  return `${chunkX}:${chunkZ}:${subY}`
}

/**
 * Initialize the database.
 * Note: Persistent storage is requested from main thread for better browser support.
 */
async function initialize(): Promise<boolean> {
  try {
    await openDatabase()
    // Return true to indicate successful init (persistence is handled by main thread)
    return true
  } catch (error) {
    console.error('Failed to initialize IndexedDB:', error)
    throw error
  }
}

/**
 * Write binary sub-chunk data to IndexedDB.
 */
async function saveSubChunk(
  chunkX: string,
  chunkZ: string,
  subY: number,
  blocks: Uint16Array,
  metadata: Uint8Array | undefined,
  skyOpenAbove: boolean,
  blockStates: SerializedBlockState[] = []
): Promise<void> {
  const database = await openDatabase()

  // Light is not stored (version 3+): it is recomputed whenever a sub-chunk loads.
  const blockDataLength = blocks.byteLength
  const lightDataLength = 0
  const metadataLength = metadata?.byteLength ?? 0
  const totalSize = HEADER_SIZE + blockDataLength + metadataLength

  // Create buffer with header + data
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  let flags = FLAG_HAS_SKY_PROOF
  if (metadata) {
    flags |= FLAG_HAS_METADATA
  }
  if (skyOpenAbove) {
    flags |= FLAG_SKY_OPEN_ABOVE
  }

  let offset = 0
  view.setUint32(offset, MAGIC_NUMBER, true)
  offset += 4
  view.setUint16(offset, PERSISTENCE_VERSION, true)
  offset += 2
  view.setUint32(offset, flags, true)
  offset += 4
  view.setUint32(offset, blockDataLength, true)
  offset += 4
  view.setUint32(offset, lightDataLength, true)
  offset += 4
  view.setUint32(offset, metadataLength, true)
  offset += 4

  const blockBytes = new Uint8Array(blocks.buffer, blocks.byteOffset, blocks.byteLength)
  new Uint8Array(buffer, offset, blockDataLength).set(blockBytes)
  offset += blockDataLength

  if (metadata) {
    new Uint8Array(buffer, offset, metadataLength).set(metadata)
  }

  if (blockStates.length > 0) {
    // The sub-chunk's block states (chest contents, ...) in the same
    // transaction: a chest block is never stored without its contents
    return new Promise((resolve, reject) => {
      const tx = database.transaction([CHUNKS_STORE, BLOCK_STATES_STORE], 'readwrite')
      tx.objectStore(CHUNKS_STORE).put(buffer, makeChunkKey(chunkX, chunkZ, subY))
      writeBlockStates(tx.objectStore(BLOCK_STATES_STORE), blockStates, () => {})
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error(`Failed to save chunk: ${tx.error?.message}`))
      tx.onabort = () => reject(new Error(`Failed to save chunk: ${tx.error?.message ?? 'transaction aborted'}`))
    })
  }

  return new Promise((resolve, reject) => {
    const tx = database.transaction(CHUNKS_STORE, 'readwrite')
    const store = tx.objectStore(CHUNKS_STORE)
    const key = makeChunkKey(chunkX, chunkZ, subY)

    const request = store.put(buffer, key)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to save chunk: ${request.error?.message}`))
  })
}

/**
 * Load binary sub-chunk data from IndexedDB.
 * Handles backwards compatibility with version 1 (no metadata) and version 2
 * (stored light, no sky proof). Stored light is skipped: it is always recomputed.
 */
async function loadSubChunk(
  chunkX: string,
  chunkZ: string,
  subY: number
): Promise<{ blocks: Uint16Array; metadata?: Uint8Array; skyOpenAbove?: boolean } | null> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(CHUNKS_STORE, 'readonly')
    const store = tx.objectStore(CHUNKS_STORE)
    const key = makeChunkKey(chunkX, chunkZ, subY)

    const request = store.get(key)

    request.onsuccess = () => {
      const buffer = request.result as ArrayBuffer | undefined

      if (!buffer) {
        resolve(null)
        return
      }

      // Minimum header size for version 1 is 18 bytes
      if (buffer.byteLength < 18) {
        console.warn(`Sub-chunk data too small: ${buffer.byteLength} bytes`)
        resolve(null)
        return
      }

      const view = new DataView(buffer)

      let offset = 0
      const magic = view.getUint32(offset, true)
      offset += 4

      if (magic !== MAGIC_NUMBER) {
        console.warn(`Invalid magic number: ${magic.toString(16)}`)
        resolve(null)
        return
      }

      const version = view.getUint16(offset, true)
      offset += 2

      // Support versions 1-3 (see PERSISTENCE_VERSION)
      if (version < 1 || version > PERSISTENCE_MAX_READ_VERSION) {
        console.warn(`Unsupported version: ${version}`)
        resolve(null)
        return
      }

      const flags = view.getUint32(offset, true)
      offset += 4

      const blockDataLength = view.getUint32(offset, true)
      offset += 4

      const lightDataLength = view.getUint32(offset, true)
      offset += 4

      // Version 2 has metadata length field
      let metadataLength = 0
      if (version >= 2) {
        metadataLength = view.getUint32(offset, true)
        offset += 4
      }

      const blocks = new Uint16Array(buffer.slice(offset, offset + blockDataLength))
      offset += blockDataLength

      // Light from older saves is skipped (the light engine relights on load)
      if (flags & FLAG_HAS_LIGHT_DATA) {
        offset += lightDataLength
      }

      // Load metadata if present (version 2+)
      let metadata: Uint8Array | undefined
      if ((flags & FLAG_HAS_METADATA) && metadataLength > 0) {
        metadata = new Uint8Array(buffer.slice(offset, offset + metadataLength))
      }

      // Sky proof: flagged records (and version 3 records of an earlier build)
      const skyOpenAbove = version >= 3 || (flags & FLAG_HAS_SKY_PROOF) !== 0 ? (flags & FLAG_SKY_OPEN_ABOVE) !== 0 : undefined

      resolve({ blocks, metadata, skyOpenAbove })
    }

    request.onerror = () => reject(new Error(`Failed to load chunk: ${request.error?.message}`))
  })
}

/**
 * Check if a sub-chunk exists.
 */
async function checkSubChunkExists(
  chunkX: string,
  chunkZ: string,
  subY: number
): Promise<boolean> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(CHUNKS_STORE, 'readonly')
    const store = tx.objectStore(CHUNKS_STORE)
    const key = makeChunkKey(chunkX, chunkZ, subY)

    const request = store.getKey(key)

    request.onsuccess = () => resolve(request.result !== undefined)
    request.onerror = () => reject(new Error(`Failed to check chunk: ${request.error?.message}`))
  })
}

/**
 * Save player inventory, plus keyed player data in the same transaction
 * (worn armor and the inventory exchange items: both or neither are written).
 */
async function saveInventory(
  inventory: SerializedInventory,
  playerData: ReadonlyArray<{ key: string; data: unknown }> = []
): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(PLAYER_STORE, 'readwrite')
    const store = tx.objectStore(PLAYER_STORE)

    store.put(inventory, 'inventory')
    for (const entry of playerData) {
      store.put(entry.data, playerDataStoreKey(entry.key))
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new Error(`Failed to save inventory: ${tx.error?.message}`))
    tx.onabort = () => reject(new Error(`Failed to save inventory: ${tx.error?.message ?? 'transaction aborted'}`))
  })
}

/**
 * Load player inventory.
 */
async function loadInventory(): Promise<SerializedInventory | null> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(PLAYER_STORE, 'readonly')
    const store = tx.objectStore(PLAYER_STORE)

    const request = store.get('inventory')

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error(`Failed to load inventory: ${request.error?.message}`))
  })
}

/**
 * Store key of keyed player data. Prefixed so it can never collide with the
 * fixed 'inventory' record in the same store.
 */
function playerDataStoreKey(key: string): string {
  return `data:${key}`
}

/**
 * Save keyed player data (any structured-cloneable value).
 */
async function savePlayerData(key: string, data: unknown): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(PLAYER_STORE, 'readwrite')
    const store = tx.objectStore(PLAYER_STORE)

    const request = store.put(data, playerDataStoreKey(key))

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to save player data '${key}': ${request.error?.message}`))
  })
}

/**
 * Load keyed player data (null when never saved).
 */
async function loadPlayerData(key: string): Promise<unknown> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(PLAYER_STORE, 'readonly')
    const store = tx.objectStore(PLAYER_STORE)

    const request = store.get(playerDataStoreKey(key))

    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(new Error(`Failed to load player data '${key}': ${request.error?.message}`))
  })
}

/**
 * Save world metadata.
 */
async function saveMetadata(metadata: WorldMetadata): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(META_STORE, 'readwrite')
    const store = tx.objectStore(META_STORE)

    const request = store.put(metadata, 'world')

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to save metadata: ${request.error?.message}`))
  })
}

/**
 * Load world metadata.
 */
async function loadMetadata(): Promise<WorldMetadata | null> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(META_STORE, 'readonly')
    const store = tx.objectStore(META_STORE)

    const request = store.get('world')

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error(`Failed to load metadata: ${request.error?.message}`))
  })
}

/**
 * Clear all saved data (for new game).
 */
async function clearAllData(): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(
      [CHUNKS_STORE, PLAYER_STORE, META_STORE, BLOCK_STATES_STORE],
      'readwrite'
    )

    tx.objectStore(CHUNKS_STORE).clear()
    tx.objectStore(PLAYER_STORE).clear()
    tx.objectStore(META_STORE).clear()
    tx.objectStore(BLOCK_STATES_STORE).clear()

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new Error(`Failed to clear data: ${tx.error?.message}`))
  })
}

/**
 * Batch save multiple sub-chunks.
 */
async function batchSaveSubChunks(
  subchunks: Array<{
    chunkX: string
    chunkZ: string
    subY: number
    blocks: Uint16Array
    metadata?: Uint8Array
    skyOpenAbove: boolean
  }>
): Promise<number> {
  let savedCount = 0

  for (const sc of subchunks) {
    try {
      await saveSubChunk(sc.chunkX, sc.chunkZ, sc.subY, sc.blocks, sc.metadata, sc.skyOpenAbove)
      savedCount++
    } catch (error) {
      console.error(
        `Failed to save sub-chunk ${sc.chunkX},${sc.chunkZ},${sc.subY}:`,
        error
      )
    }
  }

  return savedCount
}

// ============================================================================
// Block State Persistence
// ============================================================================

/**
 * Compute chunk key from world coordinates.
 * Block states are indexed by the chunk they belong to for efficient loading.
 */
function computeChunkKey(x: string, z: string): string {
  // World coordinates to chunk coordinates (floor division by 32)
  const chunkX = Math.floor(parseInt(x) / 32)
  const chunkZ = Math.floor(parseInt(z) / 32)
  return `${chunkX}:${chunkZ}`
}

/**
 * Create a position key from coordinates.
 */
function makePositionKey(x: string, y: string, z: string): string {
  return `${x},${y},${z}`
}

/**
 * Queue block-state writes on a block-states object store of an open
 * transaction: a put per state, or a delete for a removal record (an emptied
 * state: drop its old record, else the next load refills it). `onWritten`
 * counts each successful request.
 */
function writeBlockStates(store: IDBObjectStore, states: SerializedBlockState[], onWritten: () => void): void {
  for (const state of states) {
    const posKey = makePositionKey(
      state.position.x,
      state.position.y,
      state.position.z
    )
    if (state.removed) {
      const request = store.delete(posKey)
      request.onsuccess = onWritten
      request.onerror = () => {
        console.error(`Failed to remove block state at ${posKey}:`, request.error)
      }
      continue
    }
    // Add chunk key for indexing
    const stateWithChunk = {
      ...state,
      chunkKey: computeChunkKey(state.position.x, state.position.z),
    }

    const request = store.put(stateWithChunk, posKey)
    request.onsuccess = onWritten
    request.onerror = () => {
      console.error(`Failed to save block state at ${posKey}:`, request.error)
    }
  }
}

/**
 * Save block states to IndexedDB.
 * Each state is stored with its coordinate key and chunk index.
 */
async function saveBlockStates(states: SerializedBlockState[]): Promise<number> {
  if (states.length === 0) {
    return 0
  }

  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(BLOCK_STATES_STORE, 'readwrite')
    const store = tx.objectStore(BLOCK_STATES_STORE)
    let savedCount = 0

    writeBlockStates(store, states, () => {
      savedCount++
    })

    tx.oncomplete = () => resolve(savedCount)
    tx.onerror = () => reject(new Error(`Failed to save block states: ${tx.error?.message}`))
  })
}

/**
 * Load block states for a specific chunk.
 */
async function loadBlockStatesForChunk(
  chunkX: string,
  chunkZ: string
): Promise<SerializedBlockState[]> {
  const database = await openDatabase()
  const chunkKey = `${chunkX}:${chunkZ}`

  return new Promise((resolve, reject) => {
    const tx = database.transaction(BLOCK_STATES_STORE, 'readonly')
    const store = tx.objectStore(BLOCK_STATES_STORE)
    const index = store.index('chunkIndex')

    const request = index.getAll(chunkKey)

    request.onsuccess = () => {
      const results = request.result || []
      // Remove the chunkKey property from results before returning
      const states = results.map((state: SerializedBlockState & { chunkKey?: string }) => {
        const { chunkKey: _, ...rest } = state
        return rest as SerializedBlockState
      })
      resolve(states)
    }

    request.onerror = () => {
      reject(new Error(`Failed to load block states for chunk ${chunkKey}: ${request.error?.message}`))
    }
  })
}

/**
 * Delete a block state at a specific position.
 */
async function deleteBlockState(position: { x: string; y: string; z: string }): Promise<void> {
  const database = await openDatabase()
  const posKey = makePositionKey(position.x, position.y, position.z)

  return new Promise((resolve, reject) => {
    const tx = database.transaction(BLOCK_STATES_STORE, 'readwrite')
    const store = tx.objectStore(BLOCK_STATES_STORE)

    const request = store.delete(posKey)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to delete block state: ${request.error?.message}`))
  })
}

// Messages are handled strictly one after another. The handlers are async
// (a batch save awaits one put per sub-chunk), and interleaving them let a
// newer save of a sub-chunk land before an older batch reached it - the batch
// then wrote the older data over it - and let loads read around saves that
// were issued before them.
let messageChain: Promise<void> = Promise.resolve()
self.onmessage = (event: MessageEvent<PersistenceWorkerRequest & { requestId?: number }>) => {
  // (A handler failure must not break the chain for every later message.)
  messageChain = messageChain
    .then(() => handleMessage(event))
    .catch((error) => console.error('[PersistenceWorker] Unhandled message failure:', error))
}

async function handleMessage(event: MessageEvent<PersistenceWorkerRequest & { requestId?: number }>): Promise<void> {
  const request = event.data
  // Echoed in every response so the main thread can pair them (see PersistenceWorkerEnvelope)
  const requestId = request.requestId

  try {
    let response: PersistenceWorkerResponse

    switch (request.type) {
      case 'init': {
        const persisted = await initialize()
        response = { type: 'init-complete', persisted }
        break
      }

      case 'save-subchunk': {
        await saveSubChunk(
          request.chunkX,
          request.chunkZ,
          request.subY,
          request.blocks,
          request.metadata,
          request.skyOpenAbove,
          request.blockStates
        )
        response = {
          type: 'subchunk-saved',
          chunkX: request.chunkX,
          chunkZ: request.chunkZ,
          subY: request.subY,
        }
        break
      }

      case 'load-subchunk': {
        const data = await loadSubChunk(
          request.chunkX,
          request.chunkZ,
          request.subY
        )
        if (data) {
          response = {
            type: 'subchunk-loaded',
            chunkX: request.chunkX,
            chunkZ: request.chunkZ,
            subY: request.subY,
            blocks: data.blocks,
            metadata: data.metadata,
            skyOpenAbove: data.skyOpenAbove,
          }
          const transfer: ArrayBuffer[] = [data.blocks.buffer as ArrayBuffer]
          if (data.metadata) {
            transfer.push(data.metadata.buffer as ArrayBuffer)
          }
          self.postMessage({ ...response, requestId }, { transfer })
          return
        } else {
          response = {
            type: 'subchunk-not-found',
            chunkX: request.chunkX,
            chunkZ: request.chunkZ,
            subY: request.subY,
          }
        }
        break
      }

      case 'check-subchunk-exists': {
        const exists = await checkSubChunkExists(
          request.chunkX,
          request.chunkZ,
          request.subY
        )
        response = {
          type: 'subchunk-exists',
          chunkX: request.chunkX,
          chunkZ: request.chunkZ,
          subY: request.subY,
          exists,
        }
        break
      }

      case 'save-inventory': {
        await saveInventory(request.inventory, request.playerData)
        response = { type: 'inventory-saved' }
        break
      }

      case 'load-inventory': {
        const inventory = await loadInventory()
        response = { type: 'inventory-loaded', inventory }
        break
      }

      case 'save-player-data': {
        await savePlayerData(request.key, request.data)
        response = { type: 'player-data-saved', key: request.key }
        break
      }

      case 'load-player-data': {
        const data = await loadPlayerData(request.key)
        response = { type: 'player-data-loaded', key: request.key, data }
        break
      }

      case 'save-metadata': {
        await saveMetadata(request.metadata)
        response = { type: 'metadata-saved' }
        break
      }

      case 'load-metadata': {
        const metadata = await loadMetadata()
        response = { type: 'metadata-loaded', metadata }
        break
      }

      case 'batch-save-subchunks': {
        const count = await batchSaveSubChunks(request.subchunks)
        response = { type: 'batch-save-complete', count }
        break
      }

      case 'clear-all': {
        await clearAllData()
        response = { type: 'clear-all-complete' }
        break
      }

      case 'save-block-states': {
        const count = await saveBlockStates(request.states)
        response = { type: 'block-states-saved', count }
        break
      }

      case 'load-block-states': {
        const states = await loadBlockStatesForChunk(request.chunkX, request.chunkZ)
        response = {
          type: 'block-states-loaded',
          chunkX: request.chunkX,
          chunkZ: request.chunkZ,
          states,
        }
        break
      }

      case 'delete-block-state': {
        await deleteBlockState(request.position)
        response = { type: 'block-state-deleted' }
        break
      }

      default:
        response = {
          type: 'error',
          message: `Unknown request type: ${(request as { type: string }).type}`,
          operation: 'unknown',
        }
    }

    self.postMessage({ ...response, requestId })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    self.postMessage({
      type: 'error',
      message: errorMessage,
      operation: request.type,
      requestId,
    })
  }
}
