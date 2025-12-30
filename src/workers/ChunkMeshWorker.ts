/**
 * Web Worker for building merged chunk mesh geometry.
 * Offloads expensive mesh building from the main thread.
 */

// Chunk constants (duplicated to avoid import issues in worker)
const CHUNK_SIZE_X = 32
const CHUNK_SIZE_Z = 32
const CHUNK_HEIGHT = 1024

// Block ID for air (invisible)
const AIR = 0

// Face directions
enum Face {
  TOP = 0,    // +Y
  BOTTOM = 1, // -Y
  NORTH = 2,  // -Z
  SOUTH = 3,  // +Z
  EAST = 4,   // +X
  WEST = 5,   // -X
}

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
 * Check if a specific face should be rendered.
 * Returns true if the adjacent block is not opaque.
 */
function shouldRenderFace(
  blocks: Uint16Array,
  x: number,
  y: number,
  z: number,
  face: Face,
  neighbors: NeighborData,
  opaqueSet: Set<number>
): boolean {
  switch (face) {
    case Face.TOP:
      if (y === CHUNK_HEIGHT - 1) return true
      return !isOpaque(blocks[localToIndex(x, y + 1, z)], opaqueSet)
    
    case Face.BOTTOM:
      if (y === 0) return true
      return !isOpaque(blocks[localToIndex(x, y - 1, z)], opaqueSet)
    
    case Face.EAST:
      if (x === CHUNK_SIZE_X - 1) {
        return !neighbors.posX || !isOpaque(neighbors.posX[localToIndex(0, y, z)], opaqueSet)
      }
      return !isOpaque(blocks[localToIndex(x + 1, y, z)], opaqueSet)
    
    case Face.WEST:
      if (x === 0) {
        return !neighbors.negX || !isOpaque(neighbors.negX[localToIndex(CHUNK_SIZE_X - 1, y, z)], opaqueSet)
      }
      return !isOpaque(blocks[localToIndex(x - 1, y, z)], opaqueSet)
    
    case Face.SOUTH:
      if (z === CHUNK_SIZE_Z - 1) {
        return !neighbors.posZ || !isOpaque(neighbors.posZ[localToIndex(x, y, 0)], opaqueSet)
      }
      return !isOpaque(blocks[localToIndex(x, y, z + 1)], opaqueSet)
    
    case Face.NORTH:
      if (z === 0) {
        return !neighbors.negZ || !isOpaque(neighbors.negZ[localToIndex(x, y, CHUNK_SIZE_Z - 1)], opaqueSet)
      }
      return !isOpaque(blocks[localToIndex(x, y, z - 1)], opaqueSet)
  }
  return false
}

/**
 * Add face vertices to the geometry arrays.
 * Each face is 1 quad = 4 vertices, indexed as 2 triangles.
 */
