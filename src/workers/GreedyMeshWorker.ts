/**
 * Web Worker for greedy mesh generation.
 * Merges adjacent faces of the same type into larger quads for efficient rendering.
 */

import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import { deserializeFaceTextureMap, getCachedFaceTextureMap, NON_GREEDY_BLOCK_IDS } from '../world/blocks/FaceTextureRegistry.ts'

// Block ID for air (invisible)
const AIR = 0

// Face directions matching BlockFace enum
const FACE_TOP = 0
const FACE_BOTTOM = 1
const FACE_NORTH = 2
const FACE_SOUTH = 3
const FACE_EAST = 4
const FACE_WEST = 5

// Face texture map is populated on first request from main thread
let faceTextureMap: Map<number, number> | null = null

// Normals for each face direction (used for vertex data)
const FACE_NORMALS: [number, number, number][] = [
  [0, 1, 0],   // TOP (+Y)
  [0, -1, 0],  // BOTTOM (-Y)
  [0, 0, -1],  // NORTH (-Z)
  [0, 0, 1],   // SOUTH (+Z)
  [1, 0, 0],   // EAST (+X)
  [-1, 0, 0],  // WEST (-X)
]

// Pre-allocated structures for reuse
const reusableOpaqueSet = new Set<number>()

/**
 * Face mask entry for 2D greedy merge.
 * Encoded as: (textureId << 20) | (lightLevel << 16) | blockId
 * 0 means no face at this position.
 */
type FaceMaskValue = number

/**
 * Encode face data into a single number for comparison.
 */
function encodeFaceData(textureId: number, lightLevel: number, blockId: number): FaceMaskValue {
  return ((textureId & 0xFFF) << 20) | ((lightLevel & 0xF) << 16) | (blockId & 0xFFFF)
}

/**
 * Decode block ID from face data.
 */
function decodeBlockId(faceData: FaceMaskValue): number {
  return faceData & 0xFFFF
}

/**
 * Decode light level from face data.
 */
function decodeLightLevel(faceData: FaceMaskValue): number {
  return (faceData >> 16) & 0xF
}

/**
 * Decode texture ID from face data.
 */
function decodeTextureId(faceData: FaceMaskValue): number {
  return (faceData >> 20) & 0xFFF
}

/**
 * Calculate array index for sub-chunk local coordinates.
 * Memory layout: Y-major (y * SIZE_X * SIZE_Z + z * SIZE_X + x)
 */
function localToIndex(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
}

// Neighbor data interfaces (same as ChunkMeshWorker)
interface SubChunkNeighborData {
  posX: Uint16Array | null
  negX: Uint16Array | null
  posZ: Uint16Array | null
  negZ: Uint16Array | null
  posY: Uint16Array | null  // 32x32 boundary layer
  negY: Uint16Array | null
}

interface SubChunkNeighborLightData {
  posX: Uint8Array | null
  negX: Uint8Array | null
  posZ: Uint8Array | null
  negZ: Uint8Array | null
  posY: Uint8Array | null
  negY: Uint8Array | null
}

export interface GreedyMeshRequest {
  type: 'greedy-mesh'
  chunkX: number
  chunkZ: number
  subY: number
  minWorldY: number
  blocks: Uint16Array
  lightData: Uint8Array
  neighbors: SubChunkNeighborData
  neighborLights: SubChunkNeighborLightData
  opaqueBlockIds: number[]
  // Face texture map entries: [[key, textureId], ...]
  // Sent once on first request, then cached in worker
  faceTextureMapEntries?: Array<[number, number]>
  // Non-greedy block IDs (torch, etc.)
  nonGreedyBlockIds?: number[]
}

export interface MeshGroup {
  textureId: number
  blockId: number
  faceDirection: number
  vertices: Float32Array  // 11 floats per vertex: x,y,z,u,v,nx,ny,nz,r,g,b
  indices: Uint16Array    // 6 indices per quad
}

export interface GreedyMeshResponse {
  type: 'greedy-mesh-result'
  chunkX: number
  chunkZ: number
  subY: number
  opaqueGroups: MeshGroup[]
  transparentGroups: MeshGroup[]
  // Non-greedy blocks (torch, etc.) - positions only, like old worker
  nonGreedyBlocks: Array<[number, Float32Array]>
  nonGreedyLights: Array<[number, Uint8Array]>
}

export interface GreedyMeshError {
  type: 'greedy-mesh-error'
  chunkX: number
  chunkZ: number
  subY: number
  error: string
}

