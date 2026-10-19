/**
 * Web Worker for greedy mesh generation.
 *
 * Pads the sub-chunk with its one-block neighbour shell (34³, see
 * MeshNeighborShell.ts), then emits greedy-merged quads with smooth lighting
 * and ambient occlusion in the compact vertex format (ChunkVertexFormat.ts),
 * plus per-instance data for non-greedy blocks (torches, plants, liquids, …).
 *
 * Missing-neighbour policy: light is never fabricated. Faces toward a
 * neighbour sub-chunk that isn't loaded are culled (they point away from the
 * player, who is always inside the loaded region) and appear, correctly lit,
 * when the neighbour loads and this sub-chunk is remeshed. AO / smooth-light
 * samples that land in missing data reuse the face's own light.
 */

import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import {
  deserializeFaceTextureMap, getCachedFaceTextureMap, NON_GREEDY_BLOCK_IDS, QUARTER_TURN_FACES,
} from '../world/blocks/FaceTextureRegistry.ts'
import { SHELL_REGIONS, SHELL_FACE_INDICES } from '../world/meshing/MeshNeighborShell.ts'
import type { LiquidGlowEntry, LiquidMeshEntry } from '../world/meshing/LiquidMeshTable.ts'
import { CHUNK_MAX_TEXTURE_LAYER, LIQUID_SIDE_CLIP_SHIFT } from '../renderer/ChunkVertexFormat.ts'
import { PaddedVolume, PAD_ORIGIN, PAD_STRIDE_Y, PAD_STRIDE_Z, MISSING_BLOCK } from './greedymesh/PaddedVolume.ts'
import { ChunkGeometryWriter, type MeshGroup } from './greedymesh/ChunkGeometryWriter.ts'
import { meshGreedyFaces } from './greedymesh/GreedyFaceMesher.ts'

export type { MeshGroup } from './greedymesh/ChunkGeometryWriter.ts'

// Block ID for air (invisible)
const AIR = 0

const SUB_CHUNK_VOLUME = CHUNK_SIZE_X * CHUNK_SIZE_Z * SUB_CHUNK_HEIGHT

/** Texture layer used for faces whose texture isn't in the block texture array. */
const MISSING_TEXTURE_LAYER = 0

export interface GreedyMeshRequest {
  type: 'greedy-mesh'
  chunkX: number
  chunkZ: number
  subY: number
  minWorldY: number
  /** Optional caller token, echoed back unchanged in the response. */
  jobId?: number
  blocks: Uint16Array
  lightData: Uint8Array
  metadata?: Uint8Array
  /** One-block neighbour shell (MeshNeighborShell.ts layout) */
  shellBlocks: Uint16Array
  shellLight: Uint8Array
  /** Bit (neighbour index) set = that shell region holds loaded data */
  shellPresentMask: number
  opaqueBlockIds: number[]
  // Face texture map entries: [[blockId * 6 + face, textureId], ...]
  // Sent once on first request, then cached in worker
  faceTextureMapEntries?: Array<[number, number]>
  // Texture-array layer per texture id: [[textureId, layer], ...]
  // Sent once on first request, then cached in worker
  textureLayerEntries?: Array<[number, number]>
  // Non-greedy block IDs (torch, etc.)
  nonGreedyBlockIds?: number[]
  // Liquid blocks [blockId, family, level] (LiquidMeshTable.ts), built from
  // block properties; sent once on first request, then cached in worker
  liquidBlockEntries?: LiquidMeshEntry[]
  // Blocks that light the liquid around them [blockId, r, g, b]
  // (`scatterGlow`); sent once on first request, then cached in worker
  liquidGlowEntries?: LiquidGlowEntry[]
}

