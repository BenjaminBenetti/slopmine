import type { ChunkColumn } from '../chunks/ChunkColumn.ts'
import type { SubChunk } from '../chunks/SubChunk.ts'
import { CHUNK_HEIGHT, SUB_CHUNK_COUNT, SUB_CHUNK_HEIGHT, SUB_CHUNK_LAYER, SUB_CHUNK_TOP_ROW_START } from '../interfaces/IChunk.ts'
import { closedLightFaces, getLightTables, LIGHT_FACE_BOTTOM, LIGHT_FACE_TOP, OPACITY_OPAQUE, type LightTables } from './LightTables.ts'
import { LightQueue } from './LightQueue.ts'
import { computeSubChunkLight, SKY_SEED_SIZE } from './SubChunkLight.ts'
import { computeSkyFloor, computeSkySeed, scanSkyFloor } from './ColumnSkyState.ts'

/**
 * World access the engine needs from its owner (WorldManager).
 */
export interface LightEngineHost {
  /** Loaded column at numeric chunk coordinates, or undefined. */
  getColumn(cx: number, cz: number): ChunkColumn | undefined
  /**
   * A sub-chunk's padded (34^3) mesh volume changed and the light around it
   * has settled: (re)mesh it. highPriority = the change stems from a player edit.
   */
  onSubChunkSettled(sub: SubChunk, highPriority: boolean): void
}

/**
 * Light-related data that comes with a generated or persisted sub-chunk.
 */
export interface SubChunkLightInput {
  /**
   * Sky proof (see provesSkyAbove in SubChunkLight.ts): nothing generated in
   * this chunk column lies above this sub-chunk, so unloaded sub-chunks above
   * it count as sky.
   */
  skyOpenAbove: boolean
  /**
   * Resolved 0/1 sky seed (index z*32+x) the accompanying light data was
   * computed with. Omit when there is no trustworthy light data (e.g. loaded
   * from persistence): the engine then lights the sub-chunk itself.
   */
  skySeed?: Uint8Array
}

/**
 * Cumulative counters (debug HUD / harness measurements).
 */
export interface LightEngineStats {
  /** Queue entries processed by process(). */
  entriesProcessed: number
  /** Main-thread time spent in process(). */
  processMs: number
  /** Main-thread time spent integrating loaded sub-chunks (excludes process()). */
  loadMs: number
  subChunksLoaded: number
  /** Sub-chunks that were lit on the main thread (no worker light). */
  subChunksLitLocally: number
  blockChanges: number
}

// Local index layout (y-major): idx = y * 1024 + z * 32 + x
const Y_STRIDE = SUB_CHUNK_LAYER
const TOP_ROW = SUB_CHUNK_TOP_ROW_START
const SUB_MAX = SUB_CHUNK_COUNT - 1

// Border exchange: for each face direction (-x, +x, -z, +z, -y, +y) the face
// cells of this sub-chunk are aBase + u*uStride + v*vStride (u, v in 0..31);
// the touching neighbour cell is that index + delta.
const FACE_A_BASE = [0, 31, 0, 992, 0, TOP_ROW]
const FACE_U_STRIDE = [Y_STRIDE, Y_STRIDE, Y_STRIDE, Y_STRIDE, 32, 32]
const FACE_V_STRIDE = [32, 32, 1, 1, 1, 1]
const FACE_DELTA = [31, -31, 992, -992, TOP_ROW, -TOP_ROW]

/**
 * Main-thread light engine (Minecraft semantics, see LightTables.ts).
 *
 * - Two channels (sky, block) stored in each SubChunk's light nibbles.
 * - Removal is decrease-then-increase BFS; everything crosses sub-chunk and
 *   column borders. Queues are typed rings of (sub-chunk, local index).
 * - Direct sky comes from each column's sky floor (ColumnSkyState.ts):
 *   unknown data is dark, so loading data normally only adds light.
 * - Only light-ready sub-chunks hold light; unloaded neighbours are opaque.
 *
 * Edits seed the queues synchronously (onBlockChanged) and are usually fully
 * relit by a small synchronous process() call; big relights continue through
 * the budgeted per-frame process(). Every sub-chunk whose padded mesh volume
 * (itself + 1-cell shell) changed is held dirty and released to the mesher
 * (host.onSubChunkSettled) only once no queued work remains within its 3x3x3
 * sub-chunk neighbourhood, so meshes never capture half-propagated light.
 */
export class LightEngine {
  readonly stats: LightEngineStats = {
    entriesProcessed: 0,
    processMs: 0,
    loadMs: 0,
    subChunksLoaded: 0,
    subChunksLitLocally: 0,
    blockChanges: 0,
  }

