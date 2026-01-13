/**
 * Web Worker for liquid physics simulation.
 * Processes liquid flow in chunk columns off the main thread.
 *
 * Uses the shared LiquidPhysicsAlgorithm module for the actual physics logic.
 */

import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import {
  processLiquidColumn,
  isLiquidBlock,
  type IBlockAccessor,
} from '../world/liquid/LiquidPhysicsAlgorithm.ts'

// Initialize block registry in worker context
registerDefaultBlocks()

/**
 * Sub-chunk block data for liquid physics.
 */
export interface LiquidSubChunkData {
  subY: number
  blocks: Uint16Array // 32*32*32 = 32768 elements
}

/**
 * Request to process liquid physics for a chunk column.
 */
export interface LiquidPhysicsRequest {
  type: 'process-liquid'
  chunkX: number
  chunkZ: number
  liquidPositions: Array<{ x: number; worldY: number; z: number }>
  subChunks: LiquidSubChunkData[]
  // Neighbor boundary data - maps subY to 1-block-deep edge layer
  // Each layer is SIZE_Z * SUB_CHUNK_HEIGHT (for X edges) or SIZE_X * SUB_CHUNK_HEIGHT (for Z edges)
  neighborPosX: Array<{ subY: number; data: Uint16Array }> | null
  neighborNegX: Array<{ subY: number; data: Uint16Array }> | null
  neighborPosZ: Array<{ subY: number; data: Uint16Array }> | null
  neighborNegZ: Array<{ subY: number; data: Uint16Array }> | null
}

/**
 * A single block change computed by the worker.
 */
export interface BlockChange {
  x: number // World X
  y: number // World Y
  z: number // World Z
  blockId: number
}

/**
 * Response from liquid physics worker.
 */
export interface LiquidPhysicsResponse {
  type: 'liquid-result'
  chunkX: number
  chunkZ: number
  changes: BlockChange[]
  columnsToRequeue: Array<{ chunkX: number; chunkZ: number }>
  anyChanged: boolean
}

/**
 * Error response from worker.
 */
export interface LiquidPhysicsError {
  type: 'liquid-error'
  chunkX: number
  chunkZ: number
  error: string
}

export type LiquidPhysicsWorkerRequest = LiquidPhysicsRequest
export type LiquidPhysicsWorkerResponse = LiquidPhysicsResponse | LiquidPhysicsError

/**
 * Block accessor that reads from transferred buffers and accumulates changes.
 */
class WorkerBlockAccessor implements IBlockAccessor {
  private readonly chunkX: number
  private readonly chunkZ: number
  private readonly baseX: number
  private readonly baseZ: number

  // Map subY -> block data
  private readonly subChunks: Map<number, Uint16Array>

  // Neighbor boundary layers (subY -> layer data)
  private readonly neighborPosX: Map<number, Uint16Array>
  private readonly neighborNegX: Map<number, Uint16Array>
  private readonly neighborPosZ: Map<number, Uint16Array>
  private readonly neighborNegZ: Map<number, Uint16Array>

  // Accumulated changes: "x,y,z" -> blockId
  private readonly changes: Map<string, BlockChange> = new Map()

  constructor(request: LiquidPhysicsRequest) {
    this.chunkX = request.chunkX
    this.chunkZ = request.chunkZ
    this.baseX = request.chunkX * CHUNK_SIZE_X
    this.baseZ = request.chunkZ * CHUNK_SIZE_Z

    // Build sub-chunk map
    this.subChunks = new Map()
    for (const sc of request.subChunks) {
      this.subChunks.set(sc.subY, sc.blocks)
    }

    // Build neighbor maps
    this.neighborPosX = new Map()
    this.neighborNegX = new Map()
    this.neighborPosZ = new Map()
    this.neighborNegZ = new Map()

    if (request.neighborPosX) {
      for (const n of request.neighborPosX) {
        this.neighborPosX.set(n.subY, n.data)
      }
    }
    if (request.neighborNegX) {
      for (const n of request.neighborNegX) {
        this.neighborNegX.set(n.subY, n.data)
      }
    }
    if (request.neighborPosZ) {
      for (const n of request.neighborPosZ) {
        this.neighborPosZ.set(n.subY, n.data)
      }
    }
    if (request.neighborNegZ) {
      for (const n of request.neighborNegZ) {
        this.neighborNegZ.set(n.subY, n.data)
      }
    }
  }

  /**
   * Get block ID at world coordinates.
   */
  getBlockId(worldX: number, worldY: number, worldZ: number): number {
    // Check pending changes first
    const key = `${worldX},${worldY},${worldZ}`
    const pending = this.changes.get(key)
    if (pending) return pending.blockId

    // Bounds check for Y
    if (worldY < 0 || worldY >= 512) return BlockIds.AIR

    const localX = worldX - this.baseX
    const localZ = worldZ - this.baseZ

    // Within current column
    if (localX >= 0 && localX < CHUNK_SIZE_X && localZ >= 0 && localZ < CHUNK_SIZE_Z) {
      const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
      const localY = worldY % SUB_CHUNK_HEIGHT
      const subChunk = this.subChunks.get(subY)
      if (!subChunk) return BlockIds.AIR

      const index = localY * CHUNK_SIZE_X * CHUNK_SIZE_Z + localZ * CHUNK_SIZE_X + localX
      return subChunk[index]
    }

    // Check neighbor boundaries
    return this.getNeighborBlock(worldX, worldY, worldZ, localX, localZ)
  }

