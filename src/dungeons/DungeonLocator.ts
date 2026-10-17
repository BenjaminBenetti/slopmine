/**
 * Dungeon locators: per dungeon type, a pure function that finds the nearest
 * dungeon anchor to a position WITHOUT generating terrain, by replicating the
 * placing worker feature's anchor math exactly (grid cell + seed, with only
 * biome-region vetoes). The Sigil Compass and `dungeon-entered` events use it.
 *
 * Main thread; register from your main.ts wiring section. Keep `findNearest`
 * cheap (it may be called a few times a second) and allocation-light.
 */

/** A dungeon anchor in world block coordinates (y: the anchor's nominal height - e.g. the arena floor). */
export interface DungeonLocation {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface DungeonLocatorDefinition {
  /** Stable id ('infernal_bastion', 'catacombs', ...); `dungeon-entered.dungeonId`. */
  readonly dungeonId: string
  /** The biome the dungeon generates in (`BiomeType`, e.g. 'hell', 'ossuary'). */
  readonly biome: string
  /** Human-readable name (compass tooltip, journal). */
  readonly displayName: string
  /**
   * The nearest anchor to (x, z) within `maxRadius` blocks (horizontal), or
   * null. Pure: same inputs, same answer; must match the feature exactly.
   */
  findNearest(x: number, z: number, seed: number, maxRadius: number): DungeonLocation | null
}

/** A located dungeon, with the locator that found it. */
export interface LocatedDungeon extends DungeonLocation {
  readonly dungeonId: string
  readonly biome: string
  readonly displayName: string
  /** Horizontal distance from the query point, in blocks. */
  readonly distance: number
}

const locators = new Map<string, DungeonLocatorDefinition>()

/** Register a locator. Re-registering a dungeonId replaces it. */
export function registerDungeonLocator(definition: DungeonLocatorDefinition): void {
  locators.set(definition.dungeonId, definition)
}

export function getDungeonLocator(dungeonId: string): DungeonLocatorDefinition | undefined {
  return locators.get(dungeonId)
}

/** Every registered locator, in registration order. */
export function getDungeonLocators(): DungeonLocatorDefinition[] {
  return Array.from(locators.values())
}

/** Locators of the dungeons that generate in `biome`. */
export function getDungeonLocatorsForBiome(biome: string): DungeonLocatorDefinition[] {
  return getDungeonLocators().filter((locator) => locator.biome === biome)
}

/**
 * The nearest dungeon to (x, z) within `maxRadius` over every registered
 * locator (optionally only one biome's or one dungeon type's), or null.
 */
export function findNearestDungeon(
  x: number,
  z: number,
  seed: number,
  maxRadius: number,
  filter: { biome?: string; dungeonId?: string } = {}
): LocatedDungeon | null {
  let best: LocatedDungeon | null = null
  for (const locator of locators.values()) {
    if (filter.biome !== undefined && locator.biome !== filter.biome) continue
    if (filter.dungeonId !== undefined && locator.dungeonId !== filter.dungeonId) continue
    let found: DungeonLocation | null
    try {
      found = locator.findNearest(x, z, seed, maxRadius)
    } catch (error) {
      console.error(`[DungeonLocator] '${locator.dungeonId}' findNearest threw:`, error)
      continue
    }
    if (!found) continue
    const distance = Math.hypot(found.x - x, found.z - z)
    if (distance > maxRadius || (best && distance >= best.distance)) continue
    best = {
      x: found.x,
      y: found.y,
      z: found.z,
      dungeonId: locator.dungeonId,
      biome: locator.biome,
      displayName: locator.displayName,
      distance,
    }
  }
  return best
}
