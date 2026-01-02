/**
 * Web Worker for calculating visible blocks in a chunk or sub-chunk.
 * Offloads expensive visibility calculations from the main thread.
 */

import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'

// Block ID for air (invisible)
const AIR = 0

/**
 * Calculate array index for local coordinates (full chunk).
 * Memory layout: Y-major (y * SIZE_X * SIZE_Z + z * SIZE_X + x)
 */
function localToIndex(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
}

/**
 * Calculate array index for sub-chunk local coordinates (64-height).
 */
function localToSubChunkIndex(x: number, y: number, z: number): number {
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

interface NeighborLightData {
  posX: Uint8Array | null
  negX: Uint8Array | null
  posZ: Uint8Array | null
  negZ: Uint8Array | null
}

// Extended neighbor data for sub-chunks (includes vertical neighbors)
interface SubChunkNeighborData {
  posX: Uint16Array | null  // Full 32x32x64 from +X neighbor
  negX: Uint16Array | null
  posZ: Uint16Array | null
  negZ: Uint16Array | null
  posY: Uint16Array | null  // 32x32 boundary layer from sub-chunk above (their y=0)
  negY: Uint16Array | null  // 32x32 boundary layer from sub-chunk below (their y=63)
}

interface SubChunkNeighborLightData {
  posX: Uint8Array | null
  negX: Uint8Array | null
  posZ: Uint8Array | null
  negZ: Uint8Array | null
  posY: Uint8Array | null  // 32x32 boundary layer
  negY: Uint8Array | null
}

export interface ChunkMeshRequest {
  type: 'mesh'
  chunkX: number
  chunkZ: number
  blocks: Uint16Array
  lightData: Uint8Array
  neighbors: NeighborData
  neighborLights: NeighborLightData
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

// Sub-chunk mesh request (64-height slice with 6 neighbors)
export interface SubChunkMeshRequest {
  type: 'subchunk-mesh'
  chunkX: number
  chunkZ: number
  subY: number  // 0-15
  minWorldY: number  // subY * 64
  blocks: Uint16Array  // 65,536 elements (32x32x64)
  lightData: Uint8Array
  neighbors: SubChunkNeighborData
  neighborLights: SubChunkNeighborLightData
  opaqueBlockIds: number[]
}

export interface SubChunkMeshResponse {
  type: 'subchunk-mesh-result'
  chunkX: number
  chunkZ: number
  subY: number
  visibleBlocks: Array<[number, Float32Array]>
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
 * Samples from neighbor chunk light data at chunk boundaries.
 */
function getBlockRenderLight(
  lightData: Uint8Array,
  neighborLights: NeighborLightData,
  x: number,
  y: number,
  z: number
): number {
  let maxLight = 0

  // Check all 6 neighbors and use the max light

  // +X
  if (x + 1 >= CHUNK_SIZE_X) {
    // Sample from neighbor chunk at +X (their x=0 edge)
    if (neighborLights.posX) {
      maxLight = Math.max(maxLight, getLightLevelAt(neighborLights.posX, 0, y, z))
    }
  } else {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x + 1, y, z))
  }

  // -X
  if (x - 1 < 0) {
    // Sample from neighbor chunk at -X (their x=CHUNK_SIZE_X-1 edge)
    if (neighborLights.negX) {
      maxLight = Math.max(maxLight, getLightLevelAt(neighborLights.negX, CHUNK_SIZE_X - 1, y, z))
    }
  } else {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x - 1, y, z))
  }

  // +Y (above chunk height = full sky)
  if (y + 1 >= CHUNK_HEIGHT) {
    maxLight = Math.max(maxLight, 15)
  } else {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y + 1, z))
  }

  // -Y (only if in bounds, no vertical chunk neighbors)
  if (y - 1 >= 0) {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y - 1, z))
  }

  // +Z
  if (z + 1 >= CHUNK_SIZE_Z) {
    // Sample from neighbor chunk at +Z (their z=0 edge)
    if (neighborLights.posZ) {
      maxLight = Math.max(maxLight, getLightLevelAt(neighborLights.posZ, x, y, 0))
    }
  } else {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y, z + 1))
  }

  // -Z
  if (z - 1 < 0) {
    // Sample from neighbor chunk at -Z (their z=CHUNK_SIZE_Z-1 edge)
    if (neighborLights.negZ) {
      maxLight = Math.max(maxLight, getLightLevelAt(neighborLights.negZ, x, y, CHUNK_SIZE_Z - 1))
    }
  } else {
    maxLight = Math.max(maxLight, getLightLevelAt(lightData, x, y, z - 1))
  }

  return maxLight
}

