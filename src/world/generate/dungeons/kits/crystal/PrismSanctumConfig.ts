import type { ProceduralDungeonConfig } from '../../ProceduralDungeonFeature.ts'

/**
 * Prism Sanctum constants shared by the worker feature (biome features list),
 * the kit, and the main-thread wiring (locator, garrisons, guardian).
 * Worker-safe: plain values only.
 */

/** Dungeon id (DESIGN §11: `dungeon-entered`, locator, journal). */
export const PRISM_SANCTUM_DUNGEON_ID = 'prism_sanctum'

/** Kit id (DungeonKitRegistry). */
export const PRISM_SANCTUM_KIT_ID = 'prism_sanctum'

/** One procedural Prism Sanctum per Crystal Abyss region (p = 0.85). */
export const PRISM_SANCTUM_CONFIG: ProceduralDungeonConfig = {
  kitId: PRISM_SANCTUM_KIT_ID,
  biome: 'crystal-abyss',
  salt: 0x9215,
  chance: 0.85,
}

/** Guardian spawner metadata of the Prism Warden. */
export const PRISM_WARDEN_GUARDIAN_INDEX = 4

/** Garrison spawner metadata (crystal range 40-49). */
export const GARRISON_ACOLYTE_COVEN = 40 // 3 Prism Acolytes (quarters)
export const GARRISON_SENTINEL_GUARD = 41 // 2 Crystal Sentinels (antechamber)
export const GARRISON_SENTINEL_COURT = 42 // 2 Sentinels + 1 Acolyte (court)
export const GARRISON_SHARD_SWARM = 43 // a sentinel herding shardlings, sometimes an acolyte (undercroft)
