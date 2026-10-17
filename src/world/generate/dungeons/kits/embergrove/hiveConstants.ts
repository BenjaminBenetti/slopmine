import type { ProceduralDungeonConfig } from '../../ProceduralDungeonFeature.ts'

/**
 * Sporeheart Hive constants shared by the worker kit, the Ember Grove
 * biome's features list and the main-thread setup (locator, garrisons).
 * Worker-safe: no imports beyond types.
 */

/** The procedural dungeon config: biome features list + locator share it. */
export const SPOREHEART_HIVE: ProceduralDungeonConfig = {
  kitId: 'sporeheart_hive',
  biome: 'ember-grove',
  salt: 0x5e0b,
  chance: 0.85,
}

/** Dungeon id (compass, dungeon-entered, journal). */
export const SPOREHEART_HIVE_DUNGEON_ID = 'sporeheart_hive'

/** Garrison spawner metadata (embergrove range 30-39). */
export const HIVE_GARRISON = {
  /** Spore drone swarm (brood chambers). */
  BROOD: 30,
  /** Rootbound warden + drones (warden halls, the heart antechamber). */
  WARDEN: 31,
  /** Spore stalkers + a drone (stalker dens). */
  STALKERS: 32,
} as const

/** Guardian spawner metadata of the Sporemother (DESIGN §7). */
export const SPOREMOTHER_GUARDIAN_INDEX = 3