  /**
   * Get block from neighbor boundary data.
   */
  private getNeighborBlock(
    _worldX: number,
    worldY: number,
    _worldZ: number,
    localX: number,
    localZ: number
  ): number {
    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT

    // +X neighbor (localX >= CHUNK_SIZE_X, i.e. localX == 32)
    if (localX >= CHUNK_SIZE_X && localX < CHUNK_SIZE_X + 1) {
      const layer = this.neighborPosX.get(subY)
      if (layer) {
        // Layer index: localY * SIZE_Z + localZ
        const layerIndex = localY * CHUNK_SIZE_Z + localZ
        if (layerIndex >= 0 && layerIndex < layer.length) {
          return layer[layerIndex]
        }
      }
      return BlockIds.AIR
    }

    // -X neighbor (localX < 0, i.e. localX == -1)
    if (localX < 0 && localX >= -1) {
      const layer = this.neighborNegX.get(subY)
      if (layer) {
        const layerIndex = localY * CHUNK_SIZE_Z + localZ
        if (layerIndex >= 0 && layerIndex < layer.length) {
          return layer[layerIndex]
        }
      }
      return BlockIds.AIR
    }

    // +Z neighbor (localZ >= CHUNK_SIZE_Z)
    if (localZ >= CHUNK_SIZE_Z && localZ < CHUNK_SIZE_Z + 1) {
      const layer = this.neighborPosZ.get(subY)
      if (layer) {
        // Layer index: localY * SIZE_X + localX
        const layerIndex = localY * CHUNK_SIZE_X + localX
        if (layerIndex >= 0 && layerIndex < layer.length) {
          return layer[layerIndex]
        }
      }
      return BlockIds.AIR
    }

    // -Z neighbor (localZ < 0)
    if (localZ < 0 && localZ >= -1) {
      const layer = this.neighborNegZ.get(subY)
      if (layer) {
        const layerIndex = localY * CHUNK_SIZE_X + localX
        if (layerIndex >= 0 && layerIndex < layer.length) {
          return layer[layerIndex]
        }
      }
      return BlockIds.AIR
    }

    // Outside all boundaries
    return BlockIds.AIR
  }

  /**
   * Set block at world coordinates.
   * Accumulates changes for later retrieval.
   * Cross-chunk changes are allowed and will be applied by the main thread.
   */
  setBlock(worldX: number, worldY: number, worldZ: number, blockId: number): boolean {
    if (worldY < 0 || worldY >= 512) {
      return false
    }

    const current = this.getBlockId(worldX, worldY, worldZ)
    if (current === blockId) return false

    const key = `${worldX},${worldY},${worldZ}`
    this.changes.set(key, { x: worldX, y: worldY, z: worldZ, blockId })

    // Also update the sub-chunk data so subsequent reads see the change
    // (only for blocks within our column - cross-chunk changes are read from pending)
    const localX = worldX - this.baseX
    const localZ = worldZ - this.baseZ

    // Only update local buffer if within our column bounds
    if (localX >= 0 && localX < CHUNK_SIZE_X && localZ >= 0 && localZ < CHUNK_SIZE_Z) {
      const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
      const localY = worldY % SUB_CHUNK_HEIGHT
      const subChunk = this.subChunks.get(subY)
      if (subChunk) {
        const index = localY * CHUNK_SIZE_X * CHUNK_SIZE_Z + localZ * CHUNK_SIZE_X + localX
        subChunk[index] = blockId
      }
    }
    // Cross-chunk changes will be read from the pending changes Map via getBlockId()

    return true
  }

  /**
   * Get all accumulated changes.
   */
  getChanges(): BlockChange[] {
    return Array.from(this.changes.values())
  }
}

/**
 * Process a liquid physics request.
 */
function processRequest(request: LiquidPhysicsRequest): LiquidPhysicsResponse {
  const accessor = new WorkerBlockAccessor(request)

  const baseX = request.chunkX * CHUNK_SIZE_X
  const baseZ = request.chunkZ * CHUNK_SIZE_Z

  // Process the column using the shared algorithm
  const result = processLiquidColumn(
    accessor,
    baseX,
    baseZ,
    CHUNK_SIZE_X,
    request.liquidPositions
  )

  return {
    type: 'liquid-result',
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    changes: accessor.getChanges(),
    columnsToRequeue: result.columnsToRequeue,
    anyChanged: result.anyChanged,
  }
}

/**
 * Worker message handler.
 */
self.onmessage = (event: MessageEvent<LiquidPhysicsWorkerRequest>) => {
  const request = event.data

  try {
    if (request.type === 'process-liquid') {
      const response = processRequest(request)
      self.postMessage(response)
    }
  } catch (error) {
    const errorResponse: LiquidPhysicsError = {
      type: 'liquid-error',
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(errorResponse)
  }
}