export interface GreedyMeshResponse {
  type: 'greedy-mesh-result'
  chunkX: number
  chunkZ: number
  subY: number
  jobId?: number
  /** Opaque greedy faces (local positions), or null if none */
  opaque: MeshGroup | null
  /** Alpha-tested greedy faces (leaves), or null if none */
  cutout: MeshGroup | null
  // Non-greedy blocks (torch, etc.) - world positions (3 floats per instance)
  nonGreedyBlocks: Array<[number, Float32Array]>
  // Packed light per instance: sky << 4 | block (brightest neighbouring cell per channel)
  nonGreedyLights: Array<[number, Uint8Array]>
  nonGreedyMetadata: Array<[number, Uint8Array]>
  // Face visibility for liquid blocks, per instance: bits 0-5 = face shown,
  // in order TOP(0), BOTTOM(1), NORTH(2), SOUTH(3), EAST(4), WEST(5), then
  // where each side face starts (LIQUID_SIDE_CLIP_SHIFT, ChunkVertexFormat.ts)
  nonGreedyFaceVisibility: Array<[number, Uint32Array]>
  // Scatter glow on liquid TOP faces, per instance: 4 corners (x0z0, x1z0,
  // x1z1, x0z1) × linear RGB as bytes (/255). Only lists that glow somewhere
  nonGreedyLiquidGlow: Array<[number, Uint8Array]>
}

export interface GreedyMeshError {
  type: 'greedy-mesh-error'
  chunkX: number
  chunkZ: number
  subY: number
  jobId?: number
  error: string
}

// Liquid face rules (filled from the request's liquidBlockEntries): family per
// block id (0 = not a liquid; falling liquids share their family) for face
// culling between same-family liquids, and surface height in eighths (full
// and falling blocks are 8) - a side face between two levels of one liquid
// is only exposed on the taller block
const liquidFamilyTable = new Uint8Array(0x10000)
const liquidLevelTable = new Uint8Array(0x10000)
// The liquid block whose faces a cell draws when it isn't the block itself:
// a submerged block (glowkelp) also emits its cell as its liquid's source
const liquidDrawAsTable = new Uint16Array(0x10000)
// Scatter glow per block id (linear RGB, `scatterGlow`) and whether it has any
const liquidGlowTable = new Float32Array(0x10000 * 3)
const liquidGlowSource = new Uint8Array(0x10000)

/** How many cells below a liquid surface its glowing plants still light it. */
const SCATTER_DEPTH = 6
/** Share of a glow that reaches the surface through each further cell of liquid. */
const SCATTER_FALLOFF = 0.7

// Padded-index offsets of the 6 face neighbours in BlockFace order
// (TOP, BOTTOM, NORTH, SOUTH, EAST, WEST)
const FACE_NEIGHBOR_DELTAS = [PAD_STRIDE_Y, -PAD_STRIDE_Y, -PAD_STRIDE_Z, PAD_STRIDE_Z, 1, -1]

// ---------------------------------------------------------------------------
// Worker state (lookup tables are rebuilt only when their inputs change)
// ---------------------------------------------------------------------------

let faceTextureMap: Map<number, number> | null = null
let textureLayers: Map<number, number> | null = null
let nonGreedyBlockIds: Set<number> = new Set(NON_GREEDY_BLOCK_IDS)

const opaqueTable = new Uint8Array(0x10000)
const nonGreedyTable = new Uint8Array(0x10000)
let faceLayerTable = new Uint8Array(0)
// Quarter-turned faces (static): 1 per blockId * 6 + face
const quarterTurnTable = (() => {
  let maxKey = 0
  for (const key of QUARTER_TURN_FACES) if (key > maxKey) maxKey = key
  const table = new Uint8Array(maxKey + 1)
  for (const key of QUARTER_TURN_FACES) table[key] = 1
  return table
})()
let lastOpaqueIds: number[] | null = null
let faceLayerTableDirty = true
let nonGreedyTableDirty = true

const volume = new PaddedVolume()
const opaqueWriter = new ChunkGeometryWriter()
const cutoutWriter = new ChunkGeometryWriter()
const nonGreedyCells = new Int32Array(SUB_CHUNK_VOLUME)