  private readonly host: LightEngineHost
  private readonly tables: LightTables
  private readonly skyDecrease = new LightQueue()
  private readonly blockDecrease = new LightQueue()
  private readonly increase = new LightQueue(1 << 14)

  /** Sub-chunks whose padded mesh volume changed since they were last released. */
  private readonly dirty: Set<SubChunk> = new Set()

  /** Queue entries still referencing sub-chunks of unloaded columns. */
  private orphanRefs = 0

  /** Mark dirty sub-chunks as player-edit priority while set. */
  private editPriority = false

  // Scratch outputs of neighbor() (no tuple allocation in the BFS)
  private nSub: SubChunk | null = null
  private nIdx = 0

  private readonly floorScratch = new Int16Array(SKY_SEED_SIZE)
  private readonly subFloorScratch = new Int16Array(SKY_SEED_SIZE)
  private readonly seedScratch = new Uint8Array(SKY_SEED_SIZE)

  constructor(host: LightEngineHost) {
    this.host = host
    this.tables = getLightTables()
  }

  // ==================== Public API ====================

  /**
   * Integrate a sub-chunk that was just registered with its blocks in place.
   * @param lightSeed resolved 0/1 sky seed the sub-chunk's light data was
   *   computed with (worker light); null = light data is not trustworthy,
   *   compute it here.
   */
  onSubChunkLoaded(sub: SubChunk, lightSeed: Uint8Array | null): void {
    const start = performance.now()
    const column = this.host.getColumn(sub.cx, sub.cz)
    if (!column || column.getSubChunk(sub.coordinate.subY) !== sub) return

    sub.lightReady = true
    const subY = sub.coordinate.subY
    const bottom = subY * SUB_CHUNK_HEIGHT
    const top = bottom + SUB_CHUNK_HEIGHT
    const opacity = this.tables.opacity
    const floors = column.skyFloor
    const newFloors = this.floorScratch

    // New sky floors. A new generation proof re-opens the whole column;
    // otherwise only columns whose direct sky reached this sub-chunk change.
    const rescanAll = sub.skyOpenAbove && subY < column.skyProofSubY
    if (rescanAll) column.skyProofSubY = subY
    for (let k = 0; k < SKY_SEED_SIZE; k++) {
      const old = floors[k]
      if (rescanAll) newFloors[k] = computeSkyFloor(column, k & 31, k >> 5, opacity)
      else if (old <= top) newFloors[k] = scanSkyFloor(column, k & 31, k >> 5, top - 1, opacity)
      else newFloors[k] = old
    }

    // Local light for the sub-chunk (worker-provided or computed now) and the
    // direct-sky floor inside it that this light assumed.
    const blocks = sub.getBlockData()
    let seed = lightSeed
    if (seed === null) {
      seed = this.seedScratch
      for (let k = 0; k < SKY_SEED_SIZE; k++) seed[k] = newFloors[k] <= top ? 1 : 0
      computeSubChunkLight(blocks, sub.getLightData(), seed, sub.skylightValue, this.tables, sub.getMetadataData())
      this.stats.subChunksLitLocally++
    }
    const subFloors = this.subFloorScratch
    for (let k = 0; k < SKY_SEED_SIZE; k++) {
      if (!seed[k]) {
        subFloors[k] = top
        continue
      }
      let y = top - 1
      let i = TOP_ROW | k
      while (y >= bottom && opacity[blocks[i]] === 0) {
        y--
        i -= Y_STRIDE
      }
      subFloors[k] = y + 1
    }

    // Reconcile direct sky: the rest of the column moves from its stored
    // floor, this sub-chunk from the floor its light was computed with.
    for (let k = 0; k < SKY_SEED_SIZE; k++) {
      const nf = newFloors[k]
      const old = floors[k]
      if (old !== nf) {
        for (let s = Math.min(old, nf) >> 5; s <= Math.min(SUB_MAX, (Math.max(old, nf) - 1) >> 5); s++) {
          const other = column.getSubChunk(s)
          if (other !== null && other !== sub) this.applyFloorRange(other, k, old, nf)
        }
        floors[k] = nf
      }
      this.applyFloorRange(sub, k, subFloors[k], nf < bottom ? bottom : nf)
    }

    this.exchangeBorders(sub)

    // Mesh invalidation: the new sub-chunk and every loaded neighbour whose
    // padded volume now includes it.
    this.markNeighborhood(sub)

    this.stats.subChunksLoaded++
    this.stats.loadMs += performance.now() - start
  }

