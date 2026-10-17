import type { ProceduralDungeonConfig } from '../../ProceduralDungeonFeature.ts'

/**
 * The Catacombs (Ossuary dungeon) - constants shared by the worker kit, the
 * biome's features list and the main-thread wiring (locator, garrisons,
 * guardian, loot). Worker-safe: no imports beyond types.
 */

/** Kit id / dungeon id (DESIGN §11: `dungeon-entered.dungeonId`). */
export const CATACOMBS_KIT_ID = 'catacombs'

/** One Catacombs per Ossuary region (p 0.85). Share this object with the locator. */
export const CATACOMBS: ProceduralDungeonConfig = {
  kitId: CATACOMBS_KIT_ID,
  biome: 'ossuary',
  salt: 0xc47a,
  chance: 0.85,
}

/** Bone King spawner index (DESIGN §7). */
export const BONE_KING_INDEX = 2

/** Garrison indices (ossuary range 20-29). */
export const GARRISON_GHOUL_DEN = 20
export const GARRISON_NICHE_AMBUSH = 21
export const GARRISON_PRIEST_SANCTUM = 22
export const GARRISON_GUARD_CRYPT = 23
export const GARRISON_WRAITH_HAUNT = 24
