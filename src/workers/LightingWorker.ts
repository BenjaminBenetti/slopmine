/**
 * Web Worker for background lighting correction.
 * Periodically re-calculates skylight for chunk columns to fix
 * lighting errors that occur during generation.
 */

import { WorkerSubChunk } from './WorkerSubChunk.ts'
import { SkylightPropagator, type BoundaryLight } from '../world/lighting/SkylightPropagator.ts'
import { BlocklightPropagator, type BlocklightBoundary } from '../world/lighting/BlocklightPropagator.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_VOLUME } from '../world/interfaces/IChunk.ts'
import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'

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
const blocklightPropagator = new BlocklightPropagator()

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

    // Handle blocklight changes
    const blockChangeSubY = Math.floor(localY / SUB_CHUNK_HEIGHT)
    const localSubY = localY % SUB_CHUNK_HEIGHT
    const subChunk = workerSubChunks.get(blockChangeSubY)

    if (subChunk) {
      const blockId = subChunk.getBlockId(localX, localSubY, localZ)
      const block = getBlock(blockId)

      if (wasBlockRemoved) {
        // If we removed a light source, clear and recalculate blocklight
        const oldBlocklight = subChunk.getBlocklight(localX, localSubY, localZ)
        if (oldBlocklight > 0) {
          blocklightPropagator.clearAndRecalculate(subChunk, localX, localSubY, localZ, oldBlocklight)
        }
        // Also propagate blocklight INTO the newly exposed space from neighbors
        // (e.g., mining a stone block near a torch should let torch light flow in)
        blocklightPropagator.propagateIntoExposedBlock(subChunk, localX, localSubY, localZ)
      } else if (block.properties.lightLevel > 0) {
        // A light source was placed - propagate from it
        subChunk.setBlocklight(localX, localSubY, localZ, block.properties.lightLevel)
        // Re-run propagation for this sub-chunk to spread the new light
        blocklightPropagator.propagateSubChunk(subChunk)
      }
    }

    // Propagate any light that exists at chunk edges inward
    // This handles light that came from neighboring chunks (via edge propagation on main thread)
    // and ensures it spreads fully into this chunk
    for (const sc of subChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)
      if (workerSubChunk) {
        blocklightPropagator.propagateFromEdges(workerSubChunk)
      }
    }

    // Convert to Set for O(1) lookup
    const affectedSubChunksSet = new Set(affectedSubChunksList)

    // Build response with updated light data for ALL sub-chunks
    // (some may have been affected through propagation)
    const updatedSubChunks: LightingResponse['updatedSubChunks'] = []

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

      // Clear skylight data before recalculating - this fixes incorrect values from
      // initial generation (e.g., cave air incorrectly set to 15)
      for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          for (let x = 0; x < CHUNK_SIZE_X; x++) {
            workerSubChunk.setSkylight(x, y, z, 0)
          }
        }
      }

      // Propagate skylight for this sub-chunk
      skylightPropagator.propagateSubChunk(workerSubChunk, aboveBoundaryLight)

      // Get boundary light for the next sub-chunk below
      aboveBoundaryLight = skylightPropagator.getBottomBoundaryLight(workerSubChunk)
    }

    // Sky access correction pass: fix dark air blocks that are at the TOP of their column
    // Only set to 15 if there's no solid block above AND we're at the highest air in this column
    // This prevents cave interiors from being incorrectly lit to full brightness
    const column = createColumnWrapper(workerSubChunks)
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        // Find the highest solid block in this column
        let highestSolidY = -1
        for (const sc of [...subChunks].sort((a, b) => b.subY - a.subY)) {
          const subChunk = workerSubChunks.get(sc.subY)!
          for (let localY = SUB_CHUNK_HEIGHT - 1; localY >= 0; localY--) {
            const blockId = subChunk.getBlockId(x, localY, z)
            if (blockId !== BlockIds.AIR) {
              highestSolidY = sc.subY * SUB_CHUNK_HEIGHT + localY
              break
            }
          }
          if (highestSolidY >= 0) break
        }

        // Only give skylight to air blocks ABOVE the highest solid
        for (const sc of subChunks) {
          const subChunk = workerSubChunks.get(sc.subY)!
          for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
            const globalY = sc.subY * SUB_CHUNK_HEIGHT + localY
            const blockId = subChunk.getBlockId(x, localY, z)

            if (blockId === BlockIds.AIR && globalY > highestSolidY) {
              // Air above all solid blocks - has true sky access
              subChunk.setSkylight(x, localY, z, 15)
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

    // Blocklight propagation: find light-emitting blocks and propagate
    // Process all sub-chunks to find and propagate blocklight
    for (const sc of subChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!
      blocklightPropagator.propagateSubChunk(workerSubChunk)
    }

    // Propagate blocklight across sub-chunk Y boundaries
    // Process from bottom to top, then top to bottom for complete coverage
    const sortedBySubY = [...subChunks].sort((a, b) => a.subY - b.subY)
    let belowBoundaryLight: BlocklightBoundary | undefined

    // Bottom to top pass
    for (const sc of sortedBySubY) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!
      if (belowBoundaryLight) {
        blocklightPropagator.propagateFromBelow(workerSubChunk, belowBoundaryLight)
      }
      belowBoundaryLight = blocklightPropagator.getTopBoundaryLight(workerSubChunk)
    }

    // Top to bottom pass
    let aboveBlocklight: BlocklightBoundary | undefined
    for (const sc of sortedSubChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!
      if (aboveBlocklight) {
        blocklightPropagator.propagateFromAbove(workerSubChunk, aboveBlocklight)
      }
      aboveBlocklight = blocklightPropagator.getBottomBoundaryLight(workerSubChunk)
    }

    // Propagate any light at chunk horizontal edges inward
    // This handles light that came from neighboring chunks (via edge propagation on main thread)
    for (const sc of subChunks) {
      const workerSubChunk = workerSubChunks.get(sc.subY)!
      blocklightPropagator.propagateFromEdges(workerSubChunk)
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
