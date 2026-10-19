/**
 * The night creatures by entity type, and their trophies by item id - plain
 * data for systems that refer to them without importing their classes (the
 * journal, the spawner's cap). Entity types and item ids are persisted
 * contracts: never rename one.
 */
export const NIGHT_CREATURE_TYPES: readonly string[] = [
  'stillwatcher',
  'duskmoth',
  'sandmaw',
  'ashwalker',
  'mire_angler',
  'hollow_stag',
  'orchid_mantis',
]

/** One trophy per night creature (all tagged `night_trophy`). */
export const NIGHT_TROPHIES: readonly string[] = [
  'witchstraw',
  'moth_dust',
  'sandmaw_fang',
  'cinder_core',
  'angler_lure',
  'ghost_antler',
  'mantis_scythe',
]