  /**
   * Seed the relight for a block change at a world position. The block array
   * must already hold newId. Works for any cell: changes in unloaded or
   * placeholder sub-chunks only move the column's sky floor.
   */
  onBlockChanged(wx: number, wy: number, wz: number, oldId: number, newId: number, highPriority = false): void {
    if (wy < 0 || wy >= CHUNK_HEIGHT || oldId === newId) return
    const column = this.host.getColumn(wx >> 5, wz >> 5)
    if (!column) return
    this.stats.blockChanges++

    const { opacity, emission, verticalStop } = this.tables
    const lx = wx & 31
    const lz = wz & 31
    const k = (lz << 5) | lx
    const oldOp = opacity[oldId]
    const newOp = opacity[newId]
    const prevPriority = this.editPriority
    this.editPriority = highPriority

    // Direct sky: a new blocker at/above the floor raises it; clearing the
    // blocker right below the floor lets the sky continue down.
    const floor = column.skyFloor[k]
    if (oldOp === 0 && newOp !== 0 && wy >= floor) {
      this.moveFloor(column, k, wy + 1)
    } else if (oldOp !== 0 && newOp === 0 && wy === floor - 1) {
      this.moveFloor(column, k, scanSkyFloor(column, lx, lz, wy, opacity))
    }

    const sub = column.getSubChunk(wy >> 5)
    if (sub !== null && sub.lightReady) {
      const idx = ((wy & 31) << 10) | k
      const light = sub.getLightData()
      const newEm = emission[newId]
      const v = light[idx]
      const sky = v >> 4
      const blk = v & 15
      if (newOp >= OPACITY_OPAQUE) {
        // Opaque: no skylight, blocklight = own emission.
        light[idx] = newEm
        if (sky > 0) this.skyDecrease.push(sub, (idx << 4) | sky)
        if (blk > newEm) this.blockDecrease.push(sub, (idx << 4) | blk)
        if (newEm > 1) this.increase.push(sub, idx << 4)
      } else if (verticalStop[newId] !== 0) {
        // Now a slab/stair: its light may have come from (or gone) through a
        // face it closes - remove it and what depended on it, then refill
        // the cell (and the region behind it) through the faces still open.
        // (It stops direct sky, so the cell is never a direct-sky cell here.)
        light[idx] = newEm
        if (sky > 0) this.skyDecrease.push(sub, (idx << 4) | sky)
        if (blk > newEm) this.blockDecrease.push(sub, (idx << 4) | blk)
        if (newEm > 1) this.increase.push(sub, idx << 4)
        this.pullFromNeighbors(sub, idx)
      } else {
        if (emission[oldId] > newEm && blk > newEm) {
          // Emitter removed or dimmed: drop what it lit, keep the rest.
          light[idx] = (v & 0xf0) | newEm
          this.blockDecrease.push(sub, (idx << 4) | blk)
        } else if (newEm > blk) {
          light[idx] = (v & 0xf0) | newEm
        }
        if (newEm > 1) this.increase.push(sub, idx << 4)
        // An opening: let the surrounding light flow into the cell (and on,
        // through faces a removed slab/stair closed).
        if (oldOp >= OPACITY_OPAQUE || verticalStop[oldId] !== 0) {
          this.pullFromNeighbors(sub, idx)
          if ((light[idx] >> 4) > 1 || (light[idx] & 15) > 1) this.increase.push(sub, idx << 4)
        }
      }
      // The block itself changed: remesh everything that samples this cell.
      this.markCell(sub, idx)
    }

    this.editPriority = prevPriority
  }

  /**
   * A column is about to be unloaded: its light stops being known, so remove
   * whatever it contributed to the neighbouring columns (unknown = dark) and
   * invalidate the meshes that sampled it. Call before the column's data goes.
   */
  onColumnUnloading(column: ChunkColumn): void {
    const subs: SubChunk[] = []
    for (let s = 0; s < SUB_CHUNK_COUNT; s++) {
      const sub = column.getSubChunk(s)
      if (sub !== null && sub.lightReady) subs.push(sub)
    }
    if (subs.length === 0) return

    for (const sub of subs) {
      sub.lightReady = false
      this.orphanRefs += sub.lightQueueRefs
      if (sub.meshDirty) {
        this.dirty.delete(sub)
        sub.meshDirty = false
        sub.meshDirtyHigh = false
      }
    }

    const emission = this.tables.emission
    for (const sub of subs) {
      const aLight = sub.getLightData()
      for (let dir = 0; dir < 4; dir++) {
        const n = this.faceNeighborSub(sub, dir)
        if (n === null || !n.lightReady) continue
        const bLight = n.getLightData()
        const bBlocks = n.getBlockData()
        const base = FACE_A_BASE[dir]
        const us = FACE_U_STRIDE[dir]
        const vs = FACE_V_STRIDE[dir]
        const delta = FACE_DELTA[dir]
        for (let u = 0; u < 32; u++) {
          for (let v = 0; v < 32; v++) {
            const ia = base + u * us + v * vs
            const ib = ia + delta
            const va = aLight[ia]
            let vb = bLight[ib]
            const sb = vb >> 4
            if (sb > 0 && sb < va >> 4 && !this.isDirectSky(n, ib, sb)) {
              vb &= 0x0f
              bLight[ib] = vb
              this.markCell(n, ib)
              this.skyDecrease.push(n, (ib << 4) | sb)
            }
            const bb = vb & 15
            const em = emission[bBlocks[ib]]
            if (bb > em && bb < (va & 15)) {
              bLight[ib] = (vb & 0xf0) | em
              this.markCell(n, ib)
              this.blockDecrease.push(n, (ib << 4) | bb)
              if (em > 1) this.increase.push(n, ib << 4)
            }
          }
        }
      }
    }

    // Neighbours' meshes sampled the unloaded data (26-neighbourhood contract).
    for (const sub of subs) this.markNeighborhood(sub)
  }

