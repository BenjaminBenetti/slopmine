/**
 * Web Worker for background lighting correction.
 * Periodically re-calculates skylight for chunk columns to fix
 * lighting errors that occur during generation.
 */

import { WorkerSubChunk } from './WorkerSubChunk.ts'
import { SkylightPropagator, type BoundaryLight } from '../world/lighting/SkylightPropagator.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_VOLUME } from '../world/interfaces/IChunk.ts'
import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'

// Initialize block registry in worker context
registerDefaultBlocks()

/**
 * Sub-chunk data for lighting requests.
 */
export interface SubChunkData {
  subY: number
  blocks: Uint16Array
  lightData: Uint8Array
}

/**
 * Request to recalculate lighting for a chunk column.
 */
export interface LightingRequest {
  type: 'recalculate-column'
  chunkX: number
  chunkZ: number
  /** Block data for each sub-chunk (indexed by subY 0-15). Null if sub-chunk doesn't exist. */
  subChunks: SubChunkData[]
}

/**
 * Request to update lighting after a block change.
 */
export interface BlockChangeLightingRequest {
  type: 'update-block-lighting'
  chunkX: number
  chunkZ: number
  localX: number
  localY: number // Global Y coordinate (0-1023)
  localZ: number
  wasBlockRemoved: boolean
  subChunks: SubChunkData[]
  forceRemeshSubY: number // Always remesh this sub-chunk regardless of lighting changes
}

/**
 * Response with updated lighting data.
 */
export interface LightingResponse {
  type: 'lighting-result'
  chunkX: number
  chunkZ: number
  /** Updated light data for each sub-chunk that changed */
  updatedSubChunks: Array<{
    subY: number
    lightData: Uint8Array
    changed: boolean
  }>
  /** Sub-chunk that must be remeshed regardless of lighting changes (from block change request) */
  forceRemeshSubY?: number
}

/**
 * Error response from worker.
 */
export interface LightingError {
  type: 'lighting-error'
  chunkX: number
  chunkZ: number
  error: string
}

const skylightPropagator = new SkylightPropagator()

/**
 * Create a column-like wrapper from a Map of WorkerSubChunks.
 * This allows SkylightPropagator methods to work with worker sub-chunks.
 */
function createColumnWrapper(subChunks: Map<number, WorkerSubChunk>) {
  return {
    getSubChunk: (subY: number) => subChunks.get(subY) ?? null,
  }
}

/**
 * Process a block change lighting request.
 */
