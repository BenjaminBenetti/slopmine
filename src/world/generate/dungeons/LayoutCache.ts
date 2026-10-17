import type { DungeonKit, DungeonLayout } from './DungeonTypes.ts'
import { generateDungeonLayout } from './LayoutGenerator.ts'

/**
 * Per-thread LRU of generated layouts: a castle spans dozens of sub-chunks,
 * all of which need its layout; generating it once per worker keeps the
 * per-sub-chunk cost to rasterization.
 */
const CAPACITY = 12
const cache = new Map<string, DungeonLayout>()

export function getCachedDungeonLayout(
  kit: DungeonKit,
  anchorX: number,
  anchorZ: number,
  seed: number,
  salt: number,
  terrainHeight: (x: number, z: number) => number,
  /** Distinguishes layouts over different terrain (the biome): the same kit + salt in two biomes. */
  terrainKey = ''
): DungeonLayout {
  const key = `${kit.id}|${anchorX}|${anchorZ}|${seed}|${salt}|${terrainKey}`
  const hit = cache.get(key)
  if (hit) {
    // Refresh recency
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const layout = generateDungeonLayout({ kit, anchorX, anchorZ, seed, salt, terrainHeight })
  cache.set(key, layout)
  while (cache.size > CAPACITY) cache.delete(cache.keys().next().value as string)
  return layout
}

/** Drop every cached layout (tests). */
export function clearDungeonLayoutCache(): void {
  cache.clear()
}
