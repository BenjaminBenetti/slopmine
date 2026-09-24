import { SUB_CHUNK_VOLUME } from '../interfaces/IChunk.ts'
import { buildLodTile } from './LodTileBuilder.ts'
import { meshLodRegion } from './LodMesher.ts'
import {
  LOD_POSITION_SCALE,
  LOD_REGION_CHUNKS,
  LOD_REGION_SLOTS,
  lodRegionCoord,
  lodTileKey,
  type LodEvictRequest,
  type LodInitRequest,
  type LodMeshRegionRequest,
  type LodMeshRegionResult,
  type LodPaletteData,
  type LodTileRequest,
  type LodTileResult,
  type LodTileSummary,
} from './LodTypes.ts'

/** Scratch block buffers kept for reuse between tile builds. */
const MAX_POOLED_BUFFERS = 8

/**
 * Generates sub-chunk `subY` of the requested tile's column into `blocks`
 * (zeroed by the caller) with the surface-only pipeline.
 */
export type LodSubChunkGenerator = (request: LodTileRequest, subY: number, blocks: Uint16Array) => Promise<void>

/**
 * Worker-side LOD state for one ChunkGenerationWorker instance in the LOD
 * pool: the palette, this worker's cached tile summaries (tiles are routed
 * per region, so a region's tiles all live on one worker) and the tile /
 * region-mesh request handlers.
 */
export class LodWorkerService {
  private palette: LodPaletteData | null = null
  private readonly tiles = new Map<string, LodTileSummary>()
  private readonly bufferPool: Uint16Array[] = []

  /**
   * @param surfaceKind LOD_SURFACE_* kind per block id.
   * @param generateSubChunk Surface-only sub-chunk generation.
   * @param getTerrainMaxY Highest blended terrain height of the request's chunk.
   */
  constructor(
    private readonly surfaceKind: Uint8Array,
    private readonly generateSubChunk: LodSubChunkGenerator,
    private readonly getTerrainMaxY: (request: LodTileRequest) => number
  ) {}

  init(request: LodInitRequest): void {
    this.palette = request.palette
  }

  async buildTile(request: LodTileRequest): Promise<LodTileResult> {
    const start = performance.now()
    // Buffers stay checked out until the build finishes (builds may interleave)
    const checkedOut: Uint16Array[] = []
    try {
      const build = await buildLodTile(
        request.chunkX,
        request.chunkZ,
        this.getTerrainMaxY(request),
        async (subY) => {
          const blocks = this.bufferPool.pop() ?? new Uint16Array(SUB_CHUNK_VOLUME)
          checkedOut.push(blocks)
          blocks.fill(0)
          await this.generateSubChunk(request, subY, blocks)
          return blocks
        },
        this.surfaceKind
      )
      const { summary } = build
      this.tiles.set(lodTileKey(request.chunkX, request.chunkZ), summary)
      return {
        type: 'lod-tile-result',
        chunkX: request.chunkX,
        chunkZ: request.chunkZ,
        minTop: summary.minTop,
        maxTop: summary.maxTop,
        minFloor: summary.minFloor,
        flags: summary.flags,
        subChunksGenerated: build.subChunksGenerated,
        elapsedMs: performance.now() - start,
      }
    } finally {
      for (const blocks of checkedOut) {
        if (this.bufferPool.length < MAX_POOLED_BUFFERS) this.bufferPool.push(blocks)
      }
    }
  }

  meshRegion(request: LodMeshRegionRequest): LodMeshRegionResult {
    if (!this.palette) {
      throw new Error('LOD palette not initialized (send lod-init first)')
    }
    const start = performance.now()
    const originX = request.regionX * LOD_REGION_CHUNKS
    const originZ = request.regionZ * LOD_REGION_CHUNKS
    const tiles: (LodTileSummary | undefined)[] = new Array(LOD_REGION_SLOTS)
    let tileCount = 0
    for (let slot = 0; slot < LOD_REGION_SLOTS; slot++) {
      const chunkX = originX + (slot % LOD_REGION_CHUNKS)
      const chunkZ = originZ + Math.floor(slot / LOD_REGION_CHUNKS)
      const tile = this.tiles.get(lodTileKey(chunkX, chunkZ))
      tiles[slot] = tile
      if (tile) tileCount++
    }

    const mesh = meshLodRegion({
      cellSize: request.cellSize,
      chunkCellSizes: request.chunkCellSizes,
      tiles,
      neighborMinFloor: request.neighborMinFloor,
      palette: this.palette,
    })

    // Vertical extent for the renderer's bounds (positions are in half blocks)
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 1; i < mesh.positions.length; i += 3) {
      const y = mesh.positions[i]
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    if (maxY < minY) minY = maxY = 0

    return {
      type: 'lod-mesh-result',
      requestId: request.requestId,
      regionX: request.regionX,
      regionZ: request.regionZ,
      cellSize: request.cellSize,
      positions: mesh.positions,
      colors: mesh.colors,
      indices: mesh.indices,
      chunkMaskLo: mesh.chunkMaskLo,
      chunkMaskHi: mesh.chunkMaskHi,
      minY: minY * LOD_POSITION_SCALE,
      maxY: maxY * LOD_POSITION_SCALE,
      tileCount,
      elapsedMs: performance.now() - start,
    }
  }

  evict(request: LodEvictRequest): void {
    if (request.regions.length > 0) {
      const regions = new Set<string>()
      for (let i = 0; i + 1 < request.regions.length; i += 2) {
        regions.add(request.regions[i] + ',' + request.regions[i + 1])
      }
      for (const [key, tile] of this.tiles) {
        if (regions.has(lodRegionCoord(tile.chunkX) + ',' + lodRegionCoord(tile.chunkZ))) {
          this.tiles.delete(key)
        }
      }
    }
    const chunks = request.chunks
    if (chunks) {
      for (let i = 0; i + 1 < chunks.length; i += 2) {
        this.tiles.delete(lodTileKey(chunks[i], chunks[i + 1]))
      }
    }
  }
}