function updateOpaqueTable(ids: number[]): void {
  if (lastOpaqueIds && lastOpaqueIds.length === ids.length && lastOpaqueIds.every((id, i) => id === ids[i])) {
    return
  }
  opaqueTable.fill(0)
  for (const id of ids) opaqueTable[id] = 1
  opaqueTable[MISSING_BLOCK] = 0
  lastOpaqueIds = ids.slice()
}

function updateLiquidTables(entries: readonly LiquidMeshEntry[]): void {
  liquidFamilyTable.fill(0)
  liquidLevelTable.fill(0)
  liquidDrawAsTable.fill(0)
  for (const [id, family, level, drawAs] of entries) {
    liquidFamilyTable[id] = family
    liquidLevelTable[id] = level
    if (drawAs !== id) liquidDrawAsTable[id] = drawAs
  }
}

function updateLiquidGlowTable(entries: readonly LiquidGlowEntry[]): void {
  liquidGlowTable.fill(0)
  liquidGlowSource.fill(0)
  for (const [id, r, g, b] of entries) {
    liquidGlowTable[id * 3] = r
    liquidGlowTable[id * 3 + 1] = g
    liquidGlowTable[id * 3 + 2] = b
    liquidGlowSource[id] = 1
  }
}

/** Whether any block of the padded volume (shell included) lights its liquid. */
function volumeHasGlowSources(): boolean {
  const { blocks } = volume
  for (let i = 0; i < blocks.length; i++) {
    if (liquidGlowSource[blocks[i]] === 1) return true
  }
  return false
}

// Scratch for liquidSurfaceGlow: the 3×3 columns around a surface cell
const columnGlow = new Float32Array(9 * 3)

/**
 * Glow a liquid surface cell's TOP face shows at its 4 corners (into `out`,
 * 12 floats): each column around it sums the glow of the scatter-glow blocks
 * from the surface down through its liquid (SCATTER_FALLOFF per cell, at most
 * SCATTER_DEPTH), saturating; each corner averages the 4 columns that share
 * it, so the glow blurs a block outward and stays smooth across faces. Reads
 * only the padded volume (the 1-block shell covers the outer columns), so a
 * border corner gets the same value from both sub-chunks.
 */
function liquidSurfaceGlow(p: number, y: number, out: Float32Array): void {
  const { blocks } = volume
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = ((dz + 1) * 3 + dx + 1) * 3
      let r = 0, g = 0, b = 0, weight = 1
      let q = p + dz * PAD_STRIDE_Z + dx
      for (let d = 0; d < SCATTER_DEPTH && y - d >= -1; d++, q -= PAD_STRIDE_Y, weight *= SCATTER_FALLOFF) {
        const id = blocks[q]
        if (liquidFamilyTable[id] === 0) break // left the liquid (bed, shore, missing data)
        if (liquidGlowSource[id] === 0) continue
        r += liquidGlowTable[id * 3] * weight
        g += liquidGlowTable[id * 3 + 1] * weight
        b += liquidGlowTable[id * 3 + 2] * weight
      }
      columnGlow[c] = 1 - Math.exp(-r)
      columnGlow[c + 1] = 1 - Math.exp(-g)
      columnGlow[c + 2] = 1 - Math.exp(-b)
    }
  }
  // Corners in TOP-face vertex order: (x0,z0), (x1,z0), (x1,z1), (x0,z1)
  const CORNERS = [0, 0, 1, 0, 1, 1, 0, 1]
  for (let k = 0; k < 4; k++) {
    const cx = CORNERS[k * 2], cz = CORNERS[k * 2 + 1]
    for (let ch = 0; ch < 3; ch++) {
      let sum = 0
      for (let oz = 0; oz < 2; oz++) {
        for (let ox = 0; ox < 2; ox++) sum += columnGlow[((cz + oz) * 3 + cx + ox) * 3 + ch]
      }
      out[k * 3 + ch] = sum * 0.25
    }
  }
}

function updateNonGreedyTable(): void {
  if (!nonGreedyTableDirty) return
  nonGreedyTable.fill(0)
  for (const id of nonGreedyBlockIds) nonGreedyTable[id] = 1
  nonGreedyTableDirty = false
}

