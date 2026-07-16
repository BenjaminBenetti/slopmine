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

// Atlas region data (populated on first request)
export interface AtlasRegion {
  u0: number  // Left edge
  v0: number  // Bottom edge
  u1: number  // Right edge
  v1: number  // Top edge
}

let atlasRegions: Map<number, AtlasRegion> | null = null

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

// Neighbor data interfaces (same as ChunkMeshWorker).
// All neighbors are 32x32 boundary slabs (only the shared face is needed):
//   posX/negX: fixed-x face, index = y * CHUNK_SIZE_Z + z
//   posZ/negZ: fixed-z face, index = y * CHUNK_SIZE_X + x
//   posY/negY: fixed-y face, index = z * CHUNK_SIZE_X + x
interface SubChunkNeighborData {
  posX: Uint16Array | null
  negX: Uint16Array | null
  posZ: Uint16Array | null
  negZ: Uint16Array | null
  posY: Uint16Array | null
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
  metadata?: Uint8Array
  neighbors: SubChunkNeighborData
  neighborLights: SubChunkNeighborLightData
  opaqueBlockIds: number[]
  // Face texture map entries: [[key, textureId], ...]
  // Sent once on first request, then cached in worker
  faceTextureMapEntries?: Array<[number, number]>
  // Atlas region entries: [[textureId, {u0,v0,u1,v1}], ...]
  // Sent once on first request, then cached in worker
  atlasRegionEntries?: Array<[number, AtlasRegion]>
  // Non-greedy block IDs (torch, etc.)
  nonGreedyBlockIds?: number[]
}

export interface MeshGroup {
  textureId: number
  blockId: number
  faceDirection: number
  vertices: Float32Array  // 11 floats per vertex: x,y,z,u,v,nx,ny,nz,r,g,b
  indices: Uint16Array | Uint32Array  // 6 indices per quad (Uint32 for large meshes)
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
  nonGreedyMetadata: Array<[number, Uint8Array]>
  // Face visibility for liquid blocks (6-bit mask per instance)
  // Bit order: TOP(0), BOTTOM(1), NORTH(2), SOUTH(3), EAST(4), WEST(5)
  nonGreedyFaceVisibility: Array<[number, Uint8Array]>
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

