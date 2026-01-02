/**
 * Web Worker for background lighting correction.
 * Periodically re-calculates skylight for chunk columns to fix
 * lighting errors that occur during generation.
 */

import { WorkerSubChunk } from './WorkerSubChunk.ts'
import { SkylightPropagator, type BoundaryLight } from '../world/lighting/SkylightPropagator.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_VOLUME } from '../world/interfaces/IChunk.ts'
import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'

// Initialize block registry in worker context
registerDefaultBlocks()

/**
 * Request to recalculate lighting for a chunk column.
 */
export interface LightingRequest {
  type: 'recalculate-column'
  chunkX: number
  chunkZ: number
  /** Block data for each sub-chunk (indexed by subY 0-15). Null if sub-chunk doesn't exist. */
  subChunks: Array<{
    subY: number
    blocks: Uint16Array
    lightData: Uint8Array
  }>
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

      // Clear existing light data and recalculate
      const lightData = workerSubChunk.getLightData()
      lightData.fill(0)

      // Propagate skylight for this sub-chunk
      skylightPropagator.propagateSubChunk(workerSubChunk, aboveBoundaryLight)

      // Get boundary light for the next sub-chunk below
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

// Worker message handler
self.onmessage = (event: MessageEvent<LightingRequest>) => {
  const result = processLightingRequest(event.data)

  if (result.type === 'lighting-result') {
    // Transfer the light data buffers back
    const transfer = result.updatedSubChunks.map((sc) => sc.lightData.buffer)
    self.postMessage(result, { transfer })
  } else {
    self.postMessage(result)
  }
}
