import type { IChunkCoordinate, ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import { UNLOAD_HYSTERESIS_CHUNKS } from '../generate/GenerationConfig.ts'
import type { SurfaceBand } from '../generate/WorldGenerator.ts'
import type { ILodRegionRenderer } from './interfaces/ILodRegionRenderer.ts'
import type { ILodWorldSource } from './interfaces/ILodWorldSource.ts'
import { LodColumnReadiness } from './LodColumnReadiness.ts'
import { LodWorkerPool, defaultLodWorkerCount } from './LodWorkerPool.ts'
import {
  LOD_MIN_MARGIN_CHUNKS,
  LOD_NEIGHBOR_COUNT,
  LOD_REGION_CHUNKS,
  LOD_REGION_SLOTS,
  LOD_SIDE_EAST,
  LOD_SIDE_NORTH,
  LOD_SIDE_SOUTH,
  LOD_SIDE_WEST,
  lodNeighborIndex,
  lodChunkSlot,
  lodPackKey,
  lodRegionCoord,
  type LodCellSize,
  type LodErrorResult,
  type LodMeshRegionResult,
  type LodPaletteData,
  type LodTileResult,
  type LodWorkerResponse,
} from './LodTypes.ts'

// ==================== Tuning ====================

/** Camera Y below which LOD hides (caves, Hell): the far surface is out of sight. */
const HIDE_BELOW_Y = 180
/** The camera must climb this far back above HIDE_BELOW_Y before LOD shows again. */
const SHOW_HYSTERESIS_Y = 4
/**
 * Columns this close to the player (chunks) always show full detail, ready or
 * not - the player must never stand in or next to a hidden column.
 */
const NEAR_RADIUS_CHUNKS = 2
/** Tiles are dropped once this far beyond the LOD distance (chunks). */
const TILE_UNLOAD_HYSTERESIS_CHUNKS = 1
/** Tile requests in flight per worker; 1 while full-detail generation has a queue. */
const MAX_TILES_IN_FLIGHT = 2
const BUSY_TILES_IN_FLIGHT = 1
/** Region remeshes are coalesced to at most one per this interval... */
const MIN_REMESH_INTERVAL_MS = 250
/** ...and to at most 1/REMESH_COST_FACTOR of the owning worker's time per region. */
const REMESH_COST_FACTOR = 5
/** Remesh interval for regions beyond CELL2_DISTANCE_CHUNKS (deep in the haze). */
const FAR_REMESH_INTERVAL_MS = 2000
/**
 * Remesh interval for a region that already shows a mesh while tiles of it
 * are still being built: a burst of arrivals makes one remesh, not one each.
 */
const LOADING_REMESH_INTERVAL_MS = 1000
/**
 * Tiles leaving the ring are hidden through the region's slot mask instead
 * of a remesh; the region drops their geometry at its next remesh, or after
 * this long.
 */
const DROPPED_REMESH_DELAY_MS = 4000
/**
 * The ring (desired set and cell sizes) is re-centred only once the player
 * is this many chunks (Chebyshev) from its centre, so a straight flight
 * rebuilds it every STEP crossings, not every crossing (each rebuild moves
 * the ring's front and back arcs and the cell-size bands through most
 * regions). Between rebuilds the ring's edge can be up to (STEP - 1) * sqrt 2
 * chunks nearer the player on one side; the ring isn't widened for that -
 * at d=8 / LOD 24 that edge still lies where the distance fog's edge fade is
 * ~98% (fog far = 0.97 x the LOD distance), and widening by a chunk costs
 * ~9% more tiles and ~6% more LOD triangles. The cell-size bands near the
 * player are widened by CELL_BAND_MARGIN instead (handoff heights exact).
 */
const RECENTER_STEP_CHUNKS = 2
const CELL_BAND_MARGIN_CHUNKS = RECENTER_STEP_CHUNKS - 1
/**
 * Cell size of each chunk by its distance from the ring centre: c=1 in the
 * handoff annulus around the full-detail edge (chunkDistance -
 * CELL1_INNER_MARGIN .. chunkDistance + CELL1_MARGIN, widened by
 * CELL_BAND_MARGIN), so heights are exact where LOD meets full detail; c=2 inside
 * it (the disk interior shows full detail; its LOD only stands in for columns
 * that aren't ready) and out to CELL2_DISTANCE, c=4 beyond. Switching coarser
 * waits CELL_HYSTERESIS further. Chosen per chunk, not per region.
 */
const CELL1_MARGIN_CHUNKS = 2
const CELL1_INNER_MARGIN_CHUNKS = 2
const CELL2_DISTANCE_CHUNKS = 16
const CELL_HYSTERESIS_CHUNKS = 1
/** Tile build attempts before a chunk is given up on (worker errors). */
const MAX_TILE_ATTEMPTS = 3
/** A worker with requests in flight and no reply for this long is replaced. */
const DEFAULT_WORKER_STALL_MS = 20000

// ==================== State ====================

const TILE_PENDING = 0
const TILE_IN_FLIGHT = 1
const TILE_READY = 2
const TILE_FAILED = 3
/** Left the desired set; skipped by the pending list until it is rebuilt. */
const TILE_DROPPED = 4

/** Reveal states of the columns around the player (see computeRevealed). */
const REVEAL_LOD = 0
const REVEAL_FULL = 1
const REVEAL_NO_LOD = 2

interface LodTile {
  readonly chunkX: number
  readonly chunkZ: number
  readonly key: number
  readonly region: LodRegion
  status: number
  attempts: number
  /** Squared chunk distance from the ring centre (pending-list order). */
  distance2: number
  minTop: number
  maxTop: number
  minFloor: number
  /** Cell size this chunk is meshed at (see CELL1_MARGIN_CHUNKS). */
  cellSize: LodCellSize
  /** minTop/maxTop/minFloor hold a built result (kept while it is re-fetched). */
  known: boolean
  /** Built before, but its worker was lost: re-fetching the summary the region mesh needs. */
  refetching: boolean
}

interface LodRegion {
  readonly regionX: number
  readonly regionZ: number
  readonly key: number
  readonly worker: number
  /** Desired tiles in this region; the region goes when it reaches 0. */
  tileCount: number
  /** Tiles arrived / left, a chunk's cell size or neighbour floors changed since the last mesh request. */
  dirty: boolean
  /** Chunks from the player to the region's nearest chunk. */
  distance: number
  /** Request id of the mesh job in flight (0 = none). */
  meshRequestId: number
  lastMeshSentAt: number
  lastMeshMs: number
  /** The displayed mesh's chunk-slot geometry bits (0/0 = no mesh). */
  geometryLo: number
  geometryHi: number
  /** Slots whose tile left the ring but whose geometry the displayed mesh still has (hidden). */
  droppedLo: number
  droppedHi: number
  /** When the first of those tiles was dropped (see DROPPED_REMESH_DELAY_MS). */
  droppedSince: number
  /** neighborMinFloor sent with the last mesh request (null = none sent). */
  sentNeighborMinFloor: Int16Array | null
  /**
   * Tiles being re-fetched after the region's worker was lost. The region is
   * not remeshed until they are back (the displayed mesh stays meanwhile) -
   * a mesh without them would drop those chunks from the far terrain.
   */
  refetching: number
}

export interface LodManagerOptions {
  readonly enabled: boolean
  /** LOD distance in chunks. */
  readonly distance: number
  /**
   * Per-block LOD colours (buildLodPalette); meshing starts once it resolves.
   * A function is called the first time LOD is enabled (nothing is decoded
   * while Far Terrain stays off).
   */
  readonly palette: Promise<LodPaletteData> | (() => Promise<LodPaletteData>)
  readonly workerCount?: number
  /** Replace a worker that has requests in flight and hasn't replied for this long (ms). */
  readonly workerStallMs?: number
}

export interface LodStats {
  readonly enabled: boolean
  /** LOD terrain is drawn (enabled and the camera above ground). */
  readonly active: boolean
  readonly distance: number
  readonly tilesReady: number
  readonly tilesDesired: number
  readonly tilesInFlight: number
  readonly regions: number
  readonly regionsMeshed: number
  readonly meshesInFlight: number
  readonly meshResultsQueued: number
  /** Chunks whose LOD is hidden because full detail shows there. */
  readonly handedOffChunks: number
  /** Full-detail columns held back until complete (atomic reveal). */
  readonly heldBackColumns: number
}

/**
 * Far-terrain LOD coordinator (main thread).
 *
 * - Keeps the desired set: every chunk within the LOD distance, requested
 *   nearest-first from the LOD worker pool as surface-band tiles. The set is
 *   updated incrementally on chunk crossings; tiles already built stay.
 * - Meshes 8x8-chunk regions in the worker that holds their tiles (sticky
 *   routing), coalescing remeshes, and applies at most one region mesh per
 *   frame through the apply task.
 * - Hands off to full detail per column: a column is ready once every
 *   sub-chunk of its surface band (from its tile) is generated and meshed,
 *   and revealed once it and its neighbours toward the player are. Revealed
 *   columns hide their LOD chunk slot; the others hide their partial full
 *   detail instead (atomic reveal), except near the player.
 * - Feeds exact surface bands to world generation so every in-range column
 *   loads the sub-chunks its tile says hold its surface.
 */
export class LodManager {
  /** Created the first time LOD is enabled (see ensurePool): no idle workers while Far Terrain is off. */
  private pool: LodWorkerPool | null = null
  private readonly workerCount: number
  private palettePromise: Promise<LodPaletteData> | null = null
  private readonly paletteSource: () => Promise<LodPaletteData>
  private palette: LodPaletteData | null = null
  private readonly readiness = new LodColumnReadiness()
  private readonly tiles = new Map<number, LodTile>()
  private readonly regions = new Map<number, LodRegion>()
  /** Pending tiles nearest-first (lazy deletion: entries may have moved on). */
  private pendingTiles: LodTile[] = []
  private pendingCursor = 0
  /** Regions nearest-first (rebuilt with the desired set). */
  private regionOrder: LodRegion[] = []
  private readonly tilesInFlight: number[]
  private readonly meshInFlight: boolean[]
  /** Per worker: last reply, or last moment it had nothing in flight (stall watchdog). */
  private readonly lastProgressAt: number[]
  private readonly workerStallMs: number
  /**
   * Unapplied mesh per region key, applied oldest first. A region with a
   * result waiting is not remeshed until it is applied (see pumpMeshing), so
   * a frequently dirtied region can't keep replacing its result and moving
   * to the back of the queue - that starved the leading edge of a flight.
   */
  private readonly meshResults = new Map<number, LodMeshRegionResult>()
  /** Full-detail columns hidden this frame (atomic reveal). */
  private readonly hiddenColumns = new Set<number>()
  /**
   * REVEAL_* state of each column of the reveal box (side 2 * revealReach + 1,
   * centred on the player's chunk) this frame; see computeRevealed.
   */
  private revealed = new Uint8Array(0)
  /** Reveal-box indices ordered inner-first (|dx| + |dz| ascending). */
  private revealOrder = new Int32Array(0)
  private revealReach = -1
  /**
   * Columns revealed (REVEAL_FULL) by the previous computeRevealed. A column
   * is first revealed only once its band meshes are current; after that a
   * transient staleness (a neighbour's data arriving, remesh on its way)
   * doesn't flip it back to LOD.
   */
  private shownColumns = new Set<number>()
  private nextShownColumns = new Set<number>()
  private readonly unsubscribers: Array<() => void> = []
  private nextRequestId = 1

  private enabled: boolean
  private distanceSetting: number
  /** LOD distance the current desired set was built for, 0 = none built. */
  private ringDistance = 0
  /** Full-detail distance the cell sizes were chosen for. */
  private ringChunkDistance = 0
  private tilesReady = 0
  /** The player's chunk (reveal box, handoff). */
  private centerX = 0
  private centerZ = 0
  /** Centre of the desired set and cell sizes (see RECENTER_STEP_CHUNKS). */
  private ringCenterX = 0
  private ringCenterZ = 0
  private cameraAboveGround = true
  private active = false
  private visibilityDirty = true
  /** See getCoveredDistance. */
  private coveredDistance = 0
  private coverageDirty = true
  private handedOffChunks = 0

  constructor(
    private readonly source: ILodWorldSource,
    private readonly renderer: ILodRegionRenderer,
    options: LodManagerOptions
  ) {
    this.enabled = options.enabled
    this.distanceSetting = options.distance
    const workerCount = options.workerCount ?? defaultLodWorkerCount()
    this.workerCount = workerCount
    this.tilesInFlight = new Array<number>(workerCount).fill(0)
    this.meshInFlight = new Array<boolean>(workerCount).fill(false)
    this.lastProgressAt = new Array<number>(workerCount).fill(performance.now())
    this.workerStallMs = options.workerStallMs ?? DEFAULT_WORKER_STALL_MS
    const palette = options.palette
    this.paletteSource = typeof palette === 'function' ? palette : () => palette
    if (this.enabled) this.ensurePool()

    this.source.setSurfaceBandProvider((chunkX, chunkZ) => this.getSurfaceBand(chunkX, chunkZ))
    this.unsubscribers.push(
      this.source.onSubChunkApplied((coordinate) =>
        this.readiness.onSubChunkApplied(Number(coordinate.x), Number(coordinate.z), coordinate.subY)
      ),
      this.source.onColumnUnloaded((coordinate) => {
        this.readiness.onColumnUnloaded(Number(coordinate.x), Number(coordinate.z))
        // Reloaded data must be current before the column is revealed again
        this.shownColumns.delete(lodPackKey(Number(coordinate.x), Number(coordinate.z)))
      })
    )
    if (this.source.onSubChunkUnloaded) {
      this.unsubscribers.push(
        this.source.onSubChunkUnloaded((coordinate) => {
          this.readiness.onSubChunkUnloaded(Number(coordinate.x), Number(coordinate.z), coordinate.subY)
          this.shownColumns.delete(lodPackKey(Number(coordinate.x), Number(coordinate.z)))
        })
      )
    }
    this.renderer.setVisible(false)
  }

  // ==================== Settings ====================

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    if (enabled) this.ensurePool()
    this.active = enabled && this.cameraAboveGround
    if (!enabled) this.clear()
    this.visibilityDirty = true
  }

  /** LOD distance in chunks (raised to chunkDistance + 2 if smaller). */
  setDistance(chunks: number): void {
    this.distanceSetting = chunks
  }

  /** Effective LOD distance in chunks. */
  getDistance(): number {
    return Math.max(this.distanceSetting, this.source.getConfig().chunkDistance + LOD_MIN_MARGIN_CHUNKS)
  }

  /** LOD terrain is being drawn (enabled and the camera above ground). */
  isActive(): boolean {
    return this.active
  }

  /**
   * How far (chunks from the ring centre) the drawn LOD ring reaches without
   * a gap: every desired chunk beyond the full-detail distance and nearer
   * than this is built and in its region's displayed mesh. Equals the LOD
   * distance once the ring is complete; while it is still being built (Far
   * Terrain just turned on, after a teleport) the fog should end here, not at
   * the LOD distance - the partial ring would otherwise end in a hard cut.
   */
  getCoveredDistance(): number {
    if (!this.coverageDirty) return this.coveredDistance
    this.coverageDirty = false
    const inner = this.source.getConfig().chunkDistance
    const inner2 = inner * inner
    let minMissing2 = Infinity
    for (const tile of this.tiles.values()) {
      if (tile.distance2 <= inner2 || tile.distance2 >= minMissing2 || tile.status === TILE_FAILED) continue
      if (tile.status !== TILE_READY || !this.hasLodGeometry(tile.chunkX, tile.chunkZ)) minMissing2 = tile.distance2
    }
    this.coveredDistance = minMissing2 === Infinity ? this.ringDistance : Math.max(inner, Math.sqrt(minMissing2) - 1)
    return this.coveredDistance
  }

  /**
   * Start the LOD worker pool and the palette the first time LOD is enabled
   * (they stay up for re-enabling).
   */
  private ensurePool(): void {
    if (this.pool) return
    this.pool = new LodWorkerPool(
      this.workerCount,
      (worker, response) => this.onWorkerResponse(worker, response),
      (worker) => this.onWorkerLost(worker)
    )
    if (this.palette) {
      this.pool.setInitMessage({ type: 'lod-init', palette: this.palette })
      return
    }
    this.palettePromise ??= this.paletteSource()
    this.palettePromise
      .then((palette) => {
        this.palette = palette
        this.pool?.setInitMessage({ type: 'lod-init', palette })
        this.pumpMeshing(performance.now())
      })
      // Tiles still feed exact surface bands to world generation
      .catch((error) => console.error('[LodManager] LOD palette failed; far terrain will not render:', error))
  }

  // ==================== Per-frame entry points ====================

  /**
   * Follow the camera: rebuild the desired set on chunk crossings or setting
   * changes, then dispatch tile and mesh jobs. Call every frame (LOD queue
   * task, and during loading).
   */
  update(cameraX: number, cameraY: number, cameraZ: number): void {
    // Above-ground test with hysteresis
    const aboveGround = this.cameraAboveGround
      ? cameraY >= HIDE_BELOW_Y
      : cameraY >= HIDE_BELOW_Y + SHOW_HYSTERESIS_Y
    if (aboveGround !== this.cameraAboveGround) {
      this.cameraAboveGround = aboveGround
      this.visibilityDirty = true
    }
    const active = this.enabled && aboveGround
    if (active !== this.active) {
      this.active = active
      this.visibilityDirty = true
    }
    if (!this.enabled) return
    this.ensurePool()

    const chunkX = Math.floor(cameraX / CHUNK_SIZE_X)
    const chunkZ = Math.floor(cameraZ / CHUNK_SIZE_Z)
    const distance = this.getDistance()
    const chunkDistance = this.source.getConfig().chunkDistance
    if (chunkX !== this.centerX || chunkZ !== this.centerZ) {
      this.centerX = chunkX
      this.centerZ = chunkZ
      this.visibilityDirty = true
    }
    if (
      Math.max(Math.abs(chunkX - this.ringCenterX), Math.abs(chunkZ - this.ringCenterZ)) >= RECENTER_STEP_CHUNKS ||
      distance !== this.ringDistance || chunkDistance !== this.ringChunkDistance
    ) {
      this.ringCenterX = chunkX
      this.ringCenterZ = chunkZ
      this.ringChunkDistance = chunkDistance
      this.rebuildDesiredSet(distance)
    }

    this.checkStalledWorkers(performance.now())
    this.pumpTiles()
    this.pumpMeshing(performance.now())
  }

  /**
   * Apply one finished region mesh (the LOD apply task, one unit per frame
   * so GPU uploads spread out). Returns true while more are waiting.
   */
  applyNextMeshResult(): boolean {
    const next = this.meshResults.entries().next()
    if (next.done) return false
    const [key, result] = next.value
    this.meshResults.delete(key)

    const region = this.regions.get(key)
    if (region) {
      this.renderer.setRegionMesh(result)
      region.geometryLo = result.chunkMaskLo
      region.geometryHi = result.chunkMaskHi
      // Tiles dropped before this mesh was requested aren't in it any more
      region.droppedLo &= region.geometryLo
      region.droppedHi &= region.geometryHi
      this.visibilityDirty = true
      this.coverageDirty = true
    }
    return this.meshResults.size > 0
  }

  /**
   * The WebGL context was lost. Region geometry frees its JS arrays once
   * uploaded, so three.js could not re-upload it on restore: drop every
   * region mesh and remesh it from the workers' cached tiles (the new meshes
   * upload once the context is back). Mirrors WorldManager's chunk rebuild.
   */
  onContextLost(): void {
    for (const region of this.regions.values()) {
      this.renderer.removeRegion(region.regionX, region.regionZ)
      region.geometryLo = 0
      region.geometryHi = 0
      region.droppedLo = 0
      region.droppedHi = 0
      region.dirty = true
      region.lastMeshSentAt = -Infinity
    }
    this.visibilityDirty = true
    this.coverageDirty = true
  }

  /**
   * Recompute the handoff (LOD chunk masks and held-back full-detail columns)
   * when anything it depends on changed. Call once per frame, after mesh
   * results were applied and before rendering - a re-mesh removes and re-adds
   * a sub-chunk mesh within one frame, so per-event evaluation would flicker.
   */
  updateVisibility(): void {
    if (this.readiness.consumeChanged()) this.visibilityDirty = true
    if (!this.visibilityDirty) return
    this.visibilityDirty = false

    this.hiddenColumns.clear()
    this.handedOffChunks = 0
    this.renderer.setVisible(this.active)
    // (shownColumns survives a spell below HIDE_BELOW_Y: columns shown before
    // stay shown on return unless they unloaded meanwhile - see the unload
    // subscriptions - instead of all re-qualifying with current meshes and
    // flipping to LOD for seconds)
    if (!this.active) return

    // Only chunks that can hold loaded full detail can hand off (columns
    // unload beyond chunkDistance + hysteresis)
    const reach = Math.ceil(this.source.getConfig().chunkDistance + UNLOAD_HYSTERESIS_CHUNKS) + 1
    const side = 2 * reach + 1
    this.computeRevealed(reach)
    for (const region of this.regions.values()) {
      if (region.geometryLo === 0 && region.geometryHi === 0) continue
      const originX = region.regionX * LOD_REGION_CHUNKS
      const originZ = region.regionZ * LOD_REGION_CHUNKS
      // The region's local chunk range inside the reach box (often empty)
      const x0 = Math.max(0, this.centerX - reach - originX)
      const x1 = Math.min(LOD_REGION_CHUNKS - 1, this.centerX + reach - originX)
      const z0 = Math.max(0, this.centerZ - reach - originZ)
      const z1 = Math.min(LOD_REGION_CHUNKS - 1, this.centerZ + reach - originZ)
      // (Chunks that left the ring stay hidden until the region is remeshed)
      let hiddenLo = region.droppedLo
      let hiddenHi = region.droppedHi
      for (let localZ = z0; localZ <= z1; localZ++) {
        for (let localX = x0; localX <= x1; localX++) {
          const slot = localZ * LOD_REGION_CHUNKS + localX
          const bit = 1 << (slot & 31)
          if (((slot < 32 ? region.geometryLo : region.geometryHi) & bit) === 0) continue
          const chunkX = originX + localX
          const chunkZ = originZ + localZ
          const dx = chunkX - this.centerX
          const dz = chunkZ - this.centerZ
          if (this.revealed[(dz + reach) * side + dx + reach] === REVEAL_FULL) {
            // Full detail shows here
            if (slot < 32) hiddenLo |= bit
            else hiddenHi |= bit
            this.handedOffChunks++
          } else if (this.readiness.hasAnyMesh(chunkX, chunkZ)) {
            // LOD shows here; hold back the partial full detail
            this.hiddenColumns.add(lodPackKey(chunkX, chunkZ))
          }
        }
      }
      this.renderer.setRegionHiddenMask(region.regionX, region.regionZ, hiddenLo >>> 0, hiddenHi >>> 0)
    }
  }

  /**
   * Decide which columns of the reveal box show full detail (REVEAL_FULL):
   * those within the near radius, and ready columns whose neighbours toward
   * the player (one per axis the column is offset along) aren't LOD.
   *
   * The inward rule keeps seams sealed. Full detail culls a column's side
   * faces against its neighbour's solid blocks, so a revealed column beside
   * a neighbour still standing in as LOD has no side there - and when that
   * neighbour is lower and lies between the camera and the column, rays
   * over it look into the column's interior. Revealing from the player
   * outward means every seam between full detail and LOD faces away from
   * the camera, where LOD's own walls and skirts close it. A neighbour
   * without LOD geometry (tile not built or failed) shows whatever full
   * detail it has, as without LOD, and doesn't hold its outer columns back.
   */
  private computeRevealed(reach: number): void {
    const side = 2 * reach + 1
    if (reach !== this.revealReach) {
      this.revealReach = reach
      this.revealed = new Uint8Array(side * side)
      const order: number[] = []
      for (let index = 0; index < side * side; index++) order.push(index)
      const rank = (index: number): number =>
        Math.abs((index % side) - reach) + Math.abs(Math.floor(index / side) - reach)
      order.sort((a, b) => rank(a) - rank(b))
      this.revealOrder = Int32Array.from(order)
    }

    const near2 = NEAR_RADIUS_CHUNKS * NEAR_RADIUS_CHUNKS
    const revealed = this.revealed
    const shown = this.nextShownColumns
    shown.clear()
    for (const index of this.revealOrder) {
      const dx = (index % side) - reach
      const dz = Math.floor(index / side) - reach
      const chunkX = this.centerX + dx
      const chunkZ = this.centerZ + dz
      const key = lodPackKey(chunkX, chunkZ)
      // Inward neighbours have a smaller |dx| + |dz|, so they are already set
      if (
        dx * dx + dz * dz <= near2 ||
        ((dx === 0 || revealed[index - Math.sign(dx)] !== REVEAL_LOD) &&
          (dz === 0 || revealed[index - Math.sign(dz) * side] !== REVEAL_LOD) &&
          this.isColumnReady(chunkX, chunkZ, !this.shownColumns.has(key)))
      ) {
        revealed[index] = REVEAL_FULL
        shown.add(key)
      } else {
        revealed[index] = this.hasLodGeometry(chunkX, chunkZ) ? REVEAL_LOD : REVEAL_NO_LOD
      }
    }
    this.nextShownColumns = this.shownColumns
    this.shownColumns = shown
  }

  /** The displayed LOD mesh of the chunk's region has geometry in its slot. */
  private hasLodGeometry(chunkX: number, chunkZ: number): boolean {
    const regionX = lodRegionCoord(chunkX)
    const regionZ = lodRegionCoord(chunkZ)
    const region = this.regions.get(lodPackKey(regionX, regionZ))
    if (!region) return false
    const slot = lodChunkSlot(chunkX, chunkZ)
    return (((slot < 32 ? region.geometryLo : region.geometryHi) >>> (slot & 31)) & 1) === 1
  }

  /**
   * Chunk visibility filter for the renderer: false for full-detail columns
   * held back while their LOD stands in (see updateVisibility).
   */
  isFullDetailVisible(coordinate: IChunkCoordinate): boolean {
    if (this.hiddenColumns.size === 0) return true
    return !this.hiddenColumns.has(lodPackKey(Number(coordinate.x), Number(coordinate.z)))
  }

  // ==================== Full-detail mesh events ====================

  /** `current`: built from the current data of the sub-chunk and its neighbours (see WorldManager). */
  onSubChunkMeshAdded(coordinate: ISubChunkCoordinate, current = true): void {
    this.readiness.onMeshAdded(Number(coordinate.x), Number(coordinate.z), coordinate.subY, current)
  }

  /** A displayed mesh stopped being current (data arrived nearby; its remesh follows). */
  onSubChunkMeshStale(coordinate: ISubChunkCoordinate): void {
    this.readiness.onMeshStale(Number(coordinate.x), Number(coordinate.z), coordinate.subY)
  }

  onSubChunkMeshRemoved(coordinate: ISubChunkCoordinate): void {
    this.readiness.onMeshRemoved(Number(coordinate.x), Number(coordinate.z), coordinate.subY)
  }

  // ==================== Stats ====================

  getStats(): LodStats {
    let regionsMeshed = 0
    let meshesInFlight = 0
    for (const region of this.regions.values()) {
      if (region.geometryLo !== 0 || region.geometryHi !== 0) regionsMeshed++
      if (region.meshRequestId !== 0) meshesInFlight++
    }
    return {
      enabled: this.enabled,
      active: this.active,
      distance: this.getDistance(),
      tilesReady: this.tilesReady,
      tilesDesired: this.tiles.size,
      tilesInFlight: this.tilesInFlight.reduce((sum, n) => sum + n, 0),
      regions: this.regions.size,
      regionsMeshed,
      meshesInFlight,
      meshResultsQueued: this.meshResults.size,
      handedOffChunks: this.handedOffChunks,
      heldBackColumns: this.hiddenColumns.size,
    }
  }

  dispose(): void {
    this.clear()
    this.source.setSurfaceBandProvider(null)
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.pool?.dispose()
  }

  // ==================== Desired set ====================

  /**
   * Rebuild the desired set around the current centre: add every chunk
   * within `distance`, drop tiles beyond distance + hysteresis, and re-sort
   * the pending list and regions nearest-first.
   */
  private rebuildDesiredSet(distance: number): void {
    this.ringDistance = distance
    const want = distance
    const keep = want + TILE_UNLOAD_HYSTERESIS_CHUNKS
    const keep2 = keep * keep
    const want2 = want * want
    const evictChunks: number[][] = Array.from({ length: this.workerCount }, () => [])
    const now = performance.now()

    // Drop tiles that left the ring; update the others' cell sizes
    for (const tile of this.tiles.values()) {
      const dx = tile.chunkX - this.ringCenterX
      const dz = tile.chunkZ - this.ringCenterZ
      const d2 = dx * dx + dz * dz
      tile.distance2 = d2
      if (d2 <= keep2) {
        const cellSize = this.cellSizeFor(Math.sqrt(d2), tile.cellSize)
        if (cellSize !== tile.cellSize) {
          tile.cellSize = cellSize
          tile.region.dirty = true
        }
        continue
      }
      if (tile.status === TILE_READY || tile.status === TILE_IN_FLIGHT) {
        evictChunks[tile.region.worker].push(tile.chunkX, tile.chunkZ)
      }
      this.dropTile(tile, now)
    }

    // Add newly wanted chunks
    for (let dz = -want; dz <= want; dz++) {
      for (let dx = -want; dx <= want; dx++) {
        const d2 = dx * dx + dz * dz
        if (d2 > want2) continue
        const chunkX = this.ringCenterX + dx
        const chunkZ = this.ringCenterZ + dz
        const key = lodPackKey(chunkX, chunkZ)
        if (this.tiles.has(key)) continue
        const region = this.getOrCreateRegion(lodRegionCoord(chunkX), lodRegionCoord(chunkZ))
        region.tileCount++
        // Back in the ring: its old geometry (if the displayed mesh still has it) may show again
        const slot = lodChunkSlot(chunkX, chunkZ)
        if (slot < 32) region.droppedLo &= ~(1 << slot)
        else region.droppedHi &= ~(1 << (slot - 32))
        this.tiles.set(key, {
          chunkX,
          chunkZ,
          key,
          region,
          status: TILE_PENDING,
          attempts: 0,
          distance2: d2,
          minTop: 0,
          maxTop: 0,
          minFloor: 0,
          cellSize: this.cellSizeFor(Math.sqrt(d2), undefined),
          known: false,
          refetching: false,
        })
      }
    }

    // Tell workers to forget dropped tiles; remove emptied regions
    const pool = this.pool
    for (let worker = 0; worker < evictChunks.length; worker++) {
      if (pool && evictChunks[worker].length > 0 && pool.isReady(worker)) {
        pool.post(worker, { type: 'lod-evict', regions: new Int32Array(0), chunks: Int32Array.from(evictChunks[worker]) })
      }
    }
    for (const region of [...this.regions.values()]) {
      if (region.tileCount === 0) this.removeRegion(region)
    }

    this.pendingTiles = [...this.tiles.values()].filter((tile) => tile.status === TILE_PENDING)
    this.pendingTiles.sort((a, b) => a.distance2 - b.distance2)
    this.pendingCursor = 0

    for (const region of this.regions.values()) region.distance = this.regionDistance(region)
    this.regionOrder = [...this.regions.values()].sort((a, b) => a.distance - b.distance)
    this.visibilityDirty = true
    this.coverageDirty = true
  }

  /**
   * A tile left the ring: hide its geometry through the region's slot mask
   * rather than remeshing the region for it (see DROPPED_REMESH_DELAY_MS).
   * (Neighbour regions keep their skirts toward it: the ring's outer edge.)
   */
  private dropTile(tile: LodTile, now: number): void {
    if (tile.status === TILE_READY) this.tilesReady--
    this.endRefetch(tile)
    tile.status = TILE_DROPPED
    this.tiles.delete(tile.key)
    const region = tile.region
    region.tileCount--
    const slot = lodChunkSlot(tile.chunkX, tile.chunkZ)
    const bit = 1 << (slot & 31)
    if (((slot < 32 ? region.geometryLo : region.geometryHi) & bit) !== 0) {
      if (region.droppedLo === 0 && region.droppedHi === 0) region.droppedSince = now
      if (slot < 32) region.droppedLo |= bit
      else region.droppedHi |= bit
    }
    this.visibilityDirty = true
  }

  private getOrCreateRegion(regionX: number, regionZ: number): LodRegion {
    const key = lodPackKey(regionX, regionZ)
    let region = this.regions.get(key)
    if (!region) {
      region = {
        regionX,
        regionZ,
        key,
        // (Same routing as LodWorkerPool.workerForRegion: neighbouring regions on different workers)
        worker: (((regionX + regionZ) % this.workerCount) + this.workerCount) % this.workerCount,
        tileCount: 0,
        dirty: false,
        distance: Infinity,
        meshRequestId: 0,
        lastMeshSentAt: -Infinity,
        lastMeshMs: 0,
        geometryLo: 0,
        geometryHi: 0,
        droppedLo: 0,
        droppedHi: 0,
        droppedSince: 0,
        sentNeighborMinFloor: null,
        refetching: 0,
      }
      region.distance = this.regionDistance(region)
      this.regions.set(key, region)
    }
    return region
  }

  private removeRegion(region: LodRegion): void {
    this.regions.delete(region.key)
    this.meshResults.delete(region.key)
    this.renderer.removeRegion(region.regionX, region.regionZ)
    if (this.pool?.isReady(region.worker)) {
      this.pool.post(region.worker, { type: 'lod-evict', regions: Int32Array.of(region.regionX, region.regionZ) })
    }
    // A mesh job still in flight is ignored on arrival (region gone)
    this.visibilityDirty = true
    this.coverageDirty = true
  }

  /** Drop everything (LOD turned off). Workers stay up for re-enabling. */
  private clear(): void {
    for (const region of [...this.regions.values()]) this.removeRegion(region)
    for (const tile of this.tiles.values()) tile.status = TILE_DROPPED
    this.tiles.clear()
    this.tilesReady = 0
    this.pendingTiles = []
    this.pendingCursor = 0
    this.regionOrder = []
    this.meshResults.clear()
    this.hiddenColumns.clear()
    this.shownColumns.clear()
    this.ringDistance = 0
    this.visibilityDirty = true
    this.coverageDirty = true
  }

  /** Chunk distance from the ring centre to a region's nearest chunk. */
  private regionDistance(region: LodRegion): number {
    const minX = region.regionX * LOD_REGION_CHUNKS
    const minZ = region.regionZ * LOD_REGION_CHUNKS
    const dx = Math.max(minX - this.ringCenterX, 0, this.ringCenterX - (minX + LOD_REGION_CHUNKS - 1))
    const dz = Math.max(minZ - this.ringCenterZ, 0, this.ringCenterZ - (minZ + LOD_REGION_CHUNKS - 1))
    return Math.sqrt(dx * dx + dz * dz)
  }

  /**
   * Cell size for a chunk distance from the ring centre, keeping `current`
   * inside the hysteresis band (see CELL1_MARGIN_CHUNKS).
   */
  private cellSizeFor(distance: number, current: LodCellSize | undefined): LodCellSize {
    const chunkDistance = this.source.getConfig().chunkDistance
    const cell1Inner = chunkDistance - CELL1_INNER_MARGIN_CHUNKS - CELL_BAND_MARGIN_CHUNKS
    const cell1Outer = chunkDistance + CELL1_MARGIN_CHUNKS + CELL_BAND_MARGIN_CHUNKS
    const cell2Limit = Math.max(cell1Outer, CELL2_DISTANCE_CHUNKS)
    const byDistance = (d: number): LodCellSize => (d < cell1Inner ? 2 : d < cell1Outer ? 1 : d < cell2Limit ? 2 : 4)
    const fine = byDistance(distance)
    if (current === undefined || current > fine) return fine
    // Coarser only once no position within the hysteresis margin (either
    // way: the annulus has an inner edge too) needs the current size
    const finestNear = Math.min(byDistance(distance - CELL_HYSTERESIS_CHUNKS), fine, byDistance(distance + CELL_HYSTERESIS_CHUNKS)) as LodCellSize
    return current < finestNear ? finestNear : current
  }

  // ==================== Tiles ====================

  private pumpTiles(): void {
    const pool = this.pool
    if (!pool) return
    const cap = this.source.getQueuedCount() > 0 ? BUSY_TILES_IN_FLIGHT : MAX_TILES_IN_FLIGHT
    let freeWorkers = 0
    for (let worker = 0; worker < pool.size; worker++) {
      if (pool.isReady(worker) && this.tilesInFlight[worker] < cap) freeWorkers++
    }
    if (freeWorkers === 0) return

    const pending = this.pendingTiles
    while (this.pendingCursor < pending.length && pending[this.pendingCursor].status !== TILE_PENDING) {
      this.pendingCursor++
    }
    const config = this.source.getConfig()
    for (let i = this.pendingCursor; i < pending.length && freeWorkers > 0; i++) {
      const tile = pending[i]
      if (tile.status !== TILE_PENDING) continue
      const worker = tile.region.worker
      if (!pool.isReady(worker) || this.tilesInFlight[worker] >= cap) continue

      tile.status = TILE_IN_FLIGHT
      tile.attempts++
      this.tilesInFlight[worker]++
      if (this.tilesInFlight[worker] >= cap) freeWorkers--
      pool.post(worker, {
        type: 'lod-tile',
        chunkX: tile.chunkX,
        chunkZ: tile.chunkZ,
        seed: config.seed,
        seaLevel: config.seaLevel,
        terrainThickness: config.terrainThickness,
        biomeData: this.source.getBlendDataForChunk(tile.chunkX, tile.chunkZ, 1),
      })
    }
  }

  private onTileResult(worker: number, result: LodTileResult): void {
    this.tilesInFlight[worker] = Math.max(0, this.tilesInFlight[worker] - 1)
    const tile = this.tiles.get(lodPackKey(result.chunkX, result.chunkZ))
    if (!tile) {
      // Left the ring while building: the worker cached it anyway
      this.pool?.post(worker, { type: 'lod-evict', regions: new Int32Array(0), chunks: Int32Array.of(result.chunkX, result.chunkZ) })
      return
    }
    // Only the answer to this tile's own request counts. A result for an
    // earlier request (the chunk left the ring or LOD was toggled off, then
    // it came back before the result did) was followed by an evict in the
    // worker's queue, so the worker no longer holds that summary - accepting
    // it would leave the chunk out of every region mesh. The re-added tile
    // is requested again instead.
    if (tile.status !== TILE_IN_FLIGHT) return

    tile.status = TILE_READY
    this.tilesReady++
    this.endRefetch(tile)
    tile.known = true
    tile.minTop = result.minTop
    tile.maxTop = result.maxTop
    tile.minFloor = result.minFloor
    tile.region.dirty = true
    this.markNeighborRegionsDirty(tile.chunkX, tile.chunkZ)
    this.visibilityDirty = true
    this.coverageDirty = true
    // The column's exact surface band is known now
    this.source.refreshSurfaceBand(tile.chunkX, tile.chunkZ)
  }

  private onTileError(worker: number, error: LodErrorResult): void {
    this.tilesInFlight[worker] = Math.max(0, this.tilesInFlight[worker] - 1)
    const tile = this.tiles.get(lodPackKey(error.x, error.z))
    console.warn(`[LodManager] LOD tile ${error.x},${error.z} failed: ${error.error}`)
    if (!tile || tile.status !== TILE_IN_FLIGHT) return
    if (tile.attempts >= MAX_TILE_ATTEMPTS) {
      tile.status = TILE_FAILED
      this.endRefetch(tile)
      this.coverageDirty = true
      return
    }
    tile.status = TILE_PENDING
    this.pendingTiles.push(tile)
  }

  /**
   * A region's border skirts are sized from the neighbouring chunks' lowest
   * surface, so a tile on a region edge changes the adjacent region's mesh
   * too - if the value that region's last mesh used differs.
   */
  private markNeighborRegionsDirty(chunkX: number, chunkZ: number): void {
    const localX = chunkX - lodRegionCoord(chunkX) * LOD_REGION_CHUNKS
    const localZ = chunkZ - lodRegionCoord(chunkZ) * LOD_REGION_CHUNKS
    const regionX = lodRegionCoord(chunkX)
    const regionZ = lodRegionCoord(chunkZ)
    const floor = this.readyMinFloor(chunkX, chunkZ)
    // (The chunk lies on the facing side of each neighbour's border table)
    if (localX === 0) this.markRegionDirty(regionX - 1, regionZ, lodNeighborIndex(LOD_SIDE_EAST, localZ), floor)
    if (localX === LOD_REGION_CHUNKS - 1) this.markRegionDirty(regionX + 1, regionZ, lodNeighborIndex(LOD_SIDE_WEST, localZ), floor)
    if (localZ === 0) this.markRegionDirty(regionX, regionZ - 1, lodNeighborIndex(LOD_SIDE_SOUTH, localX), floor)
    if (localZ === LOD_REGION_CHUNKS - 1) this.markRegionDirty(regionX, regionZ + 1, lodNeighborIndex(LOD_SIDE_NORTH, localX), floor)
  }

  private markRegionDirty(regionX: number, regionZ: number, neighborIndex: number, floor: number): void {
    const region = this.regions.get(lodPackKey(regionX, regionZ))
    if (!region) return
    if (region.sentNeighborMinFloor !== null && region.sentNeighborMinFloor[neighborIndex] === floor) return
    region.dirty = true
  }

  // ==================== Region meshing ====================

  private pumpMeshing(now: number): void {
    const pool = this.pool
    if (!pool) return
    for (const region of this.regionOrder) {
      // Dirty, or holding hidden geometry of tiles that left the ring for a while
      const dropped = (region.droppedLo !== 0 || region.droppedHi !== 0) && now - region.droppedSince >= DROPPED_REMESH_DELAY_MS
      if ((!region.dirty && !dropped) || region.meshRequestId !== 0 || region.refetching > 0) continue
      // Its previous mesh isn't applied yet: remesh once it is (it stays dirty)
      if (this.meshResults.has(region.key)) continue
      const worker = region.worker
      if (this.meshInFlight[worker] || !pool.isInitialized(worker)) continue
      if (now - region.lastMeshSentAt < this.remeshInterval(region)) continue
      if (!this.hasReadyTile(region)) continue

      region.dirty = false
      region.meshRequestId = this.nextRequestId++
      region.lastMeshSentAt = now
      this.meshInFlight[worker] = true
      const neighborMinFloor = this.getNeighborMinFloor(region)
      region.sentNeighborMinFloor = neighborMinFloor.slice()
      const chunkCellSizes = this.getChunkCellSizes(region)
      pool.post(
        worker,
        {
          type: 'lod-mesh-region',
          requestId: region.meshRequestId,
          regionX: region.regionX,
          regionZ: region.regionZ,
          cellSize: Math.min(...chunkCellSizes) as LodCellSize,
          chunkCellSizes,
          neighborMinFloor,
        },
        [neighborMinFloor.buffer, chunkCellSizes.buffer]
      )
    }
  }

  /**
   * Minimum time between two mesh requests of a region: at least
   * MIN_REMESH_INTERVAL_MS and REMESH_COST_FACTOR times its last mesh time;
   * longer deep in the haze, and while a region already on screen still has
   * tiles being built (a burst of arrivals makes one remesh).
   */
  private remeshInterval(region: LodRegion): number {
    let interval = Math.max(MIN_REMESH_INTERVAL_MS, region.lastMeshMs * REMESH_COST_FACTOR)
    if (region.distance > CELL2_DISTANCE_CHUNKS) interval = Math.max(interval, FAR_REMESH_INTERVAL_MS)
    if ((region.geometryLo !== 0 || region.geometryHi !== 0) && this.hasUnbuiltTile(region)) {
      interval = Math.max(interval, LOADING_REMESH_INTERVAL_MS)
    }
    return interval
  }

  /** A desired tile of the region is still pending or being built. */
  private hasUnbuiltTile(region: LodRegion): boolean {
    const originX = region.regionX * LOD_REGION_CHUNKS
    const originZ = region.regionZ * LOD_REGION_CHUNKS
    for (let slot = 0; slot < LOD_REGION_SLOTS; slot++) {
      const tile = this.tiles.get(lodPackKey(originX + (slot % LOD_REGION_CHUNKS), originZ + Math.floor(slot / LOD_REGION_CHUNKS)))
      if (tile && (tile.status === TILE_PENDING || tile.status === TILE_IN_FLIGHT)) return true
    }
    return false
  }

  /** Cell size of each chunk slot of a region (4 where there is no tile). */
  private getChunkCellSizes(region: LodRegion): Uint8Array {
    const sizes = new Uint8Array(LOD_REGION_SLOTS).fill(4)
    const originX = region.regionX * LOD_REGION_CHUNKS
    const originZ = region.regionZ * LOD_REGION_CHUNKS
    for (let slot = 0; slot < LOD_REGION_SLOTS; slot++) {
      const tile = this.tiles.get(lodPackKey(originX + (slot % LOD_REGION_CHUNKS), originZ + Math.floor(slot / LOD_REGION_CHUNKS)))
      if (tile) sizes[slot] = tile.cellSize
    }
    return sizes
  }

  private hasReadyTile(region: LodRegion): boolean {
    if (region.geometryLo !== 0 || region.geometryHi !== 0) return true // remesh (tiles may have left)
    const originX = region.regionX * LOD_REGION_CHUNKS
    const originZ = region.regionZ * LOD_REGION_CHUNKS
    for (let slot = 0; slot < LOD_REGION_SLOTS; slot++) {
      const tile = this.tiles.get(lodPackKey(originX + (slot % LOD_REGION_CHUNKS), originZ + Math.floor(slot / LOD_REGION_CHUNKS)))
      if (tile?.status === TILE_READY) return true
    }
    return false
  }

  /**
   * Lowest surface (top or lake bed) of the ready chunks bordering a region
   * (0 = unknown), LOD_SIDE_* layout.
   */
  private getNeighborMinFloor(region: LodRegion): Int16Array {
    const out = new Int16Array(LOD_NEIGHBOR_COUNT)
    const originX = region.regionX * LOD_REGION_CHUNKS
    const originZ = region.regionZ * LOD_REGION_CHUNKS
    for (let i = 0; i < LOD_REGION_CHUNKS; i++) {
      out[lodNeighborIndex(LOD_SIDE_NORTH, i)] = this.readyMinFloor(originX + i, originZ - 1)
      out[lodNeighborIndex(LOD_SIDE_SOUTH, i)] = this.readyMinFloor(originX + i, originZ + LOD_REGION_CHUNKS)
      out[lodNeighborIndex(LOD_SIDE_WEST, i)] = this.readyMinFloor(originX - 1, originZ + i)
      out[lodNeighborIndex(LOD_SIDE_EAST, i)] = this.readyMinFloor(originX + LOD_REGION_CHUNKS, originZ + i)
    }
    return out
  }

  private readyMinFloor(chunkX: number, chunkZ: number): number {
    const tile = this.tiles.get(lodPackKey(chunkX, chunkZ))
    return tile?.known ? bandBottom(tile) : 0
  }

  private onMeshResult(worker: number, result: LodMeshRegionResult): void {
    this.meshInFlight[worker] = false
    const key = lodPackKey(result.regionX, result.regionZ)
    const region = this.regions.get(key)
    if (region && region.meshRequestId === result.requestId) {
      region.meshRequestId = 0
      region.lastMeshMs = result.elapsedMs
      // (Replacing an unapplied result keeps its place in the queue)
      this.meshResults.set(key, result)
    }
    this.pumpMeshing(performance.now())
  }

  private onMeshError(worker: number, error: LodErrorResult): void {
    this.meshInFlight[worker] = false
    console.warn(`[LodManager] LOD region ${error.x},${error.z} mesh failed: ${error.error}`)
    const region = this.regions.get(lodPackKey(error.x, error.z))
    if (region && region.meshRequestId === error.requestId) {
      region.meshRequestId = 0
      region.dirty = true
    }
  }

  // ==================== Worker messages ====================

  private onWorkerResponse(worker: number, response: LodWorkerResponse): void {
    this.lastProgressAt[worker] = performance.now()
    switch (response.type) {
      case 'lod-tile-result':
        this.onTileResult(worker, response)
        // Keep the worker busy without waiting for the next frame
        if (this.enabled) this.pumpTiles()
        return
      case 'lod-mesh-result':
        this.onMeshResult(worker, response)
        return
      case 'lod-error':
        if (response.request === 'lod-tile') {
          this.onTileError(worker, response)
          if (this.enabled) this.pumpTiles()
        } else {
          this.onMeshError(worker, response)
        }
        return
    }
  }

  // ==================== Worker loss ====================

  /**
   * Replace workers that have work in flight but haven't replied for
   * workerStallMs (the pool reports the loss through onWorkerLost).
   */
  private checkStalledWorkers(now: number): void {
    const pool = this.pool
    if (!pool) return
    for (let worker = 0; worker < pool.size; worker++) {
      if (this.tilesInFlight[worker] === 0 && !this.meshInFlight[worker]) {
        this.lastProgressAt[worker] = now
      } else if (now - this.lastProgressAt[worker] > this.workerStallMs) {
        this.lastProgressAt[worker] = now
        pool.restart(worker)
      }
    }
  }

  /**
   * A worker was lost (crashed or stalled): its in-flight requests will never
   * be answered and the tile summaries it cached for its regions are gone.
   * Release its slots, request its in-flight tiles again, and re-fetch its
   * built tiles - keeping their metadata, so readiness, surface bands and the
   * displayed region meshes stay as they are until the summaries are back and
   * the regions remesh.
   */
  private onWorkerLost(worker: number): void {
    this.tilesInFlight[worker] = 0
    this.meshInFlight[worker] = false
    for (const region of this.regions.values()) {
      if (region.worker !== worker) continue
      region.meshRequestId = 0 // its mesh job is gone; remesh once the tiles are back
      region.dirty = true
      region.lastMeshSentAt = -Infinity
    }
    let requeued = false
    for (const tile of this.tiles.values()) {
      if (tile.region.worker !== worker) continue
      if (tile.status === TILE_IN_FLIGHT) {
        tile.status = TILE_PENDING
        requeued = true
      } else if (tile.status === TILE_READY) {
        tile.status = TILE_PENDING
        tile.attempts = 0
        this.tilesReady--
        if (!tile.refetching) {
          tile.refetching = true
          tile.region.refetching++
        }
        requeued = true
      }
    }
    if (requeued) {
      this.pendingTiles = [...this.tiles.values()].filter((tile) => tile.status === TILE_PENDING)
      this.pendingTiles.sort((a, b) => a.distance2 - b.distance2)
      this.pendingCursor = 0
    }
    this.visibilityDirty = true
    this.coverageDirty = true
  }

  private endRefetch(tile: LodTile): void {
    if (!tile.refetching) return
    tile.refetching = false
    tile.region.refetching--
  }

  // ==================== Handoff ====================

  /**
   * A column is ready once every sub-chunk of its surface band - from the
   * lowest floor (lake beds show through water) to the highest top - has a
   * full-detail mesh built from its generated data. With requireCurrent (a
   * column not shown yet) the meshes must also be built from the current data
   * of their neighbours: a mesh built while a neighbour was missing has no
   * faces toward it, and revealing it would open see-through seams.
   */
  private isColumnReady(chunkX: number, chunkZ: number, requireCurrent: boolean): boolean {
    const tile = this.tiles.get(lodPackKey(chunkX, chunkZ))
    if (!tile || !tile.known || tile.maxTop <= 0) return false
    // The tile knows nothing of caves: world generation may extend the band
    // down where the loaded data shows a ravine cutting below it
    const bottom = bandBottom(tile)
    const floor = this.source.getSurfaceBandFloor(chunkX, chunkZ, Math.floor((bottom - 1) / SUB_CHUNK_HEIGHT))
    return this.readiness.isBandComplete(chunkX, chunkZ, Math.min(bottom, floor * SUB_CHUNK_HEIGHT + 1), tile.maxTop, requireCurrent)
  }

  /** Exact surface band from the column's tile (null until it is built). */
  private getSurfaceBand(chunkX: number, chunkZ: number): SurfaceBand | null {
    if (!this.enabled) return null
    const tile = this.tiles.get(lodPackKey(chunkX, chunkZ))
    if (!tile || !tile.known || tile.maxTop <= 0) return null
    return { minY: bandBottom(tile) - 1, maxY: tile.maxTop - 1 }
  }
}

/** Lowest `top`-style (Y + 1) value of a tile's surface band. */
function bandBottom(tile: LodTile): number {
  return tile.minFloor > 0 ? Math.min(tile.minFloor, tile.minTop) : tile.minTop
}
