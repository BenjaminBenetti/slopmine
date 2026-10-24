import type { LoadedPoi } from './PoiRegistry.ts'

/** Keyed player data of the discoveries. */
export const POI_DATA_KEY = 'pois'

interface PoiSaveData {
  readonly version: 1
  /** Keys (keystone positions) of every point of interest discovered. */
  readonly discovered: readonly string[]
  /** Kind ids discovered at least once. */
  readonly kinds: readonly string[]
}

/** Which points of interest the player has found, and which kinds (persisted under `pois`). */
export class PoiDiscoveries {
  private readonly discovered = new Set<string>()
  private readonly kinds = new Set<string>()

  isDiscovered(poi: LoadedPoi): boolean {
    return this.discovered.has(poi.key)
  }

  /** Record a discovery; false if it was already known. */
  discover(poi: LoadedPoi): boolean {
    if (this.discovered.has(poi.key)) return false
    this.discovered.add(poi.key)
    this.kinds.add(poi.kind.id)
    return true
  }

  /** Kinds discovered so far. */
  get kindCount(): number {
    return this.kinds.size
  }

  get count(): number {
    return this.discovered.size
  }

  restore(data: unknown): void {
    const saved = data as Partial<PoiSaveData> | null
    if (!saved || saved.version !== 1) return
    for (const key of saved.discovered ?? []) if (typeof key === 'string') this.discovered.add(key)
    for (const kind of saved.kinds ?? []) if (typeof kind === 'string') this.kinds.add(kind)
  }

  serialize(): PoiSaveData {
    return { version: 1, discovered: [...this.discovered], kinds: [...this.kinds] }
  }
}