/**
 * Check if block at position is opaque.
 */
function isOpaque(blockId: number, opaqueSet: Set<number>): boolean {
  return opaqueSet.has(blockId)
}

/**
 * Get block ID at position, handling neighbor chunks.
 */
function getBlockAt(
  blocks: Uint16Array,
  neighbors: SubChunkNeighborData,
  x: number,
  y: number,
  z: number
): number {
  // Within current sub-chunk
  if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y >= 0 && y < SUB_CHUNK_HEIGHT) {
    return blocks[localToIndex(x, y, z)]
  }

  // Vertical neighbors (boundary layers)
  if (y < 0) {
    if (!neighbors.negY) return AIR
    return neighbors.negY[z * CHUNK_SIZE_X + x]
  }
  if (y >= SUB_CHUNK_HEIGHT) {
    if (!neighbors.posY) return AIR
    return neighbors.posY[z * CHUNK_SIZE_X + x]
  }

  // Horizontal neighbors
  if (x < 0) {
    if (!neighbors.negX) return AIR
    return neighbors.negX[localToIndex(CHUNK_SIZE_X - 1, y, z)]
  }
  if (x >= CHUNK_SIZE_X) {
    if (!neighbors.posX) return AIR
    return neighbors.posX[localToIndex(0, y, z)]
  }
  if (z < 0) {
    if (!neighbors.negZ) return AIR
    return neighbors.negZ[localToIndex(x, y, CHUNK_SIZE_Z - 1)]
  }
  if (z >= CHUNK_SIZE_Z) {
    if (!neighbors.posZ) return AIR
    return neighbors.posZ[localToIndex(x, y, 0)]
  }

  return AIR
}

/**
 * Get light level at position (max of skylight and blocklight).
 */
function getLightAt(
  lightData: Uint8Array,
  neighborLights: SubChunkNeighborLightData,
  x: number,
  y: number,
  z: number
): number {
  let data: number

  // Within current sub-chunk
  if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y >= 0 && y < SUB_CHUNK_HEIGHT) {
    data = lightData[localToIndex(x, y, z)]
    const sky = (data >> 4) & 0xF
    const block = data & 0xF
    return Math.max(sky, block)
  }

  // Vertical neighbors
  if (y < 0) {
    if (!neighborLights.negY) return 0
    data = neighborLights.negY[z * CHUNK_SIZE_X + x]
    const sky = (data >> 4) & 0xF
    const block = data & 0xF
    return Math.max(sky, block)
  }
  if (y >= SUB_CHUNK_HEIGHT) {
    if (!neighborLights.posY) return 15 // Above = sky
    data = neighborLights.posY[z * CHUNK_SIZE_X + x]
    const sky = (data >> 4) & 0xF
    const block = data & 0xF
    return Math.max(sky, block)
  }

  // Horizontal neighbors
  if (x < 0) {
    if (!neighborLights.negX) return 15
    data = neighborLights.negX[localToIndex(CHUNK_SIZE_X - 1, y, z)]
  } else if (x >= CHUNK_SIZE_X) {
    if (!neighborLights.posX) return 15
    data = neighborLights.posX[localToIndex(0, y, z)]
  } else if (z < 0) {
    if (!neighborLights.negZ) return 15
    data = neighborLights.negZ[localToIndex(x, y, CHUNK_SIZE_Z - 1)]
  } else if (z >= CHUNK_SIZE_Z) {
    if (!neighborLights.posZ) return 15
    data = neighborLights.posZ[localToIndex(x, y, 0)]
  } else {
    return 15
  }

  const sky = (data >> 4) & 0xF
  const block = data & 0xF
  return Math.max(sky, block)
}

/**
 * Get face light by sampling the air block adjacent to the face.
 */
function getFaceLight(
  lightData: Uint8Array,
  neighborLights: SubChunkNeighborLightData,
  x: number,
  y: number,
  z: number,
  faceDir: number
): number {
  // Sample from the adjacent air position
  switch (faceDir) {
    case FACE_TOP:    return getLightAt(lightData, neighborLights, x, y + 1, z)
    case FACE_BOTTOM: return getLightAt(lightData, neighborLights, x, y - 1, z)
    case FACE_NORTH:  return getLightAt(lightData, neighborLights, x, y, z - 1)
    case FACE_SOUTH:  return getLightAt(lightData, neighborLights, x, y, z + 1)
    case FACE_EAST:   return getLightAt(lightData, neighborLights, x + 1, y, z)
    case FACE_WEST:   return getLightAt(lightData, neighborLights, x - 1, y, z)
    default:          return 15
  }
}

