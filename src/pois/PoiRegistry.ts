import { getPoiKindByIndex, type PoiKindInfo } from '../world/generate/caves/pois/PoiCatalog.ts'

/**
 * Where the loaded points of interest are. Each one's keystone (a hidden,
 * stone-looking block the generator puts under it, metadata = its kind)
 * reports itself here through its block entity when its sub-chunk loads,
 * and leaves when it unloads or is mined. Discovery, the Delver's Compass,
 * chest loot and spawns read it. Kept free of heavy imports: the keystone
 * block, and so this module, is bundled into every worker.
 */
export interface LoadedPoi {
  readonly kind: PoiKindInfo
  /** The keystone's cell. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Stable key of this point of interest (its keystone position). */
  readonly key: string
}

const loaded = new Map<string, LoadedPoi>()

export const poiRegistry = {
  onLoaded(entityId: string, x: number, y: number, z: number, kindIndex: number): void {
    const kind = getPoiKindByIndex(kindIndex)
    if (kind) loaded.set(entityId, { kind, x, y, z, key: `${x},${y},${z}` })
  },

  onUnloaded(entityId: string): void {
    loaded.delete(entityId)
  },

  /** Every loaded point of interest. */
  all(): IterableIterator<LoadedPoi> {
    return loaded.values()
  },

  /** The loaded point of interest whose keystone lies within `radius` blocks (Chebyshev) of a cell, if any. */
  near(x: number, y: number, z: number, radius: number): LoadedPoi | undefined {
    for (const poi of loaded.values()) {
      if (Math.abs(poi.x - x) <= radius && Math.abs(poi.y - y) <= radius && Math.abs(poi.z - z) <= radius) return poi
    }
    return undefined
  },

  get count(): number {
    return loaded.size
  },
}