function updateFaceLayerTable(): void {
  if (!faceLayerTableDirty || !faceTextureMap) return
  let maxKey = 0
  for (const key of faceTextureMap.keys()) if (key > maxKey) maxKey = key
  const table = new Uint8Array(maxKey + 1)
  for (const [key, textureId] of faceTextureMap) {
    const layer = textureLayers?.get(textureId) ?? MISSING_TEXTURE_LAYER
    table[key] = layer <= CHUNK_MAX_TEXTURE_LAYER ? layer : MISSING_TEXTURE_LAYER
  }
  faceLayerTable = table
  faceLayerTableDirty = false
}

// ---------------------------------------------------------------------------
// Meshing
// ---------------------------------------------------------------------------

function emptyResponse(request: GreedyMeshRequest): GreedyMeshResponse {
  return {
    type: 'greedy-mesh-result',
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    subY: request.subY,
    jobId: request.jobId,
    opaque: null,
    cutout: null,
    nonGreedyBlocks: [],
    nonGreedyLights: [],
    nonGreedyMetadata: [],
    nonGreedyFaceVisibility: [],
    nonGreedyLiquidGlow: [],
  }
}

/**
 * True when any present face-neighbour shell cell is non-opaque, i.e. a fully
 * opaque sub-chunk could still expose a boundary face.
 */
function shellFacesHaveOpening(request: GreedyMeshRequest): boolean {
  const { shellBlocks, shellPresentMask } = request
  for (const region of SHELL_REGIONS) {
    if (!SHELL_FACE_INDICES.includes(region.index)) continue
    if ((shellPresentMask & (1 << region.index)) === 0) continue
    const end = region.offset + region.sizeX * region.sizeY * region.sizeZ
    for (let i = region.offset; i < end; i++) {
      if (opaqueTable[shellBlocks[i]] === 0) return true
    }
  }
  return false
}

/**
 * Collect per-instance data for non-greedy blocks (positions, light, metadata,
 * liquid face visibility) from the padded volume.
 */