/**
 * Check if a face should be rendered (adjacent block is not opaque).
 */
function shouldRenderFace(
  blocks: Uint16Array,
  neighbors: SubChunkNeighborData,
  opaqueSet: Set<number>,
  x: number,
  y: number,
  z: number,
  faceDir: number
): boolean {
  let neighborBlock: number

  switch (faceDir) {
    case FACE_TOP:    neighborBlock = getBlockAt(blocks, neighbors, x, y + 1, z); break
    case FACE_BOTTOM: neighborBlock = getBlockAt(blocks, neighbors, x, y - 1, z); break
    case FACE_NORTH:  neighborBlock = getBlockAt(blocks, neighbors, x, y, z - 1); break
    case FACE_SOUTH:  neighborBlock = getBlockAt(blocks, neighbors, x, y, z + 1); break
    case FACE_EAST:   neighborBlock = getBlockAt(blocks, neighbors, x + 1, y, z); break
    case FACE_WEST:   neighborBlock = getBlockAt(blocks, neighbors, x - 1, y, z); break
    default:          return false
  }

  return !isOpaque(neighborBlock, opaqueSet)
}

/**
 * Greedy merge a 2D mask into rectangles.
 * Returns array of [u, v, width, height, faceData] tuples.
 */
function greedyMerge2D(
  mask: FaceMaskValue[],
  width: number,
  height: number
): Array<[number, number, number, number, FaceMaskValue]> {
  const quads: Array<[number, number, number, number, FaceMaskValue]> = []

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const idx = v * width + u
      const faceData = mask[idx]

      if (faceData === 0) continue

      // Find maximum width
      let w = 1
      while (u + w < width && mask[v * width + u + w] === faceData) {
        w++
      }

      // Find maximum height with that width
      let h = 1
      outer: while (v + h < height) {
        for (let du = 0; du < w; du++) {
          if (mask[(v + h) * width + u + du] !== faceData) {
            break outer
          }
        }
        h++
      }

      // Create quad
      quads.push([u, v, w, h, faceData])

      // Clear merged cells
      for (let dv = 0; dv < h; dv++) {
        for (let du = 0; du < w; du++) {
          mask[(v + dv) * width + u + du] = 0
        }
      }
    }
  }

  return quads
}

/**
 * Emit quad vertices for a face.
 * Returns the vertex data (11 floats per vertex, 4 vertices).
 */
