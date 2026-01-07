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
} from '../persistence/PersistenceTypes.ts'
import {
  MAGIC_NUMBER,
  PERSISTENCE_VERSION,
  HEADER_SIZE,
  FLAG_HAS_LIGHT_DATA,
} from '../persistence/PersistenceTypes.ts'

const DB_NAME = 'slopmine'
const DB_VERSION = 1
const CHUNKS_STORE = 'chunks'
const PLAYER_STORE = 'player'
const META_STORE = 'metadata'

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
  lightData: Uint8Array
): Promise<void> {
  const database = await openDatabase()

  const blockDataLength = blocks.byteLength
  const lightDataLength = lightData.byteLength
  const totalSize = HEADER_SIZE + blockDataLength + lightDataLength

  // Create buffer with header + data
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  let offset = 0
  view.setUint32(offset, MAGIC_NUMBER, true)
  offset += 4
  view.setUint16(offset, PERSISTENCE_VERSION, true)
  offset += 2
  view.setUint32(offset, FLAG_HAS_LIGHT_DATA, true)
  offset += 4
  view.setUint32(offset, blockDataLength, true)
  offset += 4
  view.setUint32(offset, lightDataLength, true)
  offset += 4

  const blockBytes = new Uint8Array(blocks.buffer, blocks.byteOffset, blocks.byteLength)
  new Uint8Array(buffer, offset, blockDataLength).set(blockBytes)
  offset += blockDataLength

  new Uint8Array(buffer, offset, lightDataLength).set(lightData)

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
 */
async function loadSubChunk(
  chunkX: string,
  chunkZ: string,
  subY: number
): Promise<{ blocks: Uint16Array; lightData: Uint8Array } | null> {
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

      if (buffer.byteLength < HEADER_SIZE) {
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

      if (version !== PERSISTENCE_VERSION) {
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

      const blocks = new Uint16Array(buffer.slice(offset, offset + blockDataLength))
      offset += blockDataLength

      let lightData: Uint8Array
      if (flags & FLAG_HAS_LIGHT_DATA) {
        lightData = new Uint8Array(buffer.slice(offset, offset + lightDataLength))
      } else {
        lightData = new Uint8Array(65536)
        lightData.fill(0xf0)
      }

      resolve({ blocks, lightData })
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
 * Save player inventory.
 */
async function saveInventory(inventory: SerializedInventory): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(PLAYER_STORE, 'readwrite')
    const store = tx.objectStore(PLAYER_STORE)

    const request = store.put(inventory, 'inventory')

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to save inventory: ${request.error?.message}`))
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
    const tx = database.transaction([CHUNKS_STORE, PLAYER_STORE, META_STORE], 'readwrite')

    tx.objectStore(CHUNKS_STORE).clear()
    tx.objectStore(PLAYER_STORE).clear()
    tx.objectStore(META_STORE).clear()

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
    lightData: Uint8Array
  }>
): Promise<number> {
  let savedCount = 0

  for (const sc of subchunks) {
    try {
      await saveSubChunk(sc.chunkX, sc.chunkZ, sc.subY, sc.blocks, sc.lightData)
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

// Message handler
self.onmessage = async (event: MessageEvent<PersistenceWorkerRequest>) => {
  const request = event.data

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
          request.lightData
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
            lightData: data.lightData,
          }
          self.postMessage(response, {
            transfer: [data.blocks.buffer, data.lightData.buffer],
          })
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
        await saveInventory(request.inventory)
        response = { type: 'inventory-saved' }
        break
      }

      case 'load-inventory': {
        const inventory = await loadInventory()
        response = { type: 'inventory-loaded', inventory }
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

      default:
        response = {
          type: 'error',
          message: `Unknown request type: ${(request as { type: string }).type}`,
          operation: 'unknown',
        }
    }

    self.postMessage(response)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    self.postMessage({
      type: 'error',
      message: errorMessage,
      operation: request.type,
    } as PersistenceWorkerResponse)
  }
}
