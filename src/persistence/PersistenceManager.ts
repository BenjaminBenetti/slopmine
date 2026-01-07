/**
 * Main thread coordinator for world persistence.
 * Manages the persistence worker and coordinates save/load operations.
 */

import type { ISubChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { createSubChunkKey, type SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import type {
  PersistenceWorkerRequest,
  PersistenceWorkerResponse,
  SerializedInventory,
  WorldMetadata,
  PersistedSubChunkData,
} from './PersistenceTypes.ts'

// Auto-save interval: 5 minutes
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000

/**
 * Interface for objects that can provide modified sub-chunks for saving.
 */
export interface IModifiedChunkProvider {
  getModifiedSubChunks(): Array<{
    coordinate: ISubChunkCoordinate
    blocks: Uint16Array
    lightData: Uint8Array
  }>
  clearModifiedFlags(): void
}

export class PersistenceManager {
  private worker: Worker | null = null
  private initialized = false
  private storagePersisted = false
  private initPromise: Promise<boolean> | null = null

  // Tracking modified sub-chunks
  private readonly modifiedSubChunks: Set<SubChunkKey> = new Set()

  // Pending operations (for async request/response)
  private requestId = 0
  private readonly pendingRequests: Map<
    number,
    {
      resolve: (response: PersistenceWorkerResponse) => void
      reject: (error: Error) => void
    }
  > = new Map()

  // Cache for existence checks (avoid repeated worker calls)
  private readonly existenceCache: Map<SubChunkKey, boolean> = new Map()

  // Auto-save state
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null
  private autoSaveCallback: (() => {
    inventory: SerializedInventory
    chunkProvider: IModifiedChunkProvider
  }) | null = null

  /**
   * Initialize the persistence system.
   * Creates the worker and sets up OPFS directory structure.
   * @returns true if persistent storage was granted, false for best-effort storage
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return this.storagePersisted

    // If initialization is already in progress, return the existing promise
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<boolean> {
    // Create the worker
    this.worker = new Worker(
      new URL('../workers/PersistenceWorker.ts', import.meta.url),
      { type: 'module' }
    )

    // Set up message handler
    this.worker.onmessage = (event: MessageEvent<PersistenceWorkerResponse>) => {
      this.handleWorkerMessage(event.data)
    }

    this.worker.onerror = (error) => {
      console.error('Persistence worker error:', error)
    }

    // Initialize OPFS in worker
    const response = await this.sendRequest({ type: 'init' })

    if (response.type === 'init-complete') {
      this.initialized = true
      this.storagePersisted = response.persisted
      console.log(`Persistence initialized (persisted=${response.persisted})`)
      return response.persisted
    } else if (response.type === 'error') {
      throw new Error(`Failed to initialize persistence: ${response.message}`)
    }

    return false
  }

  /**
   * Check if the persistence system is initialized.
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Check if persistent storage was granted.
   */
  isPersisted(): boolean {
    return this.storagePersisted
  }

  /**
   * Send a request to the worker and wait for response.
   */
  private sendRequest(request: PersistenceWorkerRequest): Promise<PersistenceWorkerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'))
        return
      }

      const id = this.requestId++
      this.pendingRequests.set(id, { resolve, reject })

      // Attach request ID for tracking (worker ignores this but we use it locally)
      const requestWithId = { ...request, _requestId: id }

      // Handle transferable buffers for sub-chunk saves
      if (request.type === 'save-subchunk') {
        this.worker.postMessage(requestWithId, {
          transfer: [request.blocks.buffer as ArrayBuffer, request.lightData.buffer as ArrayBuffer],
        })
      } else if (request.type === 'batch-save-subchunks') {
        const transfers: ArrayBuffer[] = []
        for (const sc of request.subchunks) {
          transfers.push(sc.blocks.buffer as ArrayBuffer, sc.lightData.buffer as ArrayBuffer)
        }
        this.worker.postMessage(requestWithId, { transfer: transfers })
      } else {
        this.worker.postMessage(requestWithId)
      }
    })
  }

  /**
   * Handle messages from the worker.
   */
  private handleWorkerMessage(response: PersistenceWorkerResponse): void {
    // For now, resolve all pending requests with the same response type
    // In a more complex system, we'd use request IDs
    const entries = Array.from(this.pendingRequests.entries())

    for (const [id, handlers] of entries) {
      // Match response to pending request by type
      const shouldResolve = this.matchesRequest(response)
      if (shouldResolve) {
        this.pendingRequests.delete(id)
        handlers.resolve(response)
        return
      }
    }

    // If no pending request matched, just log (could be unsolicited or duplicate)
    if (response.type === 'error') {
      console.error('Persistence error:', response.message, 'operation:', response.operation)
    }
  }

  /**
   * Check if a response matches a pending request type.
   */
  private matchesRequest(response: PersistenceWorkerResponse): boolean {
    // This is a simplified matching - in production you'd use request IDs
    const pendingTypes = new Set([
      'init-complete',
      'subchunk-saved',
      'subchunk-loaded',
      'subchunk-not-found',
      'subchunk-exists',
      'inventory-saved',
      'inventory-loaded',
      'metadata-saved',
      'metadata-loaded',
      'batch-save-complete',
      'clear-all-complete',
      'error',
    ])
    return pendingTypes.has(response.type)
  }

  /**
   * Mark a sub-chunk as modified (needs to be saved).
   * Call this when player modifies a block.
   */
  markSubChunkModified(coordinate: ISubChunkCoordinate): void {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    this.modifiedSubChunks.add(key)
  }

  /**
   * Check if a sub-chunk has saved data (for generation decision).
   * Uses cache to avoid repeated worker calls.
   */
  async hasSubChunkData(coordinate: ISubChunkCoordinate): Promise<boolean> {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)

    // Check cache first
    const cached = this.existenceCache.get(key)
    if (cached !== undefined) {
      return cached
    }

    if (!this.initialized || !this.worker) {
      return false
    }

    const response = await this.sendRequest({
      type: 'check-subchunk-exists',
      chunkX: coordinate.x.toString(),
      chunkZ: coordinate.z.toString(),
      subY: coordinate.subY,
    })

    if (response.type === 'subchunk-exists') {
      this.existenceCache.set(key, response.exists)
      return response.exists
    }

    return false
  }

  /**
   * Load a sub-chunk from storage.
   * Returns null if not found.
   * Waits for initialization if it's in progress.
   */
  async loadSubChunk(coordinate: ISubChunkCoordinate): Promise<PersistedSubChunkData | null> {
    // Wait for initialization if it's in progress
    if (!this.initialized && this.initPromise) {
      await this.initPromise
    }

    if (!this.initialized || !this.worker) {
      return null
    }

    const response = await this.sendRequest({
      type: 'load-subchunk',
      chunkX: coordinate.x.toString(),
      chunkZ: coordinate.z.toString(),
      subY: coordinate.subY,
    })

    if (response.type === 'subchunk-loaded') {
      // Mark as existing in cache
      const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
      this.existenceCache.set(key, true)

      return {
        blocks: response.blocks,
        lightData: response.lightData,
      }
    }

    if (response.type === 'subchunk-not-found') {
      // Mark as not existing in cache
      const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
      this.existenceCache.set(key, false)
    }

    return null
  }

  /**
   * Save a single sub-chunk to storage.
   */
  async saveSubChunk(
    coordinate: ISubChunkCoordinate,
    blocks: Uint16Array,
    lightData: Uint8Array
  ): Promise<void> {
    if (!this.initialized || !this.worker) {
      return
    }

    // Copy buffers since they'll be transferred
    const blocksCopy = new Uint16Array(blocks)
    const lightCopy = new Uint8Array(lightData)

    await this.sendRequest({
      type: 'save-subchunk',
      chunkX: coordinate.x.toString(),
      chunkZ: coordinate.z.toString(),
      subY: coordinate.subY,
      blocks: blocksCopy,
      lightData: lightCopy,
    })

    // Update cache
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    this.existenceCache.set(key, true)
  }

  /**
   * Save all modified sub-chunks, player inventory, and player position.
   */
  async saveAll(
    inventory: SerializedInventory,
    chunkProvider: IModifiedChunkProvider,
    playerPosition?: { x: number; y: number; z: number }
  ): Promise<void> {
    if (!this.initialized || !this.worker) {
      return
    }

    const modifiedChunks = chunkProvider.getModifiedSubChunks()

    if (modifiedChunks.length > 0) {
      // Batch save all modified sub-chunks
      const subchunks = modifiedChunks.map((mc) => ({
        chunkX: mc.coordinate.x.toString(),
        chunkZ: mc.coordinate.z.toString(),
        subY: mc.coordinate.subY,
        blocks: new Uint16Array(mc.blocks), // Copy for transfer
        lightData: new Uint8Array(mc.lightData),
      }))

      await this.sendRequest({
        type: 'batch-save-subchunks',
        subchunks,
      })

      // Update cache and clear modified flags
      for (const mc of modifiedChunks) {
        const key = createSubChunkKey(mc.coordinate.x, mc.coordinate.z, mc.coordinate.subY)
        this.existenceCache.set(key, true)
        this.modifiedSubChunks.delete(key)
      }

      chunkProvider.clearModifiedFlags()
    }

    // Save inventory
    await this.sendRequest({
      type: 'save-inventory',
      inventory,
    })

    // Save metadata
    await this.sendRequest({
      type: 'save-metadata',
      metadata: {
        version: 1,
        seed: 0, // TODO: Get from world generator
        createdAt: new Date().toISOString(),
        lastSavedAt: new Date().toISOString(),
        playerPosition,
      },
    })
  }

  /**
   * Load player inventory from storage.
   */
  async loadInventory(): Promise<SerializedInventory | null> {
    if (!this.initialized || !this.worker) {
      return null
    }

    const response = await this.sendRequest({ type: 'load-inventory' })

    if (response.type === 'inventory-loaded') {
      return response.inventory
    }

    return null
  }

  /**
   * Load world metadata from storage.
   */
  async loadMetadata(): Promise<WorldMetadata | null> {
    if (!this.initialized || !this.worker) {
      return null
    }

    const response = await this.sendRequest({ type: 'load-metadata' })

    if (response.type === 'metadata-loaded') {
      return response.metadata
    }

    return null
  }

  /**
   * Start the auto-save timer (every 5 minutes).
   */
  startAutoSave(
    callback: () => {
      inventory: SerializedInventory
      chunkProvider: IModifiedChunkProvider
      playerPosition?: { x: number; y: number; z: number }
    }
  ): void {
    if (this.autoSaveInterval) {
      return // Already running
    }

    this.autoSaveCallback = callback as () => {
      inventory: SerializedInventory
      chunkProvider: IModifiedChunkProvider
    }

    this.autoSaveInterval = setInterval(async () => {
      if (!this.autoSaveCallback) return

      try {
        const result = callback()
        await this.saveAll(result.inventory, result.chunkProvider, result.playerPosition)
        console.log('Auto-save complete')
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }, AUTO_SAVE_INTERVAL_MS)

    console.log(`Auto-save started (every ${AUTO_SAVE_INTERVAL_MS / 1000 / 60} minutes)`)
  }

  /**
   * Stop the auto-save timer.
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval)
      this.autoSaveInterval = null
      this.autoSaveCallback = null
      console.log('Auto-save stopped')
    }
  }

  /**
   * Perform a final save before page unload.
   * Note: This is best-effort as the page may close before completion.
   */
  async saveBeforeUnload(
    inventory: SerializedInventory,
    chunkProvider: IModifiedChunkProvider,
    playerPosition?: { x: number; y: number; z: number }
  ): Promise<void> {
    try {
      await this.saveAll(inventory, chunkProvider, playerPosition)
    } catch (error) {
      console.error('Save before unload failed:', error)
    }
  }

  /**
   * Get the number of modified sub-chunks pending save.
   */
  getModifiedCount(): number {
    return this.modifiedSubChunks.size
  }

  /**
   * Clear the existence cache (useful after world reset).
   */
  clearCache(): void {
    this.existenceCache.clear()
    this.modifiedSubChunks.clear()
  }

  /**
   * Clear all saved data (for new game).
   */
  async clearAll(): Promise<void> {
    if (!this.initialized || !this.worker) {
      return
    }

    await this.sendRequest({ type: 'clear-all' })
    this.clearCache()
    console.log('All saved data cleared')
  }

  /**
   * Dispose the persistence manager and terminate the worker.
   */
  dispose(): void {
    this.stopAutoSave()

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this.pendingRequests.clear()
    this.existenceCache.clear()
    this.modifiedSubChunks.clear()
    this.initialized = false
  }
}