  /**
   * A single sub-chunk was unloaded (its column stays): it was already
   * removed from `column`, so it reads as unknown/unloaded from now on. Like
   * a column unload - remove what it contributed to its six face neighbours
   * (unknown = dark) and invalidate the meshes that sampled it - plus the sky
   * state of its own column: losing the column's proof sub-chunk, or a
   * sub-chunk the direct sky passed through below the proof, raises the sky
   * floor (unknown = dark), darkening what lies below it.
   */
  onSubChunkUnloaded(column: ChunkColumn, sub: SubChunk): void {
    if (!sub.lightReady) return
    const subY = sub.coordinate.subY
    sub.lightReady = false
    this.orphanRefs += sub.lightQueueRefs
    if (sub.meshDirty) {
      this.dirty.delete(sub)
      sub.meshDirty = false
      sub.meshDirtyHigh = false
    }

    // Sky proof and floors of its column (the floor-range updates skip it:
    // it is no longer in the column)
    let proofChanged = false
    if (subY === column.skyProofSubY) {
      let proof = SUB_CHUNK_COUNT
      for (let s = subY + 1; s < SUB_CHUNK_COUNT; s++) {
        const other = column.getSubChunk(s)
        if (other !== null && other.lightReady && other.skyOpenAbove) {
          proof = s
          break
        }
      }
      column.skyProofSubY = proof
      proofChanged = true
    }
    // (A floor at `top` means a cell in its top row blocked the sky.) Above
    // the column's proof nothing moves: an unloaded sub-chunk there counts as
    // open sky, and its sky-stopping cells stay behind as a placeholder
    // (WorldManager.unloadSubChunk) - so skip the 1024 rescans.
    const top = (subY + 1) * SUB_CHUNK_HEIGHT
    const opacity = this.tables.opacity
    if (proofChanged || subY < column.skyProofSubY) {
      for (let k = 0; k < SKY_SEED_SIZE; k++) {
        if (proofChanged || column.skyFloor[k] <= top) {
          this.moveFloor(column, k, computeSkyFloor(column, k & 31, k >> 5, opacity))
        }
      }
    }

    // What its light reached across each face (as in onColumnUnloading, all six faces)
    const emission = this.tables.emission
    const aLight = sub.getLightData()
    for (let dir = 0; dir < 6; dir++) {
      const n = this.faceNeighborSub(sub, dir)
      if (n === null || !n.lightReady) continue
      const bLight = n.getLightData()
      const bBlocks = n.getBlockData()
      const base = FACE_A_BASE[dir]
      const us = FACE_U_STRIDE[dir]
      const vs = FACE_V_STRIDE[dir]
      const delta = FACE_DELTA[dir]
      for (let u = 0; u < 32; u++) {
        for (let v = 0; v < 32; v++) {
          const ia = base + u * us + v * vs
          const ib = ia + delta
          const va = aLight[ia]
          let vb = bLight[ib]
          const sb = vb >> 4
          if (sb > 0 && sb < va >> 4 && !this.isDirectSky(n, ib, sb)) {
            vb &= 0x0f
            bLight[ib] = vb
            this.markCell(n, ib)
            this.skyDecrease.push(n, (ib << 4) | sb)
          }
          const bb = vb & 15
          const em = emission[bBlocks[ib]]
          if (bb > em && bb < (va & 15)) {
            bLight[ib] = (vb & 0xf0) | em
            this.markCell(n, ib)
            this.blockDecrease.push(n, (ib << 4) | bb)
            if (em > 1) this.increase.push(n, ib << 4)
          }
        }
      }
    }

    // Neighbours' meshes sampled its data (26-neighbourhood contract)
    this.markNeighborhood(sub)
  }