function addFaceGeometry(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
  x: number,
  y: number,
  z: number,
  face: Face,
  blockId: number
): void {
  const vertexOffset = positions.length / 3
  
  // Cube vertices offset by block position
  const x0 = x, x1 = x + 1
  const y0 = y, y1 = y + 1
  const z0 = z, z1 = z + 1
  
  // Simple UV coordinates (0-1 range)
  const u0 = 0, u1 = 1
  const v0 = 0, v1 = 1
  
  // Generate color based on block ID
  // Using recognizable colors for common blocks:
  // AIR=0, STONE=1, DIRT=2, GRASS=3, OAK_LOG=4, OAK_LEAVES=5
  let r = 0.8, g = 0.8, b = 0.8 // default gray
  
  switch (blockId) {
    case 1: // STONE
      r = 0.5; g = 0.5; b = 0.5
      break
    case 2: // DIRT
      r = 0.6; g = 0.4; b = 0.2
      break
    case 3: // GRASS
      r = 0.4; g = 0.8; b = 0.3
      break
    case 4: // OAK_LOG
      r = 0.4; g = 0.3; b = 0.2
      break
    case 5: // OAK_LEAVES
      r = 0.2; g = 0.6; b = 0.2
      break
    default:
      // For any other blocks, generate color using prime number hashing
      // Prime numbers (73, 151, 233) ensure good color distribution
      r = ((blockId * 73) % 256) / 255
      g = ((blockId * 151) % 256) / 255
      b = ((blockId * 233) % 256) / 255
  }
  
  // Face shading multipliers for depth perception
  const TOP_FACE_SHADE = 1.0
  const BOTTOM_FACE_SHADE = 0.5
  const SIDE_FACE_SHADE_A = 0.9  // East/West
  const SIDE_FACE_SHADE_B = 0.8  // North/South
  
  switch (face) {
    case Face.TOP: // +Y
      positions.push(
        x0, y1, z0,  x1, y1, z0,  x1, y1, z1,  x0, y1, z1
      )
      normals.push(
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0
      )
      uvs.push(
        u0, v0,  u1, v0,  u1, v1,  u0, v1
      )
      colors.push(
        r * TOP_FACE_SHADE, g * TOP_FACE_SHADE, b * TOP_FACE_SHADE,
        r * TOP_FACE_SHADE, g * TOP_FACE_SHADE, b * TOP_FACE_SHADE,
        r * TOP_FACE_SHADE, g * TOP_FACE_SHADE, b * TOP_FACE_SHADE,
        r * TOP_FACE_SHADE, g * TOP_FACE_SHADE, b * TOP_FACE_SHADE
      )
      break
    
    case Face.BOTTOM: // -Y
      positions.push(
        x0, y0, z1,  x1, y0, z1,  x1, y0, z0,  x0, y0, z0
      )
      normals.push(
        0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0
      )
      uvs.push(
        u0, v0,  u1, v0,  u1, v1,  u0, v1
      )
      colors.push(
        r * BOTTOM_FACE_SHADE, g * BOTTOM_FACE_SHADE, b * BOTTOM_FACE_SHADE,
        r * BOTTOM_FACE_SHADE, g * BOTTOM_FACE_SHADE, b * BOTTOM_FACE_SHADE,
        r * BOTTOM_FACE_SHADE, g * BOTTOM_FACE_SHADE, b * BOTTOM_FACE_SHADE,
        r * BOTTOM_FACE_SHADE, g * BOTTOM_FACE_SHADE, b * BOTTOM_FACE_SHADE
      )
      break
    
    case Face.EAST: // +X
      positions.push(
        x1, y0, z0,  x1, y1, z0,  x1, y1, z1,  x1, y0, z1
      )
      normals.push(
        1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0
      )
      uvs.push(
        u0, v0,  u0, v1,  u1, v1,  u1, v0
      )
      colors.push(
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A,
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A,
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A,
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A
      )
      break
    
    case Face.WEST: // -X
      positions.push(
        x0, y0, z1,  x0, y1, z1,  x0, y1, z0,  x0, y0, z0
      )
      normals.push(
        -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0
      )
      uvs.push(
        u0, v0,  u0, v1,  u1, v1,  u1, v0
      )
      colors.push(
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A,
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A,
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A,
        r * SIDE_FACE_SHADE_A, g * SIDE_FACE_SHADE_A, b * SIDE_FACE_SHADE_A
      )
      break
    
    case Face.SOUTH: // +Z
      positions.push(
        x0, y0, z1,  x1, y0, z1,  x1, y1, z1,  x0, y1, z1
      )
      normals.push(
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1
      )
      uvs.push(
        u0, v0,  u1, v0,  u1, v1,  u0, v1
      )
      colors.push(
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B,
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B,
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B,
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B
      )
      break
    
    case Face.NORTH: // -Z
      positions.push(
        x1, y0, z0,  x0, y0, z0,  x0, y1, z0,  x1, y1, z0
      )
      normals.push(
        0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1
      )
      uvs.push(
        u0, v0,  u1, v0,  u1, v1,  u0, v1
      )
      colors.push(
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B,
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B,
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B,
        r * SIDE_FACE_SHADE_B, g * SIDE_FACE_SHADE_B, b * SIDE_FACE_SHADE_B
      )
      break
  }
  
  // Add indices for 2 triangles (quad)
  indices.push(
    vertexOffset, vertexOffset + 1, vertexOffset + 2,
    vertexOffset, vertexOffset + 2, vertexOffset + 3
  )
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
  // Set of block IDs that are opaque (blocks visibility)
  opaqueBlockIds: number[]
}

export interface ChunkMeshResponse {
  type: 'mesh-result'
  chunkX: number
  chunkZ: number
  // Merged geometry data for single mesh
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  colors: Float32Array
  indices: Uint32Array
}

/**
 * Process a chunk and build merged mesh geometry.
 */
function processChunk(request: ChunkMeshRequest): ChunkMeshResponse {
  const { chunkX, chunkZ, blocks, neighbors, opaqueBlockIds } = request

  // Create set of opaque block IDs for fast lookup
  const opaqueSet = new Set(opaqueBlockIds)

  // Geometry arrays
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  // World offset for this chunk
  const worldOffsetX = chunkX * CHUNK_SIZE_X
  const worldOffsetZ = chunkZ * CHUNK_SIZE_Z

  // Iterate through all blocks and add visible faces
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const blockId = blocks[localToIndex(x, y, z)]

        if (blockId === AIR) continue

        // World coordinates
        const wx = worldOffsetX + x
        const wz = worldOffsetZ + z

        // Check each face and add geometry if visible
        for (let face = 0; face < 6; face++) {
          if (shouldRenderFace(blocks, x, y, z, face, neighbors, opaqueSet)) {
            addFaceGeometry(positions, normals, uvs, colors, indices, wx, y, wz, face, blockId)
          }
        }
      }
    }
  }

  return {
    type: 'mesh-result',
    chunkX,
    chunkZ,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  }
}

// Worker message handler
self.onmessage = (event: MessageEvent<ChunkMeshRequest>) => {
  const result = processChunk(event.data)

  // Transfer geometry arrays for efficiency
  self.postMessage(result, { 
    transfer: [
      result.positions.buffer,
      result.normals.buffer,
      result.uvs.buffer,
      result.colors.buffer,
      result.indices.buffer,
    ]
  })
}
