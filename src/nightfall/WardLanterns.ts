/**
 * Where the loaded Ward Lanterns are. Each lantern's block entity reports
 * itself here when its sub-chunk loads (or the lantern is placed) and leaves
 * when it unloads or is broken; the night spawner asks `isWarded` before
 * raising a night creature.
 */

/** Horizontal reach of a ward: no night creature rises within this many blocks. */
export const WARD_RADIUS = 32
/** Vertical reach: a lantern in a cave below doesn't ward the surface far above. */
const WARD_HEIGHT = 48

interface Ward {
  readonly x: number
  readonly y: number
  readonly z: number
}

const wards = new Map<string, Ward>()

export const wardLanterns = {
  onLoaded(x: number, y: number, z: number, id: string): void {
    wards.set(id, { x: x + 0.5, y, z: z + 0.5 })
  },

  onUnloaded(id: string): void {
    wards.delete(id)
  },

  /** A loaded Ward Lantern stands within reach of (x, y, z). */
  isWarded(x: number, y: number, z: number): boolean {
    for (const ward of wards.values()) {
      const dx = x - ward.x
      const dz = z - ward.z
      if (dx * dx + dz * dz <= WARD_RADIUS * WARD_RADIUS && Math.abs(y - ward.y) <= WARD_HEIGHT) return true
    }
    return false
  },

  get count(): number {
    return wards.size
  },
}