function collectNonGreedy(request: GreedyMeshRequest, cells: Int32Array, count: number, response: GreedyMeshResponse): void {
  const { blocks, light } = volume
  const metadata = request.metadata
  const worldOffsetX = request.chunkX * CHUNK_SIZE_X
  const worldOffsetZ = request.chunkZ * CHUNK_SIZE_Z

  const positions = new Map<number, number[]>()
  const lights = new Map<number, number[]>()
  const metas = new Map<number, number[]>()
  const faceVis = new Map<number, number[]>()
  // Scatter glow (12 values per instance), only for lists that glow somewhere
  const glows = new Map<number, number[]>()
  const hasGlow = volumeHasGlowSources()
  const surfaceGlow = new Float32Array(12)
  const addGlow = (blockId: number, glow: Float32Array | null): void => {
    let list = glows.get(blockId)
    if (!list) {
      if (!glow) return
      // First glow in this list: earlier instances had none
      list = new Array((positions.get(blockId)!.length / 3 - 1) * 12).fill(0)
      glows.set(blockId, list)
    }
    for (let k = 0; k < 12; k++) list.push(glow ? glow[k] : 0)
  }
  const addInstance = (blockId: number, x: number, y: number, z: number, light: number, meta: number, visibleFaces: number, glow: Float32Array | null = null): void => {
    let list = positions.get(blockId)
    if (!list) {
      list = []
      positions.set(blockId, list)
      lights.set(blockId, [])
      metas.set(blockId, [])
      faceVis.set(blockId, [])
    }
    list.push(worldOffsetX + x, request.minWorldY + y, worldOffsetZ + z)
    lights.get(blockId)!.push(light)
    metas.get(blockId)!.push(meta)
    faceVis.get(blockId)!.push(visibleFaces)
    addGlow(blockId, glow)
  }

  for (let n = 0; n < count; n++) {
    const index = cells[n]
    const y = (index / (CHUNK_SIZE_X * CHUNK_SIZE_Z)) | 0
    const rem = index - y * CHUNK_SIZE_X * CHUNK_SIZE_Z
    const z = (rem / CHUNK_SIZE_X) | 0
    const x = rem - z * CHUNK_SIZE_X
    const p = PAD_ORIGIN + y * PAD_STRIDE_Y + z * PAD_STRIDE_Z + x
    const blockId = blocks[p]

    // Brightest sky and block light among the cell and its loaded neighbours
    // (opaque blocks such as a forge hold no light of their own)
    let sky = light[p] >> 4
    let block = light[p] & 15
    for (let f = 0; f < 6; f++) {
      const q = p + FACE_NEIGHBOR_DELTAS[f]
      if (blocks[q] === MISSING_BLOCK) continue
      const l = light[q]
      if ((l >> 4) > sky) sky = l >> 4
      if ((l & 15) > block) block = l & 15
    }
    const packedLight = (sky << 4) | block
    const meta = metadata ? metadata[index] : 0

    let visibleFaces = 0x3F // Non-liquid blocks show all faces
    const family = liquidFamilyTable[blockId]
    if (family !== 0) {
      // Liquid faces show only where they bound the liquid body:
      // - never toward a missing neighbour sub-chunk (never guessed);
      // - the TOP of a partial block (level < 8) always: its surface sits below
      //   the top of its cell, so nothing above it is flush with it (a stone
      //   ceiling or a waterfall above would otherwise leave an open slot);
      // - never toward an opaque block (never seen from outside; through
      //   translucent water they read as bed-step contour lines) or a liquid of
      //   another family (e.g. water meeting swamp water at a biome border - an
      //   internal sheet);
      // - TOP/BOTTOM: hidden against the same family (inside the liquid);
      // - sides: against the same family, shown only on the taller block of a
      //   height step (closing the step; equal levels - e.g. a waterfall
      //   landing in a pool - are one body of liquid), and only above the
      //   lower block's surface (below it the face would be a sheet inside
      //   that liquid, showing through its translucent surface).
      // The padded volume holds real neighbour data, so chunk and sub-chunk
      // borders follow the same rules as the interior.
      visibleFaces = 0
      const ownLevel = liquidLevelTable[blockId]
      for (let f = 0; f < 6; f++) {
        const neighborId = blocks[p + FACE_NEIGHBOR_DELTAS[f]]
        if (neighborId === MISSING_BLOCK) continue
        if (f === 0 && ownLevel < 8) {
          visibleFaces |= 1
          continue
        }
        if (opaqueTable[neighborId] === 1) continue
        const neighborFamily = liquidFamilyTable[neighborId]
        if (neighborFamily === 0) {
          visibleFaces |= 1 << f // air, plants, glass, ...
        } else if (f >= 2 && neighborFamily === family) {
          const neighborLevel = liquidLevelTable[neighborId]
          if (ownLevel > neighborLevel) {
            // Side of a height step within one liquid, from the lower surface up
            visibleFaces |= (1 << f) | (neighborLevel << (LIQUID_SIDE_CLIP_SHIFT + 4 * (f - 2)))
          }
        }
      }
    }
    // Glowing plants below light the surface (TOP faces only: the water's
    // other faces bound it against air, rarely seen)
    let glow: Float32Array | null = null
    if (hasGlow && family !== 0 && (visibleFaces & 1) !== 0) {
      liquidSurfaceGlow(p, y, surfaceGlow)
      for (let k = 0; k < 12; k++) {
        if (surfaceGlow[k] > 0.002) {
          glow = surfaceGlow
          break
        }
      }
    }
    // A submerged block's cell is also its liquid: draw the liquid's faces
    const drawAs = liquidDrawAsTable[blockId]
    addInstance(blockId, x, y, z, packedLight, meta, visibleFaces, drawAs !== 0 ? null : glow)
    if (drawAs !== 0) addInstance(drawAs, x, y, z, packedLight, 0, visibleFaces, glow)
  }

  for (const [blockId, list] of positions) {
    response.nonGreedyBlocks.push([blockId, new Float32Array(list)])
    response.nonGreedyLights.push([blockId, new Uint8Array(lights.get(blockId)!)])
    response.nonGreedyMetadata.push([blockId, new Uint8Array(metas.get(blockId)!)])
    response.nonGreedyFaceVisibility.push([blockId, new Uint32Array(faceVis.get(blockId)!)])
  }
  for (const [blockId, list] of glows) {
    const bytes = new Uint8Array(list.length)
    for (let i = 0; i < list.length; i++) bytes[i] = Math.min(255, Math.round(list[i] * 255))
    response.nonGreedyLiquidGlow.push([blockId, bytes])
  }
}

