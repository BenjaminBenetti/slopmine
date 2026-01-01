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
 * Check if a block is opaque (blocks visibility).
 */
function isOpaque(blockId: number, opaqueSet: Set<number>): boolean {
  return opaqueSet.has(blockId)
}

/**
 * Check if a block has any exposed faces.
 * A face is exposed if the adjacent block is not opaque.
 * For edge blocks without neighbor data, assume exposed.
 */
function hasExposedFace(
  blocks: Uint16Array,
  x: number,
  y: number,
  z: number,
  neighbors: NeighborData,
  opaqueSet: Set<number>
): boolean {
  // Check Y neighbors (within chunk)
  if (y === 0 || y === CHUNK_HEIGHT - 1) return true
  if (!isOpaque(blocks[localToIndex(x, y + 1, z)], opaqueSet)) return true
  if (!isOpaque(blocks[localToIndex(x, y - 1, z)], opaqueSet)) return true

  // Check X neighbors
  if (x === 0) {
    // Left edge - check neighbor chunk or assume exposed
    if (!neighbors.negX || !isOpaque(neighbors.negX[localToIndex(CHUNK_SIZE_X - 1, y, z)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToIndex(x - 1, y, z)], opaqueSet)) {
    return true
  }

  if (x === CHUNK_SIZE_X - 1) {
    // Right edge - check neighbor chunk or assume exposed
    if (!neighbors.posX || !isOpaque(neighbors.posX[localToIndex(0, y, z)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToIndex(x + 1, y, z)], opaqueSet)) {
    return true
  }

  // Check Z neighbors
  if (z === 0) {
    // Back edge - check neighbor chunk or assume exposed
    if (!neighbors.negZ || !isOpaque(neighbors.negZ[localToIndex(x, y, CHUNK_SIZE_Z - 1)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToIndex(x, y, z - 1)], opaqueSet)) {
    return true
  }

  if (z === CHUNK_SIZE_Z - 1) {
    // Front edge - check neighbor chunk or assume exposed
    if (!neighbors.posZ || !isOpaque(neighbors.posZ[localToIndex(x, y, 0)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToIndex(x, y, z + 1)], opaqueSet)) {
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
  lightData: Uint8Array
  neighbors: NeighborData
  // Set of block IDs that are opaque (blocks visibility)
  opaqueBlockIds: number[]
}

export interface ChunkMeshResponse {
  type: 'mesh-result'
  chunkX: number
  chunkZ: number
  // Array of [blockId, positions] pairs (Maps don't serialize via postMessage)
  visibleBlocks: Array<[number, Float32Array]>
  // Array of [blockId, lightLevels] pairs matching visibleBlocks
  lightLevels: Array<[number, Uint8Array]>
}

/**
 * Get combined light level from light data (max of skylight and blocklight).
 */
function getLightLevelAt(lightData: Uint8Array, x: number, y: number, z: number): number {
  if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z || y < 0 || y >= CHUNK_HEIGHT) {
    return 15 // Out of bounds = full light
  }
  const idx = localToIndex(x, y, z)
  const data = lightData[idx]
  const sky = (data >> 4) & 0xf
  const block = data & 0xf
  return Math.max(sky, block)
}

/**
 * Get the light level for rendering a block by checking adjacent air blocks.
 * Solid blocks store 0 light internally, so we need to look at neighbors.
 */
function getBlockRenderLight(lightData: Uint8Array, x: number, y: number, z: number): number {
  let maxLight = 0

  // Check all 6 neighbors and use the max light
  // Only sample from in-bounds neighbors (except +Y which defaults to sky)

  // +X (only if in bounds)
  if (x + 1 < CHUNK_SIZE_X) {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x + 1, y, z))
  }

  // -X (only if in bounds)
  if (x - 1 >= 0) {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x - 1, y, z))
  }

  // +Y (above chunk height = full sky)
  if (y + 1 >= CHUNK_HEIGHT) {
    maxLight = Math.max(maxLight, 15)
  } else {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y + 1, z))
  }

  // -Y (only if in bounds)
  if (y - 1 >= 0) {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y - 1, z))
  }

  // +Z (only if in bounds)
  if (z + 1 < CHUNK_SIZE_Z) {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y, z + 1))
  }

  // -Z (only if in bounds)
  if (z - 1 >= 0) {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y, z - 1))
  }

  return maxLight
}

/**
 * Process a chunk and find all visible blocks.
 */
function processChunk(request: ChunkMeshRequest): ChunkMeshResponse {
  const { chunkX, chunkZ, blocks, lightData, neighbors, opaqueBlockIds } = request

  // Create set of opaque block IDs for fast lookup
  const opaqueSet = new Set(opaqueBlockIds)

  // Collect visible blocks by type
  const blockPositions = new Map<number, number[]>()
  const blockLights = new Map<number, number[]>()

  // World offset for this chunk
  const worldOffsetX = chunkX * CHUNK_SIZE_X
  const worldOffsetZ = chunkZ * CHUNK_SIZE_Z

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const blockId = blocks[localToIndex(x, y, z)]

        if (blockId === AIR) continue

        if (!hasExposedFace(blocks, x, y, z, neighbors, opaqueSet)) continue

        // Add to visible blocks
        let positions = blockPositions.get(blockId)
        if (!positions) {
          positions = []
          blockPositions.set(blockId, positions)
        }

        // Store world coordinates
        positions.push(worldOffsetX + x, y, worldOffsetZ + z)

        // Collect light level for this block (use max light from neighboring air)
        let lights = blockLights.get(blockId)
        if (!lights) {
          lights = []
          blockLights.set(blockId, lights)
        }
        lights.push(getBlockRenderLight(lightData, x, y, z))
      }
    }
  }

  // Convert to Float32Arrays for efficient transfer
  // Use array of pairs since Maps don't serialize via postMessage
  const visibleBlocks: Array<[number, Float32Array]> = []
  const lightLevels: Array<[number, Uint8Array]> = []

  for (const [blockId, positions] of blockPositions) {
    visibleBlocks.push([blockId, new Float32Array(positions)])
    const lights = blockLights.get(blockId) ?? []
    lightLevels.push([blockId, new Uint8Array(lights)])
  }

  return {
    type: 'mesh-result',
    chunkX,
    chunkZ,
    visibleBlocks,
    lightLevels,
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
  for (const [, lights] of result.lightLevels) {
    transfer.push(lights.buffer)
  }

  self.postMessage(result, { transfer })
}