  // Horizontal neighbors (boundary slabs; only one axis is out of range here)
  if (x < 0) {
    if (!neighbors.negX) return AIR
    return neighbors.negX[y * CHUNK_SIZE_Z + z]
  }
  if (x >= CHUNK_SIZE_X) {
    if (!neighbors.posX) return AIR
    return neighbors.posX[y * CHUNK_SIZE_Z + z]
  }
  if (z < 0) {
    if (!neighbors.negZ) return AIR
    return neighbors.negZ[y * CHUNK_SIZE_X + x]
  }
  if (z >= CHUNK_SIZE_Z) {
    if (!neighbors.posZ) return AIR
    return neighbors.posZ[y * CHUNK_SIZE_X + x]
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

  // Horizontal neighbors (boundary slabs; only one axis is out of range here)
  if (x < 0) {
    if (!neighborLights.negX) return 15
    data = neighborLights.negX[y * CHUNK_SIZE_Z + z]
  } else if (x >= CHUNK_SIZE_X) {
    if (!neighborLights.posX) return 15
    data = neighborLights.posX[y * CHUNK_SIZE_Z + z]
  } else if (z < 0) {
    if (!neighborLights.negZ) return 15
    data = neighborLights.negZ[y * CHUNK_SIZE_X + x]
  } else if (z >= CHUNK_SIZE_Z) {
    if (!neighborLights.posZ) return 15
    data = neighborLights.posZ[y * CHUNK_SIZE_X + x]
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

// Liquid family mappings for face culling between same-family liquids
// Water family (13-20), Lava family (21-28), Swamp water family (39-46)
const LIQUID_FAMILIES: Map<number, string> = new Map([
  // Water family (13-20)
  [13, 'water'], [14, 'water'], [15, 'water'], [16, 'water'],
  [17, 'water'], [18, 'water'], [19, 'water'], [20, 'water'],
  // Lava family (21-28)
  [21, 'lava'], [22, 'lava'], [23, 'lava'], [24, 'lava'],
  [25, 'lava'], [26, 'lava'], [27, 'lava'], [28, 'lava'],
  // Swamp water family (39-46)
  [39, 'swamp'], [40, 'swamp'], [41, 'swamp'], [42, 'swamp'],
  [43, 'swamp'], [44, 'swamp'], [45, 'swamp'], [46, 'swamp'],
])

/**
 * Check if two blocks belong to the same liquid family.
 */
function areSameLiquidFamily(a: number, b: number): boolean {
  const familyA = LIQUID_FAMILIES.get(a)
  return familyA !== undefined && familyA === LIQUID_FAMILIES.get(b)
}

/**
 * Check if a block is a liquid (water, lava, or swamp water).
 */
function isLiquid(blockId: number): boolean {
  return LIQUID_FAMILIES.has(blockId)
}

/**
 * Check if a face should be rendered (adjacent block is not opaque).
 * Also skips liquid-to-liquid faces to eliminate internal water faces.
 */
function shouldRenderFace(
  blocks: Uint16Array,
  neighbors: SubChunkNeighborData,
  opaqueSet: Set<number>,
  x: number,
  y: number,
  z: number,
  faceDir: number,
  currentBlockId: number
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

  // Skip faces between blocks of the same liquid family
  if (areSameLiquidFamily(currentBlockId, neighborBlock)) {
    return false
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
 * Emit a single 1x1 quad with atlas UVs.
 * Returns the vertex data (11 floats per vertex, 4 vertices).
 */
function emitSingleQuadWithAtlasUV(
  worldX: number,
  worldY: number,
  worldZ: number,
  localU: number,
  localV: number,
  faceDir: number,
  brightness: number,
  atlasRegion: AtlasRegion
): Float32Array {
  // 4 vertices * 11 floats each = 44 floats
  const vertices = new Float32Array(44)

  const normal = FACE_NORMALS[faceDir]

  // Calculate 4 corner positions based on face direction
  let p0: [number, number, number]
  let p1: [number, number, number]
  let p2: [number, number, number]
  let p3: [number, number, number]

  // Atlas UV coordinates for a 1x1 quad
  const uv0: [number, number] = [atlasRegion.u0, atlasRegion.v0]
  const uv1: [number, number] = [atlasRegion.u1, atlasRegion.v0]
  const uv2: [number, number] = [atlasRegion.u1, atlasRegion.v1]
  const uv3: [number, number] = [atlasRegion.u0, atlasRegion.v1]

  switch (faceDir) {
    case FACE_TOP: // +Y face
      p0 = [worldX + localU, worldY + 1, worldZ + localV]
      p1 = [worldX + localU + 1, worldY + 1, worldZ + localV]
      p2 = [worldX + localU + 1, worldY + 1, worldZ + localV + 1]
      p3 = [worldX + localU, worldY + 1, worldZ + localV + 1]
      break

    case FACE_BOTTOM: // -Y face
      p0 = [worldX + localU, worldY, worldZ + localV + 1]
      p1 = [worldX + localU + 1, worldY, worldZ + localV + 1]
      p2 = [worldX + localU + 1, worldY, worldZ + localV]
      p3 = [worldX + localU, worldY, worldZ + localV]
      break

    case FACE_NORTH: // -Z face
      p0 = [worldX + localU + 1, worldY + localV, worldZ]
      p1 = [worldX + localU, worldY + localV, worldZ]
      p2 = [worldX + localU, worldY + localV + 1, worldZ]
      p3 = [worldX + localU + 1, worldY + localV + 1, worldZ]
      break

    case FACE_SOUTH: // +Z face
      p0 = [worldX + localU, worldY + localV, worldZ + 1]
      p1 = [worldX + localU + 1, worldY + localV, worldZ + 1]
      p2 = [worldX + localU + 1, worldY + localV + 1, worldZ + 1]
      p3 = [worldX + localU, worldY + localV + 1, worldZ + 1]
      break

    case FACE_EAST: // +X face
      p0 = [worldX + 1, worldY + localV, worldZ + localU]
      p1 = [worldX + 1, worldY + localV, worldZ + localU + 1]
      p2 = [worldX + 1, worldY + localV + 1, worldZ + localU + 1]
      p3 = [worldX + 1, worldY + localV + 1, worldZ + localU]
      break

    case FACE_WEST: // -X face
      p0 = [worldX, worldY + localV, worldZ + localU + 1]
      p1 = [worldX, worldY + localV, worldZ + localU]
      p2 = [worldX, worldY + localV + 1, worldZ + localU]
      p3 = [worldX, worldY + localV + 1, worldZ + localU + 1]
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
 * Emit all sub-quads for a merged quad with atlas UVs.
 * For a WxH merged quad, emits W*H individual 1x1 quads.
 * Returns array of vertex data arrays.
 */
function emitMergedQuadWithAtlasUVs(
  worldX: number,
  worldY: number,
  worldZ: number,
  quadU: number,
  quadV: number,
  quadW: number,
  quadH: number,
  faceDir: number,
  lightLevel: number,
  atlasRegion: AtlasRegion
): Float32Array[] {
  // Calculate brightness from light level
  const minBrightness = 0.02
  const normalized = lightLevel / 15
  const brightness = minBrightness + Math.pow(normalized, 2.2) * (1 - minBrightness)

  const result: Float32Array[] = []

  // Emit W*H sub-quads
  for (let dv = 0; dv < quadH; dv++) {
    for (let du = 0; du < quadW; du++) {
      const subQuad = emitSingleQuadWithAtlasUV(
        worldX,
        worldY,
        worldZ,
        quadU + du,
        quadV + dv,
        faceDir,
        brightness,
        atlasRegion
      )
      result.push(subQuad)
    }
  }

  return result
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
  const nonGreedyMetadataMap = new Map<number, number[]>()
  const nonGreedyFaceVisibility = new Map<number, number[]>()
  const metadata = request.metadata

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

              // Collect metadata for this block
              let metadataArr = nonGreedyMetadataMap.get(blockId)
              if (!metadataArr) {
                metadataArr = []
                nonGreedyMetadataMap.set(blockId, metadataArr)
              }
              const blockMetadata = metadata ? metadata[posKey] : 0
              metadataArr.push(blockMetadata)

              // Compute face visibility for liquid blocks
              let faceVisArr = nonGreedyFaceVisibility.get(blockId)
              if (!faceVisArr) {
                faceVisArr = []
                nonGreedyFaceVisibility.set(blockId, faceVisArr)
              }

              if (LIQUID_FAMILIES.has(blockId)) {
                // Compute which faces are visible
                // Interior faces: hide only if neighbor is exact same block ID (allows height variation)
                // Horizontal boundary faces (NSEW): always hide at chunk edges to prevent seams
                // Vertical boundary faces (TOP/BOTTOM): hide if same liquid family
                let visibleFaces = 0
                const neighborOffsets: [number, number, number][] = [
                  [0, 1, 0],  // TOP (bit 0)
                  [0, -1, 0], // BOTTOM (bit 1)
                  [0, 0, -1], // NORTH (bit 2)
                  [0, 0, 1],  // SOUTH (bit 3)
                  [1, 0, 0],  // EAST (bit 4)
                  [-1, 0, 0], // WEST (bit 5)
                ]

                // Horizontal chunk boundaries - always hide these faces for liquids
                const atHorizontalBoundary = [
                  false,                        // TOP - not horizontal boundary
                  false,                        // BOTTOM - not horizontal boundary
                  z === 0,                      // NORTH at Z boundary
                  z === CHUNK_SIZE_Z - 1,       // SOUTH at Z boundary
                  x === CHUNK_SIZE_X - 1,       // EAST at X boundary
                  x === 0,                      // WEST at X boundary
                ]

                // Vertical sub-chunk boundaries
                const atVerticalBoundary = [
                  y === SUB_CHUNK_HEIGHT - 1,   // TOP at sub-chunk boundary
                  y === 0,                       // BOTTOM at sub-chunk boundary
                  false, false, false, false,   // Horizontal faces
                ]

                for (let f = 0; f < 6; f++) {
                  if (atHorizontalBoundary[f]) {
                    // At horizontal chunk boundary - always hide to prevent seams
                    continue
                  }

                  const [dx, dy, dz] = neighborOffsets[f]
                  const neighborId = getBlockAt(blocks, neighbors, x + dx, y + dy, z + dz)

                  if (atVerticalBoundary[f]) {
                    // At vertical sub-chunk boundary: hide if same liquid family
                    if (!areSameLiquidFamily(blockId, neighborId)) {
                      visibleFaces |= (1 << f)
                    }
                  } else {
                    // Interior: hide only if exact same block ID
                    if (neighborId !== blockId) {
                      visibleFaces |= (1 << f)
                    }
                  }
                }
                faceVisArr.push(visibleFaces)
              } else {
                // Non-liquid blocks show all faces (0x3F = all 6 bits set)
                faceVisArr.push(0x3F)
              }
            }
            continue
          }

          // Check if face should be rendered
          if (!shouldRenderFace(blocks, neighbors, opaqueSet, x, y, z, faceDir, blockId)) {
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

        // Determine if transparent based on block's isOpaque property
        const isTransparent = !isOpaque(blockId, opaqueSet)

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

        // Group key - group by transparency only (normals are per-vertex, atlas merges all textures)
        const groupKey = `${isTransparent}`

        // Get or create group
        let verts = groupVertices.get(groupKey)
        let inds = groupIndices.get(groupKey)
        if (!verts) {
          verts = []
          inds = []
          groupVertices.set(groupKey, verts)
          groupIndices.set(groupKey, inds!)
          // faceDir is not used for material selection anymore (normals are per-vertex)
          groupMeta.set(groupKey, { textureId, blockId, faceDir: 0, isTransparent })
        }

        // Get atlas region for this texture
        const atlasRegion = atlasRegions?.get(textureId)

        if (atlasRegion) {
          // Emit sub-quads with atlas UVs
          const subQuads = emitMergedQuadWithAtlasUVs(
            sliceOriginX,
            sliceOriginY,
            sliceOriginZ,
            quadU,
            quadV,
            quadW,
            quadH,
            faceDir,
            lightLevel,
            atlasRegion
          )

          // Add all sub-quads to the group
          for (const vertices of subQuads) {
            const baseVertex = verts.length / 11
            for (let i = 0; i < 44; i++) {
              verts.push(vertices[i])
            }

            // Add indices (two triangles per quad)
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
        } else {
          // Fallback: emit sub-quads with default 0-1 UVs (should not happen with atlas)
          const defaultRegion: AtlasRegion = { u0: 0, v0: 0, u1: 1, v1: 1 }
          const subQuads = emitMergedQuadWithAtlasUVs(
            sliceOriginX,
            sliceOriginY,
            sliceOriginZ,
            quadU,
            quadV,
            quadW,
            quadH,
            faceDir,
            lightLevel,
            defaultRegion
          )

          for (const vertices of subQuads) {
            const baseVertex = verts.length / 11
            for (let i = 0; i < 44; i++) {
              verts.push(vertices[i])
            }

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
    }
  }

  // Convert to typed arrays
  const opaqueGroups: MeshGroup[] = []
  const transparentGroups: MeshGroup[] = []

  for (const [key, verts] of groupVertices) {
    const inds = groupIndices.get(key)!
    const meta = groupMeta.get(key)!

    // Use Uint32Array if vertex count exceeds Uint16 limit
    // Note: Cannot use Math.max(...inds) as spread can overflow call stack with large arrays
    let maxIndex = 0
    for (let i = 0; i < inds.length; i++) {
      if (inds[i] > maxIndex) maxIndex = inds[i]
    }
    const indices = maxIndex > 65535
      ? new Uint32Array(inds)
      : new Uint16Array(inds)

    const group: MeshGroup = {
      textureId: meta.textureId,
      blockId: meta.blockId,
      faceDirection: meta.faceDir,
      vertices: new Float32Array(verts),
      indices,
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
  const nonGreedyMetadataOut: Array<[number, Uint8Array]> = []
  const nonGreedyFaceVisOut: Array<[number, Uint8Array]> = []

  for (const [blockId, positions] of nonGreedyPositions) {
    nonGreedyBlocks.push([blockId, new Float32Array(positions)])
    const lights = nonGreedyLights.get(blockId) ?? []
    nonGreedyLightsOut.push([blockId, new Uint8Array(lights)])
    const metadataArr = nonGreedyMetadataMap.get(blockId) ?? []
    nonGreedyMetadataOut.push([blockId, new Uint8Array(metadataArr)])
    const faceVisArr = nonGreedyFaceVisibility.get(blockId) ?? []
    nonGreedyFaceVisOut.push([blockId, new Uint8Array(faceVisArr)])
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
    nonGreedyMetadata: nonGreedyMetadataOut,
    nonGreedyFaceVisibility: nonGreedyFaceVisOut,
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

    // Initialize atlas regions on first request
    if (data.atlasRegionEntries && !atlasRegions) {
      atlasRegions = new Map(data.atlasRegionEntries)
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
    for (const [, metadata] of result.nonGreedyMetadata) {
      transfer.push(metadata.buffer)
    }
    for (const [, faceVis] of result.nonGreedyFaceVisibility) {
      transfer.push(faceVis.buffer)
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