function emitQuadVertices(
  worldX: number,
  worldY: number,
  worldZ: number,
  quadU: number,
  quadV: number,
  quadW: number,
  quadH: number,
  faceDir: number,
  lightLevel: number
): Float32Array {
  // 4 vertices * 11 floats each = 44 floats
  const vertices = new Float32Array(44)

  const normal = FACE_NORMALS[faceDir]

  // Calculate brightness from light level
  const minBrightness = 0.02
  const normalized = lightLevel / 15
  const brightness = minBrightness + Math.pow(normalized, 2.2) * (1 - minBrightness)

  // Calculate 4 corner positions based on face direction
  // quadU, quadV are offsets in the face's 2D coordinate system
  // quadW, quadH are the size of the quad

  let p0: [number, number, number]
  let p1: [number, number, number]
  let p2: [number, number, number]
  let p3: [number, number, number]

  // UV coordinates tile the texture based on quad size
  const uv0: [number, number] = [0, 0]
  const uv1: [number, number] = [quadW, 0]
  const uv2: [number, number] = [quadW, quadH]
  const uv3: [number, number] = [0, quadH]

  switch (faceDir) {
    case FACE_TOP: // +Y face
      // u -> X, v -> Z, Y is constant at top of block
      p0 = [worldX + quadU, worldY + 1, worldZ + quadV]
      p1 = [worldX + quadU + quadW, worldY + 1, worldZ + quadV]
      p2 = [worldX + quadU + quadW, worldY + 1, worldZ + quadV + quadH]
      p3 = [worldX + quadU, worldY + 1, worldZ + quadV + quadH]
      break

    case FACE_BOTTOM: // -Y face
      // u -> X, v -> Z, Y is constant at bottom of block
      p0 = [worldX + quadU, worldY, worldZ + quadV + quadH]
      p1 = [worldX + quadU + quadW, worldY, worldZ + quadV + quadH]
      p2 = [worldX + quadU + quadW, worldY, worldZ + quadV]
      p3 = [worldX + quadU, worldY, worldZ + quadV]
      break

    case FACE_NORTH: // -Z face
      // u -> X, v -> Y, Z is constant
      p0 = [worldX + quadU + quadW, worldY + quadV, worldZ]
      p1 = [worldX + quadU, worldY + quadV, worldZ]
      p2 = [worldX + quadU, worldY + quadV + quadH, worldZ]
      p3 = [worldX + quadU + quadW, worldY + quadV + quadH, worldZ]
      break

    case FACE_SOUTH: // +Z face
      // u -> X, v -> Y, Z is constant at far side
      p0 = [worldX + quadU, worldY + quadV, worldZ + 1]
      p1 = [worldX + quadU + quadW, worldY + quadV, worldZ + 1]
      p2 = [worldX + quadU + quadW, worldY + quadV + quadH, worldZ + 1]
      p3 = [worldX + quadU, worldY + quadV + quadH, worldZ + 1]
      break

    case FACE_EAST: // +X face
      // u -> Z, v -> Y, X is constant at far side
      p0 = [worldX + 1, worldY + quadV, worldZ + quadU]
      p1 = [worldX + 1, worldY + quadV, worldZ + quadU + quadW]
      p2 = [worldX + 1, worldY + quadV + quadH, worldZ + quadU + quadW]
      p3 = [worldX + 1, worldY + quadV + quadH, worldZ + quadU]
      break

    case FACE_WEST: // -X face
      // u -> Z, v -> Y, X is constant
      p0 = [worldX, worldY + quadV, worldZ + quadU + quadW]
      p1 = [worldX, worldY + quadV, worldZ + quadU]
      p2 = [worldX, worldY + quadV + quadH, worldZ + quadU]
      p3 = [worldX, worldY + quadV + quadH, worldZ + quadU + quadW]
      break

    default:
      p0 = p1 = p2 = p3 = [0, 0, 0]
  }

  // Pack vertices: x, y, z, u, v, nx, ny, nz, r, g, b
  let i = 0
  for (const [p, uv] of [[p0, uv0], [p1, uv1], [p2, uv2], [p3, uv3]] as const) {
    vertices[i++] = p[0]
    vertices[i++] = p[1]
    vertices[i++] = p[2]
    vertices[i++] = uv[0]
    vertices[i++] = uv[1]
    vertices[i++] = normal[0]
    vertices[i++] = normal[1]
    vertices[i++] = normal[2]
    vertices[i++] = brightness
    vertices[i++] = brightness
    vertices[i++] = brightness
  }

  return vertices
}

/**
 * Get texture ID for a block face from the face texture map.
 */
function getFaceTextureId(
  blockId: number,
  faceIndex: number,
  textureMap: Map<number, number>
): number {
  const key = blockId * 6 + faceIndex
  return textureMap.get(key) ?? blockId
}

/**
 * Process a sub-chunk with greedy meshing.
 */
