/**
 * Buffer of raw block writes awaiting a relight (liquid physics batches,
 * decoration writers). Each cell is kept once with the block id it had before
 * its FIRST write in the batch, so the light engine sees one exact
 * old -> new transition per cell no matter how often the batch rewrote it.
 */
export class PendingBlockChanges {
  // Flat (x, y, z, originalId) quadruples in numeric world coordinates
  private readonly cells: number[] = []
  private readonly seen: Set<string> = new Set()

  get size(): number {
    return this.cells.length >> 2
  }

  record(x: number, y: number, z: number, originalId: number): void {
    const key = x + ',' + y + ',' + z
    if (this.seen.has(key)) return
    this.seen.add(key)
    this.cells.push(x, y, z, originalId)
  }

  /** Visit every recorded cell once with its original block id, then clear. */
  drain(visit: (x: number, y: number, z: number, originalId: number) => void): void {
    const cells = this.cells
    // Clear first: visitors may record new changes (re-entrant batches).
    const snapshot = cells.slice()
    cells.length = 0
    this.seen.clear()
    for (let i = 0; i < snapshot.length; i += 4) {
      visit(snapshot[i], snapshot[i + 1], snapshot[i + 2], snapshot[i + 3])
    }
  }
}