/**
 * Process a chunk and find all visible blocks.
 */
function processChunk(request: ChunkMeshRequest): ChunkMeshResponse {
  const { chunkX, chunkZ, blocks, lightData, neighbors, neighborLights, opaqueBlockIds } = request

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
        lights.push(getBlockRenderLight(lightData, neighborLights, x, y, z))
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

/**
 * Check if a block in a sub-chunk has any exposed faces.
 * Handles 6 neighbors including vertical sub-chunk boundaries.
 */
function hasExposedFaceSubChunk(
  blocks: Uint16Array,
  x: number,
  y: number,  // Local Y within sub-chunk (0-63)
  z: number,
  neighbors: SubChunkNeighborData,
  opaqueSet: Set<number>
): boolean {
  // Check Y neighbors
  if (y === 0) {
    // Bottom edge of sub-chunk - check negY neighbor or assume exposed
    if (!neighbors.negY) return true
    // negY contains the y=63 layer of the sub-chunk below (32x32 = 1024 elements)
    const layerIndex = z * CHUNK_SIZE_X + x
    if (!isOpaque(neighbors.negY[layerIndex], opaqueSet)) return true
  } else if (!isOpaque(blocks[localToSubChunkIndex(x, y - 1, z)], opaqueSet)) {
    return true
  }

  if (y === SUB_CHUNK_HEIGHT - 1) {
    // Top edge of sub-chunk - check posY neighbor or assume exposed
    if (!neighbors.posY) return true
    // posY contains the y=0 layer of the sub-chunk above (32x32 = 1024 elements)
    const layerIndex = z * CHUNK_SIZE_X + x
    if (!isOpaque(neighbors.posY[layerIndex], opaqueSet)) return true
  } else if (!isOpaque(blocks[localToSubChunkIndex(x, y + 1, z)], opaqueSet)) {
    return true
  }

  // Check X neighbors
  if (x === 0) {
    if (!neighbors.negX || !isOpaque(neighbors.negX[localToSubChunkIndex(CHUNK_SIZE_X - 1, y, z)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToSubChunkIndex(x - 1, y, z)], opaqueSet)) {
    return true
  }

  if (x === CHUNK_SIZE_X - 1) {
    if (!neighbors.posX || !isOpaque(neighbors.posX[localToSubChunkIndex(0, y, z)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToSubChunkIndex(x + 1, y, z)], opaqueSet)) {
    return true
  }

  // Check Z neighbors
  if (z === 0) {
    if (!neighbors.negZ || !isOpaque(neighbors.negZ[localToSubChunkIndex(x, y, CHUNK_SIZE_Z - 1)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToSubChunkIndex(x, y, z - 1)], opaqueSet)) {
    return true
  }

  if (z === CHUNK_SIZE_Z - 1) {
    if (!neighbors.posZ || !isOpaque(neighbors.posZ[localToSubChunkIndex(x, y, 0)], opaqueSet)) {
      return true
    }
  } else if (!isOpaque(blocks[localToSubChunkIndex(x, y, z + 1)], opaqueSet)) {
    return true
  }

  return false
}

/**
 * Get light level for sub-chunk (with 6-neighbor support).
 */
function getSubChunkLightLevelAt(
  lightData: Uint8Array,
  x: number,
  y: number,
  z: number
): number {
  if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z || y < 0 || y >= SUB_CHUNK_HEIGHT) {
    return 15 // Out of bounds = full light
  }
  const idx = localToSubChunkIndex(x, y, z)
  const data = lightData[idx]
  const sky = (data >> 4) & 0xf
  const block = data & 0xf
  return Math.max(sky, block)
}

/**
 * Get light for rendering a block in a sub-chunk.
 */
function getSubChunkBlockRenderLight(
  lightData: Uint8Array,
  neighborLights: SubChunkNeighborLightData,
  x: number,
  y: number,
  z: number
): number {
  let maxLight = 0

  // +X
  if (x + 1 >= CHUNK_SIZE_X) {
    if (neighborLights.posX) {
      maxLight = Math.max(maxLight, getSubChunkLightLevelAt(neighborLights.posX, 0, y, z))
    }
  } else {
    maxLight = Math.max(maxLight, getSubChunkLightLevelAt(lightData, x + 1, y, z))
  }

  // -X
  if (x - 1 < 0) {
    if (neighborLights.negX) {
      maxLight = Math.max(maxLight, getSubChunkLightLevelAt(neighborLights.negX, CHUNK_SIZE_X - 1, y, z))
    }
  } else {
    maxLight = Math.max(maxLight, getSubChunkLightLevelAt(lightData, x - 1, y, z))
  }

  // +Y (check vertical neighbor)
  if (y + 1 >= SUB_CHUNK_HEIGHT) {
    if (neighborLights.posY) {
      // posY is a 32x32 layer (y=0 of sub-chunk above)
      const layerIndex = z * CHUNK_SIZE_X + x
      const data = neighborLights.posY[layerIndex]
      const sky = (data >> 4) & 0xf
      const block = data & 0xf
      maxLight = Math.max(maxLight, Math.max(sky, block))
    } else {
      maxLight = Math.max(maxLight, 15) // No neighbor above = sky
    }
  } else {
    maxLight = Math.max(maxLight, getSubChunkLightLevelAt(lightData, x, y + 1, z))
  }

  // -Y (check vertical neighbor)
  if (y - 1 < 0) {
    if (neighborLights.negY) {
      const layerIndex = z * CHUNK_SIZE_X + x
      const data = neighborLights.negY[layerIndex]
      const sky = (data >> 4) & 0xf
      const block = data & 0xf
      maxLight = Math.max(maxLight, Math.max(sky, block))
    }
  } else {
    maxLight = Math.max(maxLight, getSubChunkLightLevelAt(lightData, x, y - 1, z))
  }

  // +Z
  if (z + 1 >= CHUNK_SIZE_Z) {
    if (neighborLights.posZ) {
      maxLight = Math.max(maxLight, getSubChunkLightLevelAt(neighborLights.posZ, x, y, 0))
    }
  } else {
    maxLight = Math.max(maxLight, getSubChunkLightLevelAt(lightData, x, y, z + 1))
  }

  // -Z
  if (z - 1 < 0) {
    if (neighborLights.negZ) {
      maxLight = Math.max(maxLight, getSubChunkLightLevelAt(neighborLights.negZ, x, y, CHUNK_SIZE_Z - 1))
    }
  } else {
    maxLight = Math.max(maxLight, getSubChunkLightLevelAt(lightData, x, y, z - 1))
  }

  return maxLight
}

/**
 * Process a sub-chunk and find all visible blocks.
 */
function processSubChunk(request: SubChunkMeshRequest): SubChunkMeshResponse {
  const { chunkX, chunkZ, subY, minWorldY, blocks, lightData, neighbors, neighborLights, opaqueBlockIds } = request

  const opaqueSet = new Set(opaqueBlockIds)

  const blockPositions = new Map<number, number[]>()
  const blockLights = new Map<number, number[]>()

  // World offset for this sub-chunk
  const worldOffsetX = chunkX * CHUNK_SIZE_X
  const worldOffsetZ = chunkZ * CHUNK_SIZE_Z

  for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const blockId = blocks[localToSubChunkIndex(x, y, z)]

        if (blockId === AIR) continue

        if (!hasExposedFaceSubChunk(blocks, x, y, z, neighbors, opaqueSet)) continue

        // Add to visible blocks
        let positions = blockPositions.get(blockId)
        if (!positions) {
          positions = []
          blockPositions.set(blockId, positions)
        }

        // Store world coordinates (convert local Y to world Y)
        const worldY = minWorldY + y
        positions.push(worldOffsetX + x, worldY, worldOffsetZ + z)

        // Collect light level
        let lights = blockLights.get(blockId)
        if (!lights) {
          lights = []
          blockLights.set(blockId, lights)
        }
        lights.push(getSubChunkBlockRenderLight(lightData, neighborLights, x, y, z))
      }
    }
  }

  // Convert to Float32Arrays
  const visibleBlocks: Array<[number, Float32Array]> = []
  const lightLevels: Array<[number, Uint8Array]> = []

  for (const [blockId, positions] of blockPositions) {
    visibleBlocks.push([blockId, new Float32Array(positions)])
    const lights = blockLights.get(blockId) ?? []
    lightLevels.push([blockId, new Uint8Array(lights)])
  }

  return {
    type: 'subchunk-mesh-result',
    chunkX,
    chunkZ,
    subY,
    visibleBlocks,
    lightLevels,
  }
}

// Worker message handler
self.onmessage = (event: MessageEvent<ChunkMeshRequest | SubChunkMeshRequest>) => {
  const data = event.data

  let result: ChunkMeshResponse | SubChunkMeshResponse
  if (data.type === 'subchunk-mesh') {
    result = processSubChunk(data)
  } else {
    result = processChunk(data)
  }

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