function processSubChunk(
  request: GreedyMeshRequest,
  textureMap: Map<number, number>,
  nonGreedyIds: Set<number>
): GreedyMeshResponse {
  const { chunkX, chunkZ, subY, minWorldY, blocks, lightData, neighbors, neighborLights, opaqueBlockIds } = request

  // Set up opaque set
  reusableOpaqueSet.clear()
  for (const id of opaqueBlockIds) {
    reusableOpaqueSet.add(id)
  }
  const opaqueSet = reusableOpaqueSet

  // World offset
  const worldOffsetX = chunkX * CHUNK_SIZE_X
  const worldOffsetZ = chunkZ * CHUNK_SIZE_Z

  // Collect mesh groups by key: textureId_faceDir_isTransparent
  const groupVertices = new Map<string, number[]>()
  const groupIndices = new Map<string, number[]>()
  const groupMeta = new Map<string, { textureId: number; blockId: number; faceDir: number; isTransparent: boolean }>()

  // Non-greedy blocks (torch, etc.)
  const nonGreedyPositions = new Map<number, number[]>()
  const nonGreedyLights = new Map<number, number[]>()

  // Track which blocks have been processed for non-greedy
  const processedNonGreedy = new Set<number>()

  // Process each face direction
  for (let faceDir = 0; faceDir < 6; faceDir++) {
    // Determine slice iteration based on face direction
    let sliceCount: number
    let uSize: number
    let vSize: number

    switch (faceDir) {
      case FACE_TOP:
      case FACE_BOTTOM:
        // Horizontal slices (XZ plane), iterate Y
        sliceCount = SUB_CHUNK_HEIGHT
        uSize = CHUNK_SIZE_X
        vSize = CHUNK_SIZE_Z
        break
      case FACE_NORTH:
      case FACE_SOUTH:
        // YX planes, iterate Z
        sliceCount = CHUNK_SIZE_Z
        uSize = CHUNK_SIZE_X
        vSize = SUB_CHUNK_HEIGHT
        break
      case FACE_EAST:
      case FACE_WEST:
        // YZ planes, iterate X
        sliceCount = CHUNK_SIZE_X
        uSize = CHUNK_SIZE_Z
        vSize = SUB_CHUNK_HEIGHT
        break
      default:
        continue
    }

    // Reusable mask for each slice
    const mask = new Array<FaceMaskValue>(uSize * vSize)

    for (let slice = 0; slice < sliceCount; slice++) {
      // Clear mask
      mask.fill(0)

      // Build mask for this slice
      for (let v = 0; v < vSize; v++) {
        for (let u = 0; u < uSize; u++) {
          // Convert (slice, u, v) to (x, y, z) based on face direction
          let x: number, y: number, z: number

          switch (faceDir) {
            case FACE_TOP:
            case FACE_BOTTOM:
              x = u
              y = slice
              z = v
              break
            case FACE_NORTH:
            case FACE_SOUTH:
              x = u
              y = v
              z = slice
              break
            case FACE_EAST:
            case FACE_WEST:
              x = slice
              y = v
              z = u
              break
            default:
              continue
          }

          const blockId = blocks[localToIndex(x, y, z)]
          if (blockId === AIR) continue

          // Check if this is a non-greedy block
          if (nonGreedyIds.has(blockId)) {
            // Only process once per block position
            const posKey = localToIndex(x, y, z)
            if (!processedNonGreedy.has(posKey)) {
              processedNonGreedy.add(posKey)

              let positions = nonGreedyPositions.get(blockId)
              if (!positions) {
                positions = []
                nonGreedyPositions.set(blockId, positions)
              }
              positions.push(
                worldOffsetX + x,
                minWorldY + y,
                worldOffsetZ + z
              )

              let lights = nonGreedyLights.get(blockId)
              if (!lights) {
                lights = []
                nonGreedyLights.set(blockId, lights)
              }
              // Get max light from all neighbors
              let maxLight = 0
              for (let fd = 0; fd < 6; fd++) {
                maxLight = Math.max(maxLight, getFaceLight(lightData, neighborLights, x, y, z, fd))
              }
              lights.push(maxLight)
            }
            continue
          }

          // Check if face should be rendered
          if (!shouldRenderFace(blocks, neighbors, opaqueSet, x, y, z, faceDir)) {
            continue
          }

          // Get texture ID and light level for this face
          const textureId = getFaceTextureId(blockId, faceDir, textureMap)
          const lightLevel = getFaceLight(lightData, neighborLights, x, y, z, faceDir)

          // Encode face data
          const faceData = encodeFaceData(textureId, lightLevel, blockId)
          mask[v * uSize + u] = faceData
        }
      }

      // Greedy merge the mask
      const quads = greedyMerge2D(mask, uSize, vSize)

      // Emit vertices for each quad
      for (const [quadU, quadV, quadW, quadH, faceData] of quads) {
        const textureId = decodeTextureId(faceData)
        const lightLevel = decodeLightLevel(faceData)
        const blockId = decodeBlockId(faceData)

        // Determine if transparent (for now, just oak_leaves = blockId 5)
        const isTransparent = blockId === 5

        // Calculate slice origin (base position for this slice)
        // emitQuadVertices will add quadU/quadV offsets based on face direction
        let sliceOriginX: number, sliceOriginY: number, sliceOriginZ: number

        switch (faceDir) {
          case FACE_TOP:
          case FACE_BOTTOM:
            // Horizontal slice: u->X, v->Z, slice->Y
            sliceOriginX = worldOffsetX
            sliceOriginY = minWorldY + slice
            sliceOriginZ = worldOffsetZ
            break
          case FACE_NORTH:
          case FACE_SOUTH:
            // Vertical slice along Z: u->X, v->Y, slice->Z
            sliceOriginX = worldOffsetX
            sliceOriginY = minWorldY
            sliceOriginZ = worldOffsetZ + slice
            break
          case FACE_EAST:
          case FACE_WEST:
            // Vertical slice along X: u->Z, v->Y, slice->X
            sliceOriginX = worldOffsetX + slice
            sliceOriginY = minWorldY
            sliceOriginZ = worldOffsetZ
            break
          default:
            continue
        }

        // Emit vertices for this quad
        const vertices = emitQuadVertices(
          sliceOriginX,
          sliceOriginY,
          sliceOriginZ,
          quadU,
          quadV,
          quadW,
          quadH,
          faceDir,
          lightLevel
        )

        // Group key
        const groupKey = `${textureId}_${faceDir}_${isTransparent}`

        // Get or create group
        let verts = groupVertices.get(groupKey)
        let inds = groupIndices.get(groupKey)
        if (!verts) {
          verts = []
          inds = []
          groupVertices.set(groupKey, verts)
          groupIndices.set(groupKey, inds!)
          groupMeta.set(groupKey, { textureId, blockId, faceDir, isTransparent })
        }

        // Add vertices
        const baseVertex = verts.length / 11
        for (let i = 0; i < 44; i++) {
          verts.push(vertices[i])
        }

        // Add indices (two triangles per quad)
        // NORTH and SOUTH faces need opposite winding from others
        if (faceDir === FACE_NORTH || faceDir === FACE_SOUTH) {
          inds!.push(
            baseVertex, baseVertex + 1, baseVertex + 2,
            baseVertex, baseVertex + 2, baseVertex + 3
          )
        } else {
          inds!.push(
            baseVertex, baseVertex + 2, baseVertex + 1,
            baseVertex, baseVertex + 3, baseVertex + 2
          )
        }
      }
    }
  }

  // Convert to typed arrays
  const opaqueGroups: MeshGroup[] = []
  const transparentGroups: MeshGroup[] = []

  for (const [key, verts] of groupVertices) {
    const inds = groupIndices.get(key)!
    const meta = groupMeta.get(key)!

    const group: MeshGroup = {
      textureId: meta.textureId,
      blockId: meta.blockId,
      faceDirection: meta.faceDir,
      vertices: new Float32Array(verts),
      indices: new Uint16Array(inds),
    }

    if (meta.isTransparent) {
      transparentGroups.push(group)
    } else {
      opaqueGroups.push(group)
    }
  }

  // Convert non-greedy blocks to output format
  const nonGreedyBlocks: Array<[number, Float32Array]> = []
  const nonGreedyLightsOut: Array<[number, Uint8Array]> = []

  for (const [blockId, positions] of nonGreedyPositions) {
    nonGreedyBlocks.push([blockId, new Float32Array(positions)])
    const lights = nonGreedyLights.get(blockId) ?? []
    nonGreedyLightsOut.push([blockId, new Uint8Array(lights)])
  }

  return {
    type: 'greedy-mesh-result',
    chunkX,
    chunkZ,
    subY,
    opaqueGroups,
    transparentGroups,
    nonGreedyBlocks,
    nonGreedyLights: nonGreedyLightsOut,
  }
}