  /**
   * Record a generation proof learned after load (e.g. re-applied data).
   * The proof only ever grows.
   */
  setSkyOpenAbove(sub: SubChunk, skyOpenAbove: boolean): void {
    if (!skyOpenAbove || sub.skyOpenAbove) return
    sub.skyOpenAbove = true
    if (!sub.lightReady) return
    const column = this.host.getColumn(sub.cx, sub.cz)
    if (!column || sub.coordinate.subY >= column.skyProofSubY) return
    column.skyProofSubY = sub.coordinate.subY
    const opacity = this.tables.opacity
    for (let k = 0; k < SKY_SEED_SIZE; k++) {
      this.moveFloor(column, k, computeSkyFloor(column, k & 31, k >> 5, opacity))
    }
  }

  /**
   * Sky seed for a generation request of sub-chunk (cx, cz, subY) - see
   * computeSkySeed in ColumnSkyState.ts.
   */
  computeSkySeed(cx: number, cz: number, subY: number, out: Uint8Array): Uint8Array {
    return computeSkySeed(this.host.getColumn(cx, cz), subY, this.tables.opacity, out)
  }

  /**
   * Process queued light updates (all decreases before increases) for up to
   * budgetMs. Returns true while work remains. Settled sub-chunks are handed
   * to the mesher separately by releaseSettled().
   * @param highPriority mark sub-chunks dirtied by this call as player edits
   */
  process(budgetMs: number, highPriority = false): boolean {
    if (!this.isQueueEmpty()) {
      const start = performance.now()
      const prevPriority = this.editPriority
      this.editPriority = highPriority
      let n = 0
      for (;;) {
        if (this.skyDecrease.size > 0) this.stepSkyDecrease()
        else if (this.blockDecrease.size > 0) this.stepBlockDecrease()
        else if (this.increase.size > 0) this.stepIncrease()
        else break
        if ((++n & 255) === 0 && performance.now() - start >= budgetMs) break
      }
      this.editPriority = prevPriority
      this.stats.entriesProcessed += n
      this.stats.processMs += performance.now() - start
    }
    return !this.isQueueEmpty()
  }

  /**
   * Hand every dirty sub-chunk whose neighbourhood has no pending light work
   * to the mesher. Call once per frame (coalesces all edits of the frame).
   */
  releaseSettled(): void {
    if (this.dirty.size === 0) return
    const idle = this.isQueueEmpty()
    if (idle) {
      this.orphanRefs = 0
    } else if (this.orphanRefs > 0) {
      return // work from an unloaded column is still draining; its reach is unknown
    }
    for (const sub of this.dirty) {
      if (!idle && this.hasPendingWorkNear(sub)) continue
      this.dirty.delete(sub)
      const high = sub.meshDirtyHigh
      sub.meshDirty = false
      sub.meshDirtyHigh = false
      if (sub.lightReady) this.host.onSubChunkSettled(sub, high)
    }
  }

  /** True when no light updates are queued. */
  isQueueEmpty(): boolean {
    return this.skyDecrease.size === 0 && this.blockDecrease.size === 0 && this.increase.size === 0
  }

  /** Queued light-update entries. */
  get queuedEntries(): number {
    return this.skyDecrease.size + this.blockDecrease.size + this.increase.size
  }

  /** Sub-chunks waiting for their light to settle before remeshing. */
  get dirtySubChunks(): number {
    return this.dirty.size
  }

  // ==================== BFS steps ====================

  private stepIncrease(): void {
    const q = this.increase
    q.shift()
    const sub = q.outSub!
    if (!sub.lightReady) {
      this.orphanRefs--
      return
    }
    const idx = q.outValue >> 4
    const v = sub.getLightData()[idx]
    const s = v >> 4
    const b = v & 15
    if (s <= 1 && b <= 1) return
    const { opacity, verticalStop } = this.tables
    const selfId = sub.getBlockData()[idx]
    const selfFaces = verticalStop[selfId] === 0 ? 0 : closedLightFaces(this.tables, selfId, sub.getMetadataData()[idx])
    for (let dir = 0; dir < 6; dir++) {
      if (!this.neighbor(sub, idx, dir)) continue
      const nSub = this.nSub!
      const nIdx = this.nIdx
      const nId = nSub.getBlockData()[nIdx]
      const op = opacity[nId]
      if (op >= OPACITY_OPAQUE) continue
      // Dirs 4/5 are down/up: never across a slab or stair's full face
      if (dir >= 4 && (selfFaces | verticalStop[nId]) !== 0) {
        const nFaces = closedLightFaces(this.tables, nId, nSub.getMetadataData()[nIdx])
        if (dir === 4 ? ((selfFaces & LIGHT_FACE_BOTTOM) | (nFaces & LIGHT_FACE_TOP)) !== 0 : ((selfFaces & LIGHT_FACE_TOP) | (nFaces & LIGHT_FACE_BOTTOM)) !== 0) continue
      }
      const cost = op > 1 ? op : 1
      const nLight = nSub.getLightData()
      const nv = nLight[nIdx]
      let ns = nv >> 4
      let nb = nv & 15
      let changed = false
      let cs = s - cost
      if (cs > nSub.skylightValue) cs = nSub.skylightValue
      if (cs > ns) {
        ns = cs
        changed = true
      }
      const cb = b - cost
      if (cb > nb) {
        nb = cb
        changed = true
      }
      if (changed) {
        nLight[nIdx] = (ns << 4) | nb
        this.markCell(nSub, nIdx)
        this.increase.push(nSub, nIdx << 4)
      }
    }
  }