function processBlockChangeRequest(
  request: BlockChangeLightingRequest
): LightingResponse | LightingError {
  try {
    const { chunkX, chunkZ, localX, localY, localZ, wasBlockRemoved, subChunks } = request

    // Create WorkerSubChunk instances
    const workerSubChunks: Map<number, WorkerSubChunk> = new Map()
    for (const sc of subChunks) {
      const workerSubChunk = new WorkerSubChunk(
        chunkX,
        chunkZ,
        sc.subY,
        sc.blocks,
        sc.lightData
      )
      workerSubChunks.set(sc.subY, workerSubChunk)
    }

    // Store original light data for comparison
    const originalLightData: Map<number, Uint8Array> = new Map()
    for (const sc of subChunks) {
      originalLightData.set(sc.subY, new Uint8Array(sc.lightData))
    }

    // Create column wrapper for SkylightPropagator
    const column = createColumnWrapper(workerSubChunks)

    // Use the same lighting update logic as block mining
    const affectedSubChunksList = skylightPropagator.updateSubChunkLightingAt(
      column,
      localX,
      localY,
      localZ,
      wasBlockRemoved
    )

    // Convert to Set for O(1) lookup
    const affectedSubChunksSet = new Set(affectedSubChunksList)

    // Build response with updated light data for ALL sub-chunks
    // (some may have been affected through propagation)
    const updatedSubChunks: LightingResponse['updatedSubChunks'] = []

    // Calculate which sub-chunk contains the block change and Y boundary info
    const SUB_CHUNK_HEIGHT = 64
    const blockChangeSubY = Math.floor(localY / SUB_CHUNK_HEIGHT)
    const localSubY = localY % SUB_CHUNK_HEIGHT

    // Check if block is at Y boundary (needs adjacent sub-chunk remeshed too)
    const isAtBottomOfSubChunk = localSubY === 0
    const isAtTopOfSubChunk = localSubY === SUB_CHUNK_HEIGHT - 1

    for (const sc of subChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!
      const newLightData = workerSubChunk.getLightData()
      const oldLightData = originalLightData.get(sc.subY)!

      // Check if light data changed
      let changed = false
      for (let i = 0; i < newLightData.length; i++) {
        if (newLightData[i] !== oldLightData[i]) {
          changed = true
          break
        }
      }

      // Force changed=true for the sub-chunk containing the block change
      // (block data changed even if light didn't, so it needs remeshing)
      if (sc.subY === blockChangeSubY) {
        changed = true
      }

      // Force changed=true for sub-chunks affected by light propagation
      if (affectedSubChunksSet.has(sc.subY)) {
        changed = true
      }

      // Also force changed=true for adjacent sub-chunks at Y boundaries
      // (their faces are now exposed even if light didn't change)
      if (isAtBottomOfSubChunk && sc.subY === blockChangeSubY - 1) {
        changed = true
      }
      if (isAtTopOfSubChunk && sc.subY === blockChangeSubY + 1) {
        changed = true
      }

      updatedSubChunks.push({
        subY: sc.subY,
        lightData: new Uint8Array(newLightData),
        changed,
      })
    }

    return {
      type: 'lighting-result',
      chunkX,
      chunkZ,
      updatedSubChunks,
      forceRemeshSubY: request.forceRemeshSubY,
    }
  } catch (error) {
    return {
      type: 'lighting-error',
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Process a lighting request for a chunk column.
 */
function processLightingRequest(request: LightingRequest): LightingResponse | LightingError {
  try {
    const { chunkX, chunkZ, subChunks } = request

    // Sort sub-chunks by subY (highest first) for top-down processing
    const sortedSubChunks = [...subChunks].sort((a, b) => b.subY - a.subY)

    // Create WorkerSubChunk instances for each sub-chunk
    const workerSubChunks: Map<number, WorkerSubChunk> = new Map()
    for (const sc of sortedSubChunks) {
      const workerSubChunk = new WorkerSubChunk(
        chunkX,
        chunkZ,
        sc.subY,
        sc.blocks,
        sc.lightData
      )
      workerSubChunks.set(sc.subY, workerSubChunk)
    }

    // Store original light data for comparison
    const originalLightData: Map<number, Uint8Array> = new Map()
    for (const sc of sortedSubChunks) {
      originalLightData.set(sc.subY, new Uint8Array(sc.lightData))
    }

    // Process from top to bottom, propagating boundary light downward
    let aboveBoundaryLight: BoundaryLight | undefined

    for (const sc of sortedSubChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!

      // Don't clear existing light data - preserve correct values from initial generation
      // The propagation will enhance/fix existing lighting rather than rebuilding from scratch
      // This matches mining behavior and avoids losing light from neighboring chunks

      // Propagate skylight for this sub-chunk
      skylightPropagator.propagateSubChunk(workerSubChunk, aboveBoundaryLight)

      // Get boundary light for the next sub-chunk below
      aboveBoundaryLight = skylightPropagator.getBottomBoundaryLight(workerSubChunk)
    }

    // Sky access correction pass: fix dark air blocks that have sky access
    // This matches the logic used in block mining to ensure consistent results
    const column = createColumnWrapper(workerSubChunks)
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        // Scan from bottom up to find dark air blocks that should be lit
        for (const sc of subChunks) {
          const subChunk = workerSubChunks.get(sc.subY)!
          for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
            const blockId = subChunk.getBlockId(x, localY, z)
            const currentLight = subChunk.getSkylight(x, localY, z)

            // If air block with light < 15, check if it has sky access
            if (blockId === BlockIds.AIR && currentLight < 15) {
              const globalY = sc.subY * SUB_CHUNK_HEIGHT + localY
              if (SkylightPropagator.checkSubChunkSkyAccess(column, x, globalY, z)) {
                // Has sky access but isn't at full light - set to 15
                subChunk.setSkylight(x, localY, z, 15)
              }
            }
          }
        }
      }
    }

    // Re-propagate from top to bottom to spread corrected light values down
    // This is needed because sky access corrections may set blocks to 15 that need to
    // propagate DOWN across sub-chunk boundaries (spreadSubChunkLight only works within a sub-chunk)
    aboveBoundaryLight = undefined
    for (const sc of sortedSubChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!

      // Apply boundary light from sub-chunk above
      if (aboveBoundaryLight) {
        skylightPropagator.propagateFromAbove(workerSubChunk, aboveBoundaryLight)
      }

      // Spread horizontally within this sub-chunk
      skylightPropagator.spreadSubChunkLight(workerSubChunk)

      // Get boundary for next sub-chunk below
      aboveBoundaryLight = skylightPropagator.getBottomBoundaryLight(workerSubChunk)
    }

    // Build response with updated light data
    const updatedSubChunks: LightingResponse['updatedSubChunks'] = []

    for (const sc of subChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!
      const newLightData = workerSubChunk.getLightData()
      const oldLightData = originalLightData.get(sc.subY)!

      // Check if light data changed
      let changed = false
      for (let i = 0; i < newLightData.length; i++) {
        if (newLightData[i] !== oldLightData[i]) {
          changed = true
          break
        }
      }

      updatedSubChunks.push({
        subY: sc.subY,
        lightData: new Uint8Array(newLightData), // Copy for transfer
        changed,
      })
    }

    return {
      type: 'lighting-result',
      chunkX,
      chunkZ,
      updatedSubChunks,
    }
  } catch (error) {
    return {
      type: 'lighting-error',
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Priority queues for requests
const highPriorityQueue: BlockChangeLightingRequest[] = []
const lowPriorityQueue: LightingRequest[] = []
let isProcessing = false

function processNextRequest(): void {
  // Process high priority (block changes) first
  const request = highPriorityQueue.shift() ?? lowPriorityQueue.shift()
  if (!request) {
    isProcessing = false
    return
  }

  isProcessing = true
  let result: LightingResponse | LightingError

  try {
    if (request.type === 'update-block-lighting') {
      result = processBlockChangeRequest(request)
    } else {
      result = processLightingRequest(request)
    }

    if (result.type === 'lighting-result') {
      const transfer = result.updatedSubChunks.map((sc) => sc.lightData.buffer)
      self.postMessage(result, { transfer })
    } else {
      self.postMessage(result)
    }
  } catch (error) {
    // Send error response so main thread can clean up pending state
    self.postMessage({
      type: 'lighting-error',
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Process next request on next tick to allow new messages to arrive
  setTimeout(processNextRequest, 0)
}

// Worker message handler
self.onmessage = (event: MessageEvent<LightingRequest | BlockChangeLightingRequest>) => {
  // Queue based on priority
  if (event.data.type === 'update-block-lighting') {
    highPriorityQueue.push(event.data)
  } else {
    lowPriorityQueue.push(event.data)
  }

  // Start processing if not already
  if (!isProcessing) {
    processNextRequest()
  }
}
