import type { ProceduralDungeonConfig } from '../../ProceduralDungeonFeature.ts'

/**
 * The Infernal Bastion's procedural dungeon config - ONE constant shared by
 * the Molten Wastes' features list (worker) and its locator (main thread).
 */
export const INFERNAL_BASTION: ProceduralDungeonConfig = {
  kitId: 'infernal_bastion',
  biome: 'hell',
  salt: 0xb457,
  chance: 0.85,
}

/** Guardian index of the Pyre Tyrant (DESIGN §7: molten = 1). */
export const PYRE_TYRANT_INDEX = 1

/** Garrison indices (DESIGN2 §3: molten 10-19). Registered in src/molten/setupMolten.ts. */
export const BASTION_GARRISON = {
  /** A knight holding the gate with skeletons behind him. */
  GATE_GUARD: 10,
  /** Knights and a skeleton in the barracks and halls. */
  BARRACKS: 11,
  /** Ember Casters in towers and the sanctum. */
  CASTER_NEST: 12,
  /** A hellhound pack in the kennels. */
  KENNEL: 13,
  /** The forgemaster knight with magma slimes / a skeleton at the hearths. */
  FORGE: 14,
  /** A caster warden with skeletons (now and then a hound) in the prison block. */
  PRISON: 15,
  /** Knights and a caster guarding the treasury and vaults. */
  VAULT_GUARD: 16,
  /** A knight and a caster on the wall walk and in galleries. */
  WALL_PATROL: 17,
} as const

/** Surface of the Molten Wastes' lava sea (MoltenTerrain.MOLTEN_SEA_Y; kept here so the kit stays import-light). */
export const BASTION_SEA_Y = 46
