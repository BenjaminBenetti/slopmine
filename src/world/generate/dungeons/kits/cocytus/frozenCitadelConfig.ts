import type { ProceduralDungeonConfig } from '../../ProceduralDungeonFeature.ts'

/**
 * The Frozen Citadel (Cocytus dungeon): one constant shared by the worker
 * feature (CocytusGenerator features list) and the main-thread locator.
 */
export const FROZEN_CITADEL: ProceduralDungeonConfig = {
  kitId: 'frozen_citadel',
  biome: 'cocytus',
  salt: 0xc0c17,
  chance: 0.85,
}

/** Guardian spawner index of the Rime Sovereign (DESIGN §7). */
export const RIME_SOVEREIGN_GUARDIAN_INDEX = 5

/** Garrison spawner indices of the Frozen Citadel (cocytus range 50-59). */
export const CITADEL_GARRISON = {
  /** 2 Frozen Knights (guard rooms, vault doors). */
  guard: 50,
  /** 2 Rime Archers (galleries, tower tops). */
  archers: 51,
  /** A knight and an archer (guard posts at junctions). */
  patrol: 52,
  /** 2 knights and an archer (the gaol warden's room). */
  warden: 53,
  /** 2 Frost Wraiths (cisterns, the garden of sinners). */
  wraiths: 54,
  /** 2 Ice Revenants - the damned breaking out of the prison cells. */
  revenants: 55,
} as const