/**
 * Mesh one sub-chunk.
 */
function processSubChunk(request: GreedyMeshRequest): GreedyMeshResponse {
  const { blocks } = request

  // Pre-pass: early-outs and the non-greedy cell list
  let nonAir = 0
  let nonOpaque = 0
  let nonGreedyCount = 0
  for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
    const id = blocks[i]
    if (id === AIR) {
      nonOpaque++
      continue
    }
    nonAir++
    if (opaqueTable[id] === 0) nonOpaque++
    if (nonGreedyTable[id] === 1) nonGreedyCells[nonGreedyCount++] = i
  }

  const response = emptyResponse(request)
  // All air: nothing to draw
  if (nonAir === 0) return response
  // Fully buried: solid inside and every loaded boundary neighbour cell is solid
  if (nonOpaque === 0 && !shellFacesHaveOpening(request)) return response

  volume.fill(blocks, request.lightData, request.shellBlocks, request.shellLight, request.shellPresentMask)

  opaqueWriter.reset()
  cutoutWriter.reset()
  meshGreedyFaces(
    volume,
    { opaque: opaqueTable, nonGreedy: nonGreedyTable, faceLayer: faceLayerTable, quarterTurn: quarterTurnTable },
    opaqueWriter,
    cutoutWriter
  )
  response.opaque = opaqueWriter.finish()
  response.cutout = cutoutWriter.finish()

  if (nonGreedyCount > 0) {
    collectNonGreedy(request, nonGreedyCells, nonGreedyCount, response)
  }

  return response
}

// Worker message handler
self.onmessage = (event: MessageEvent<GreedyMeshRequest>) => {
  const data = event.data

  try {
    // Face texture map and texture layers arrive with a worker's first request
    // (and again if the main thread rebuilds them)
    if (data.faceTextureMapEntries) {
      faceTextureMap = deserializeFaceTextureMap(data.faceTextureMapEntries)
      faceLayerTableDirty = true
    }
    if (data.textureLayerEntries) {
      textureLayers = new Map(data.textureLayerEntries)
      faceLayerTableDirty = true
    }

    // Update non-greedy block IDs if provided
    if (data.nonGreedyBlockIds) {
      nonGreedyBlockIds = new Set(data.nonGreedyBlockIds)
      nonGreedyTableDirty = true
    }
    if (data.liquidBlockEntries) updateLiquidTables(data.liquidBlockEntries)
    if (data.liquidGlowEntries) updateLiquidGlowTable(data.liquidGlowEntries)

    // Ensure face texture map is available
    if (!faceTextureMap) {
      faceTextureMap = getCachedFaceTextureMap() ?? new Map()
      faceLayerTableDirty = true
    }

    updateOpaqueTable(data.opaqueBlockIds)
    updateNonGreedyTable()
    updateFaceLayerTable()

    const result = processSubChunk(data)

    // Collect transferable arrays
    const transfer: Transferable[] = []
    for (const group of [result.opaque, result.cutout]) {
      if (group) transfer.push(group.vertices.buffer, group.indices.buffer)
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
    for (const [, glow] of result.nonGreedyLiquidGlow) {
      transfer.push(glow.buffer)
    }

    self.postMessage(result, { transfer })
  } catch (error) {
    const errorResponse: GreedyMeshError = {
      type: 'greedy-mesh-error',
      chunkX: data.chunkX,
      chunkZ: data.chunkZ,
      subY: data.subY,
      jobId: data.jobId,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(errorResponse)
  }
}