  private stepSkyDecrease(): void {
    const q = this.skyDecrease
    q.shift()
    const sub = q.outSub!
    if (!sub.lightReady) this.orphanRefs--
    const idx = q.outValue >> 4
    const oldLevel = q.outValue & 15
    for (let dir = 0; dir < 6; dir++) {
      if (!this.neighbor(sub, idx, dir)) continue
      const nSub = this.nSub!
      const nIdx = this.nIdx
      const nLight = nSub.getLightData()
      const nv = nLight[nIdx]
      const l = nv >> 4
      if (l === 0) continue
      if (l < oldLevel && !this.isDirectSky(nSub, nIdx, l)) {
        // May have been lit through the removed light: remove and continue.
        nLight[nIdx] = nv & 0x0f
        this.markCell(nSub, nIdx)
        this.skyDecrease.push(nSub, (nIdx << 4) | l)
      } else {
        // Independent light (or direct sky): relight the cleared region from it.
        this.increase.push(nSub, nIdx << 4)
      }
    }
  }

  private stepBlockDecrease(): void {
    const q = this.blockDecrease
    q.shift()
    const sub = q.outSub!
    if (!sub.lightReady) this.orphanRefs--
    const idx = q.outValue >> 4
    const oldLevel = q.outValue & 15
    const emission = this.tables.emission
    for (let dir = 0; dir < 6; dir++) {
      if (!this.neighbor(sub, idx, dir)) continue
      const nSub = this.nSub!
      const nIdx = this.nIdx
      const nLight = nSub.getLightData()
      const nv = nLight[nIdx]
      const l = nv & 15
      if (l === 0) continue
      const em = emission[nSub.getBlockData()[nIdx]]
      if (l < oldLevel && l > em) {
        nLight[nIdx] = (nv & 0xf0) | em
        this.markCell(nSub, nIdx)
        this.blockDecrease.push(nSub, (nIdx << 4) | l)
        if (em > 1) this.increase.push(nSub, nIdx << 4)
      } else {
        this.increase.push(nSub, nIdx << 4)
      }
    }
  }

  // ==================== Helpers ====================

  /**
   * Resolve the face neighbour of cell `idx` in direction dir
   * (0 -x, 1 +x, 2 -z, 3 +z, 4 -y, 5 +y) into nSub/nIdx.
   * Returns false when the neighbour is outside the world or not light-ready.
   */
  private neighbor(sub: SubChunk, idx: number, dir: number): boolean {
    let n: SubChunk | null
    let nIdx: number
    switch (dir) {
      case 0:
        if ((idx & 31) !== 0) {
          n = sub
          nIdx = idx - 1
        } else {
          n = this.subAt(sub.cx - 1, sub.coordinate.subY, sub.cz)
          nIdx = idx + 31
        }
        break
      case 1:
        if ((idx & 31) !== 31) {
          n = sub
          nIdx = idx + 1
        } else {
          n = this.subAt(sub.cx + 1, sub.coordinate.subY, sub.cz)
          nIdx = idx - 31
        }
        break
      case 2:
        if ((idx & 992) !== 0) {
          n = sub
          nIdx = idx - 32
        } else {
          n = this.subAt(sub.cx, sub.coordinate.subY, sub.cz - 1)
          nIdx = idx + 992
        }
        break
      case 3:
        if ((idx & 992) !== 992) {
          n = sub
          nIdx = idx + 32
        } else {
          n = this.subAt(sub.cx, sub.coordinate.subY, sub.cz + 1)
          nIdx = idx - 992
        }
        break
      case 4:
        if (idx >= Y_STRIDE) {
          n = sub
          nIdx = idx - Y_STRIDE
        } else {
          n = this.subAt(sub.cx, sub.coordinate.subY - 1, sub.cz)
          nIdx = idx + TOP_ROW
        }
        break
      default:
        if (idx < TOP_ROW) {
          n = sub
          nIdx = idx + Y_STRIDE
        } else {
          n = this.subAt(sub.cx, sub.coordinate.subY + 1, sub.cz)
          nIdx = idx - TOP_ROW
        }
        break
    }
    if (n === null || !n.lightReady) return false
    this.nSub = n
    this.nIdx = nIdx
    return true
  }