// Non-greedy block IDs set (populated from main thread)
let nonGreedyBlockIds: Set<number> = new Set(NON_GREEDY_BLOCK_IDS)

// Worker message handler
self.onmessage = (event: MessageEvent<GreedyMeshRequest>) => {
  const data = event.data

  try {
    // Initialize face texture map on first request
    if (data.faceTextureMapEntries && !faceTextureMap) {
      faceTextureMap = deserializeFaceTextureMap(data.faceTextureMapEntries)
    }

    // Update non-greedy block IDs if provided
    if (data.nonGreedyBlockIds) {
      nonGreedyBlockIds = new Set(data.nonGreedyBlockIds)
    }

    // Ensure face texture map is available
    if (!faceTextureMap) {
      faceTextureMap = getCachedFaceTextureMap() ?? new Map()
    }

    const result = processSubChunk(data, faceTextureMap, nonGreedyBlockIds)

    // Collect transferable arrays
    const transfer: Transferable[] = []
    for (const group of result.opaqueGroups) {
      transfer.push(group.vertices.buffer, group.indices.buffer)
    }
    for (const group of result.transparentGroups) {
      transfer.push(group.vertices.buffer, group.indices.buffer)
    }
    for (const [, positions] of result.nonGreedyBlocks) {
      transfer.push(positions.buffer)
    }
    for (const [, lights] of result.nonGreedyLights) {
      transfer.push(lights.buffer)
    }

    self.postMessage(result, { transfer })
  } catch (error) {
    const errorResponse: GreedyMeshError = {
      type: 'greedy-mesh-error',
      chunkX: data.chunkX,
      chunkZ: data.chunkZ,
      subY: data.subY,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(errorResponse)
  }
}
