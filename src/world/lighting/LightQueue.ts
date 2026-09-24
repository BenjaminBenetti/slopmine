import type { SubChunk } from '../chunks/SubChunk.ts'

/**
 * Growable FIFO ring of (sub-chunk, packed int) light-update entries.
 *
 * Entries reference cells by sub-chunk + local index so the BFS never builds
 * BigInt coordinates or string keys. Each entry holds a reference on its
 * sub-chunk (SubChunk.lightQueueRefs) so the engine can tell which regions
 * still have pending work before releasing sub-chunks for meshing.
 */
export class LightQueue {
  private subs: Array<SubChunk | null>
  private values: Int32Array
  private mask: number
  private head = 0
  private _size = 0

  /** Outputs of the last shift() (avoids allocating a tuple per pop). */
  outSub: SubChunk | null = null
  outValue = 0

  constructor(initialCapacity = 1 << 12) {
    let capacity = 1
    while (capacity < initialCapacity) capacity <<= 1
    this.subs = new Array<SubChunk | null>(capacity).fill(null)
    this.values = new Int32Array(capacity)
    this.mask = capacity - 1
  }

  get size(): number {
    return this._size
  }

  push(sub: SubChunk, value: number): void {
    if (this._size > this.mask) this.grow()
    const slot = (this.head + this._size) & this.mask
    this.subs[slot] = sub
    this.values[slot] = value
    this._size++
    sub.lightQueueRefs++
  }

  /** Pop the oldest entry into outSub/outValue. Returns false when empty. */
  shift(): boolean {
    if (this._size === 0) return false
    const slot = this.head
    const sub = this.subs[slot]!
    this.subs[slot] = null
    this.outSub = sub
    this.outValue = this.values[slot]
    this.head = (slot + 1) & this.mask
    this._size--
    sub.lightQueueRefs--
    return true
  }

  private grow(): void {
    const oldCapacity = this.mask + 1
    const capacity = oldCapacity << 1
    const subs = new Array<SubChunk | null>(capacity).fill(null)
    const values = new Int32Array(capacity)
    for (let i = 0; i < this._size; i++) {
      const slot = (this.head + i) & this.mask
      subs[i] = this.subs[slot]
      values[i] = this.values[slot]
    }
    this.subs = subs
    this.values = values
    this.mask = capacity - 1
    this.head = 0
  }
}