  private subAt(cx: number, subY: number, cz: number): SubChunk | null {
    if (subY < 0 || subY > SUB_MAX) return null
    const column = this.host.getColumn(cx, cz)
    return column ? column.getSubChunk(subY) : null
  }

  private faceNeighborSub(sub: SubChunk, dir: number): SubChunk | null {
    const subY = sub.coordinate.subY
    switch (dir) {
      case 0:
        return this.subAt(sub.cx - 1, subY, sub.cz)
      case 1:
        return this.subAt(sub.cx + 1, subY, sub.cz)
      case 2:
        return this.subAt(sub.cx, subY, sub.cz - 1)
      case 3:
        return this.subAt(sub.cx, subY, sub.cz + 1)
      case 4:
        return this.subAt(sub.cx, subY - 1, sub.cz)
      default:
        return this.subAt(sub.cx, subY + 1, sub.cz)
    }
  }

  /** Whether a cell at skylight `level` is a direct-sky source (never removed by a decrease). */
  private isDirectSky(sub: SubChunk, idx: number, level: number): boolean {
    if (level !== sub.skylightValue) return false
    const column = this.host.getColumn(sub.cx, sub.cz)
    return column !== undefined && sub.coordinate.subY * SUB_CHUNK_HEIGHT + (idx >> 10) >= column.skyFloor[idx & 1023]
  }

  /** Move the sky floor of column cell k, updating direct skylight in loaded sub-chunks. */
  private moveFloor(column: ChunkColumn, k: number, newFloor: number): void {
    const old = column.skyFloor[k]
    if (old === newFloor) return
    const s1 = Math.min(SUB_MAX, (Math.max(old, newFloor) - 1) >> 5)
    for (let s = Math.min(old, newFloor) >> 5; s <= s1; s++) {
      const sub = column.getSubChunk(s)
      if (sub !== null) this.applyFloorRange(sub, k, old, newFloor)
    }
    column.skyFloor[k] = newFloor
  }

  /**
   * Cells of `sub` at column cell k between two floors gain (floor moved
   * down) or lose (floor moved up) direct skylight.
   */
  private applyFloorRange(sub: SubChunk, k: number, oldFloor: number, newFloor: number): void {
    if (!sub.lightReady || oldFloor === newFloor) return
    const bottom = sub.coordinate.subY * SUB_CHUNK_HEIGHT
    const gain = newFloor < oldFloor
    let y0 = gain ? newFloor : oldFloor
    let y1 = gain ? oldFloor : newFloor
    if (y0 < bottom) y0 = bottom
    if (y1 > bottom + SUB_CHUNK_HEIGHT) y1 = bottom + SUB_CHUNK_HEIGHT
    if (y0 >= y1) return
    const light = sub.getLightData()
    const cap = sub.skylightValue
    for (let y = y0; y < y1; y++) {
      const idx = ((y - bottom) << 10) | k
      const v = light[idx]
      const sky = v >> 4
      if (gain) {
        if (cap > sky) {
          light[idx] = (cap << 4) | (v & 0x0f)
          this.markCell(sub, idx)
          if (cap > 1) this.increase.push(sub, idx << 4)
        }
      } else if (sky > 0) {
        light[idx] = v & 0x0f
        this.markCell(sub, idx)
        this.skyDecrease.push(sub, (idx << 4) | sky)
      }
    }
  }

  /** Queue the lit face neighbours of a cell so their light flows into it. */
  private pullFromNeighbors(sub: SubChunk, idx: number): void {
    for (let dir = 0; dir < 6; dir++) {
      if (!this.neighbor(sub, idx, dir)) continue
      const v = this.nSub!.getLightData()[this.nIdx]
      if (v >> 4 > 1 || (v & 15) > 1) this.increase.push(this.nSub!, this.nIdx << 4)
    }
  }

