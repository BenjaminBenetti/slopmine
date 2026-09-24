import { SUB_CHUNK_COUNT, SUB_CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import { lodPackKey } from './LodTypes.ts'

/**
 * Per-column full-detail state for the LOD handoff, one bit per subY:
 *
 * - applied: the sub-chunk's generated (or saved) data is in the world.
 * - complete: it has a mesh built after that - a mesh that arrived before
 *   the data did shows only what spilled into the sub-chunk early (e.g. a
 *   neighbour's tree canopy), not the terrain.
 * - current: that mesh was built from the current data of the sub-chunk AND
 *   its neighbours (WorldManager's mesh data version). A mesh whose job was in
 *   flight while a neighbour loaded culled its faces toward that neighbour;
 *   it stays complete (no flicker for a column already shown) but is not
 *   current until its remesh lands, so it can't reveal a column for the first
 *   time (see isBandComplete's requireCurrent).
 * - present: it has any mesh at all (what the renderer would draw).
 *
 * Fed by WorldGenerator (applied, column unloaded) and WorldManager (mesh
 * added / removed). A re-mesh fires removed then added synchronously, so
 * readers must look at the state once per frame (see consumeChanged), never
 * per event.
 */
export class LodColumnReadiness {
  private readonly applied = new Map<number, number>()
  private readonly complete = new Map<number, number>()
  private readonly current = new Map<number, number>()
  private readonly present = new Map<number, number>()
  /**
   * Columns touched since the last consumeChanged, with their (present,
   * complete, current) bits as they were before: only a real difference is a
   * change. (A remesh of a column already shown - liquid flow, a neighbour's
   * edit - fires removed + added and changes nothing the handoff reads.)
   */
  private readonly touched = new Map<number, number>()

  /** Remember a column's handoff-relevant bits before its first change since the last consume. */
  private touch(key: number): void {
    if (!this.touched.has(key)) this.touched.set(key, this.snapshot(key))
  }

  private snapshot(key: number): number {
    // 16 bits each (subY 0-15), packed exactly into a double
    return (this.present.get(key) ?? 0) + (this.complete.get(key) ?? 0) * 0x10000 + (this.current.get(key) ?? 0) * 0x100000000
  }

  onSubChunkApplied(chunkX: number, chunkZ: number, subY: number): void {
    const key = lodPackKey(chunkX, chunkZ)
    this.touch(key)
    setBit(this.applied, key, subY)
    // Any current mesh predates the data
    clearBit(this.complete, key, subY)
    clearBit(this.current, key, subY)
  }

  /**
   * A mesh was displayed; `current` = built from the current data of the
   * sub-chunk and its neighbours (WorldManager.onSubChunkMeshAdded).
   */
  onMeshAdded(chunkX: number, chunkZ: number, subY: number, current = true): void {
    const key = lodPackKey(chunkX, chunkZ)
    this.touch(key)
    setBit(this.present, key, subY)
    if (((this.applied.get(key) ?? 0) & (1 << subY)) !== 0) {
      setBit(this.complete, key, subY)
      if (current) setBit(this.current, key, subY)
      else clearBit(this.current, key, subY)
    }
  }

  /** The displayed mesh is no longer current (data arrived nearby; a remesh follows). */
  onMeshStale(chunkX: number, chunkZ: number, subY: number): void {
    const key = lodPackKey(chunkX, chunkZ)
    if (((this.current.get(key) ?? 0) & (1 << subY)) === 0) return
    this.touch(key)
    clearBit(this.current, key, subY)
  }

  onMeshRemoved(chunkX: number, chunkZ: number, subY: number): void {
    const key = lodPackKey(chunkX, chunkZ)
    this.touch(key)
    clearBit(this.present, key, subY)
    clearBit(this.complete, key, subY)
    clearBit(this.current, key, subY)
  }

  /** A single sub-chunk was unloaded (its column stays). */
  onSubChunkUnloaded(chunkX: number, chunkZ: number, subY: number): void {
    const key = lodPackKey(chunkX, chunkZ)
    this.touch(key)
    clearBit(this.applied, key, subY)
    clearBit(this.complete, key, subY)
    clearBit(this.current, key, subY)
    clearBit(this.present, key, subY)
  }

  onColumnUnloaded(chunkX: number, chunkZ: number): void {
    const key = lodPackKey(chunkX, chunkZ)
    this.touch(key)
    this.applied.delete(key)
    this.complete.delete(key)
    this.current.delete(key)
    this.present.delete(key)
  }

  /** True if any sub-chunk of the column has a mesh. */
  hasAnyMesh(chunkX: number, chunkZ: number): boolean {
    return this.present.has(lodPackKey(chunkX, chunkZ))
  }

  /**
   * True when every sub-chunk overlapping [minTop - 1, maxTop] - the surface
   * band (LOD tile tops are Y + 1 of the top block) plus the air cell above
   * its highest block, whose sub-chunk the top faces there need - has a mesh
   * built from its generated data; with requireCurrent, from the current
   * data of the sub-chunk and its neighbours (for columns not shown yet).
   */
  isBandComplete(chunkX: number, chunkZ: number, minTop: number, maxTop: number, requireCurrent = false): boolean {
    const bits = (requireCurrent ? this.current : this.complete).get(lodPackKey(chunkX, chunkZ))
    if (bits === undefined || maxTop <= 0) return false
    const lo = Math.floor((minTop - 1) / SUB_CHUNK_HEIGHT)
    const hi = Math.min(SUB_CHUNK_COUNT - 1, Math.floor(maxTop / SUB_CHUNK_HEIGHT))
    const need = ((1 << (hi + 1)) - 1) & ~((1 << lo) - 1)
    return (bits & need) === need
  }

  /** True once after any change of a column's present / complete / current bits. */
  consumeChanged(): boolean {
    if (this.touched.size === 0) return false
    let changed = false
    for (const [key, before] of this.touched) {
      if (this.snapshot(key) !== before) {
        changed = true
        break
      }
    }
    this.touched.clear()
    return changed
  }
}

function setBit(map: Map<number, number>, key: number, bit: number): void {
  map.set(key, (map.get(key) ?? 0) | (1 << bit))
}

function clearBit(map: Map<number, number>, key: number, bit: number): void {
  const bits = map.get(key)
  if (bits === undefined) return
  const next = bits & ~(1 << bit)
  if (next === 0) map.delete(key)
  else map.set(key, next)
}
