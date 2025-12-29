/**
 * Web Worker for calculating visible blocks in a chunk.
 * Offloads expensive visibility calculations from the main thread.
 */

// Chunk constants (duplicated to avoid import issues in worker)
const CHUNK_SIZE_X = 32
const CHUNK_SIZE_Z = 32
const CHUNK_HEIGHT = 1024

// Block ID for air (invisible)
const AIR = 0

/**
 * Calculate array index for local coordinates.
 * Memory layout: Y-major (y * SIZE_X * SIZE_Z + z * SIZE_X + x)
 */
function localToIndex(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
}

/**
 * Check if a block has any exposed faces.
 * For edge blocks without neighbor data, assume exposed.
 */
function hasExposedFace(
  blocks: Uint16Array,
  x: number,
  y: number,
  z: number,
  neighbors: NeighborData
): boolean {
  // Check Y neighbors (within chunk)
  if (y === 0 || y === CHUNK_HEIGHT - 1) return true
  if (blocks[localToIndex(x, y + 1, z)] === AIR) return true
  if (blocks[localToIndex(x, y - 1, z)] === AIR) return true

  // Check X neighbors
  if (x === 0) {
    // Left edge - check neighbor chunk or assume exposed
    if (!neighbors.negX || neighbors.negX[localToIndex(CHUNK_SIZE_X - 1, y, z)] === AIR) {
      return true
    }
  } else if (blocks[localToIndex(x - 1, y, z)] === AIR) {
    return true
  }

  if (x === CHUNK_SIZE_X - 1) {
    // Right edge - check neighbor chunk or assume exposed
    if (!neighbors.posX || neighbors.posX[localToIndex(0, y, z)] === AIR) {
      return true
    }
  } else if (blocks[localToIndex(x + 1, y, z)] === AIR) {
    return true
  }

  // Check Z neighbors
  if (z === 0) {
    // Back edge - check neighbor chunk or assume exposed
    if (!neighbors.negZ || neighbors.negZ[localToIndex(x, y, CHUNK_SIZE_Z - 1)] === AIR) {
      return true
    }
  } else if (blocks[localToIndex(x, y, z - 1)] === AIR) {
    return true
  }

  if (z === CHUNK_SIZE_Z - 1) {
    // Front edge - check neighbor chunk or assume exposed
    if (!neighbors.posZ || neighbors.posZ[localToIndex(x, y, 0)] === AIR) {
      return true
    }
  } else if (blocks[localToIndex(x, y, z + 1)] === AIR) {
    return true
  }

  return false
}

interface NeighborData {
  posX: Uint16Array | null
  negX: Uint16Array | null
  posZ: Uint16Array | null
  negZ: Uint16Array | null
}

export interface ChunkMeshRequest {
  type: 'mesh'
  chunkX: number
  chunkZ: number
  blocks: Uint16Array
  neighbors: NeighborData
}

export interface ChunkMeshResponse {
  type: 'mesh-result'
  chunkX: number
  chunkZ: number
  // Array of [blockId, positions] pairs (Maps don't serialize via postMessage)
  visibleBlocks: Array<[number, Float32Array]>
}

/**
 * Process a chunk and find all visible blocks.
 */
function processChunk(request: ChunkMeshRequest): ChunkMeshResponse {
  const { chunkX, chunkZ, blocks, neighbors } = request

  // Collect visible blocks by type
  const blockPositions = new Map<number, number[]>()

  // World offset for this chunk
  const worldOffsetX = chunkX * CHUNK_SIZE_X
  const worldOffsetZ = chunkZ * CHUNK_SIZE_Z

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const blockId = blocks[localToIndex(x, y, z)]

        if (blockId === AIR) continue

        if (!hasExposedFace(blocks, x, y, z, neighbors)) continue

        // Add to visible blocks
        let positions = blockPositions.get(blockId)
        if (!positions) {
          positions = []
          blockPositions.set(blockId, positions)
        }

        // Store world coordinates
        positions.push(worldOffsetX + x, y, worldOffsetZ + z)
      }
    }
  }

  // Convert to Float32Arrays for efficient transfer
  // Use array of pairs since Maps don't serialize via postMessage
  const visibleBlocks: Array<[number, Float32Array]> = []
  for (const [blockId, positions] of blockPositions) {
    visibleBlocks.push([blockId, new Float32Array(positions)])
  }

  return {
    type: 'mesh-result',
    chunkX,
    chunkZ,
    visibleBlocks,
  }
}

// Worker message handler
self.onmessage = (event: MessageEvent<ChunkMeshRequest>) => {
  const result = processChunk(event.data)

  // Collect transferable arrays
  const transfer: Transferable[] = []
  for (const [, positions] of result.visibleBlocks) {
    transfer.push(positions.buffer)
  }

  self.postMessage(result, { transfer })
}