  /**
   * Merge a newly integrated sub-chunk with its loaded face neighbours:
   * queue every border cell whose light would raise the cell across the face.
   * Increase-only: neither side's light depended on the other before.
   */
  private exchangeBorders(sub: SubChunk): void {
    const { opacity, verticalStop } = this.tables
    const aLight = sub.getLightData()
    const aBlocks = sub.getBlockData()
    const aMeta = sub.getMetadataData()
    const aCap = sub.skylightValue
    for (let dir = 0; dir < 6; dir++) {
      const n = this.faceNeighborSub(sub, dir)
      if (n === null || !n.lightReady) continue
      const bLight = n.getLightData()
      const bBlocks = n.getBlockData()
      const bCap = n.skylightValue
      const base = FACE_A_BASE[dir]
      const us = FACE_U_STRIDE[dir]
      const vs = FACE_V_STRIDE[dir]
      const delta = FACE_DELTA[dir]
      for (let u = 0; u < 32; u++) {
        for (let v = 0; v < 32; v++) {
          const ia = base + u * us + v * vs
          const ib = ia + delta
          const va = aLight[ia]
          const vb = bLight[ib]
          if (va === vb) continue
          // (top/bottom faces: never across a slab or stair's full face - for
          // dir 4 cell a lies above b, for dir 5 below)
          if (dir >= 4 && (verticalStop[aBlocks[ia]] | verticalStop[bBlocks[ib]]) !== 0) {
            const aFaces = closedLightFaces(this.tables, aBlocks[ia], aMeta[ia])
            const bFaces = closedLightFaces(this.tables, bBlocks[ib], n.getMetadataData()[ib])
            const upper = dir === 4 ? aFaces : bFaces
            const lower = dir === 4 ? bFaces : aFaces
            if (((upper & LIGHT_FACE_BOTTOM) | (lower & LIGHT_FACE_TOP)) !== 0) continue
          }
          const opA = opacity[aBlocks[ia]]
          const opB = opacity[bBlocks[ib]]
          if (opB < OPACITY_OPAQUE && raises(va, opB, bCap, vb)) this.increase.push(sub, ia << 4)
          if (opA < OPACITY_OPAQUE && raises(vb, opA, aCap, va)) this.increase.push(n, ib << 4)
        }
      }
    }
  }

  /** Record a changed cell: its sub-chunk plus every neighbour whose padded shell contains it. */
  private markCell(sub: SubChunk, idx: number): void {
    this.markSub(sub)
    const x = idx & 31
    const z = (idx >> 5) & 31
    const y = idx >> 10
    if (x === 0 || x === 31 || z === 0 || z === 31 || y === 0 || y === 31) {
      const x0 = x === 0 ? -1 : 0
      const x1 = x === 31 ? 1 : 0
      const y0 = y === 0 ? -1 : 0
      const y1 = y === 31 ? 1 : 0
      const z0 = z === 0 ? -1 : 0
      const z1 = z === 31 ? 1 : 0
      const subY = sub.coordinate.subY
      for (let dy = y0; dy <= y1; dy++) {
        for (let dz = z0; dz <= z1; dz++) {
          for (let dx = x0; dx <= x1; dx++) {
            if (dx === 0 && dy === 0 && dz === 0) continue
            const n = this.subAt(sub.cx + dx, subY + dy, sub.cz + dz)
            if (n !== null && n.lightReady) this.markSub(n)
          }
        }
      }
    }
  }

  /** Mark a sub-chunk and all loaded sub-chunks in its 3x3x3 neighbourhood. */
  private markNeighborhood(sub: SubChunk): void {
    const subY = sub.coordinate.subY
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = this.subAt(sub.cx + dx, subY + dy, sub.cz + dz)
          if (n !== null && n.lightReady) this.markSub(n)
        }
      }
    }
  }

  private markSub(sub: SubChunk): void {
    sub.meshVersion++
    if (!sub.meshDirty) {
      sub.meshDirty = true
      this.dirty.add(sub)
    }
    if (this.editPriority) sub.meshDirtyHigh = true
  }

  /**
   * Queued work can only change cells within 15 blocks of a queued cell, so
   * a sub-chunk whose 3x3x3 neighbourhood holds no queued entries has a
   * settled padded volume.
   */
  private hasPendingWorkNear(sub: SubChunk): boolean {
    const subY = sub.coordinate.subY
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = this.subAt(sub.cx + dx, subY + dy, sub.cz + dz)
          if (n !== null && n.lightQueueRefs > 0) return true
        }
      }
    }
    return false
  }
}

/** Would light value `src` raise cell light `dst` (opacity op, sky cap) across a face? */
function raises(src: number, op: number, cap: number, dst: number): boolean {
  const cost = op > 1 ? op : 1
  let s = (src >> 4) - cost
  if (s > cap) s = cap
  return s > dst >> 4 || (src & 15) - cost > (dst & 15)
}
