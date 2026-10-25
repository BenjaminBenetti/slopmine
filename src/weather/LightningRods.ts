/**
 * Where the loaded lightning rods are. Each rod's block entity reports itself
 * here when its sub-chunk loads (or the rod is placed) and leaves when it
 * unloads or is broken; lightning (Lightning.ts) strikes the nearest rod
 * within reach instead of the spot it picked.
 */

/** A rod catches every strike that would land within this many blocks of it (horizontally). */
export const ROD_RADIUS = 48

interface Rod {
  /** Top of the rod (the strike point): block centre x/z, top face y. */
  readonly x: number
  readonly y: number
  readonly z: number
}

const rods = new Map<string, Rod>()

export const lightningRods = {
  /** A rod block at (x, y, z) loaded or was placed (`id`: its block entity id). */
  onLoaded(x: number, y: number, z: number, id: string): void {
    rods.set(id, { x: x + 0.5, y: y + 1, z: z + 0.5 })
  },

  onUnloaded(id: string): void {
    rods.delete(id)
  },

  /** The rod that catches a strike aimed at (x, z), or null: the nearest within ROD_RADIUS. */
  catcher(x: number, z: number): Rod | null {
    let best: Rod | null = null
    let bestD = ROD_RADIUS * ROD_RADIUS
    for (const rod of rods.values()) {
      const d = (x - rod.x) ** 2 + (z - rod.z) ** 2
      if (d <= bestD) {
        best = rod
        bestD = d
      }
    }
    return best
  },

  get count(): number {
    return rods.size
  },
}
