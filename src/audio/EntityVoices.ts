/**
 * Entity type → how a creature sounds: its voice archetype (creatureVoices.ts)
 * with a pitch offset so related creatures sound related but not identical,
 * and what its body is made of, which decides the sound of the player's hits
 * landing on it (`hit.<material>`) or glancing off its shield. Entity types
 * missing here (projectiles, drops, block entities) are silent.
 */

import type { VoiceArchetype } from './synth/creatureVoices.ts'

/** What a melee hit lands on. */
export type HitMaterial = 'flesh' | 'bone' | 'armor' | 'shield' | 'crystal' | 'ghost' | 'soft' | 'shell' | 'wood' | 'ice' | 'stone'

export interface EntityVoice {
  readonly archetype: VoiceArchetype
  /** Playback-rate multiplier. */
  readonly pitch: number
  /** Mean seconds between idle sounds (0 = never idles). */
  readonly idleEvery: number
  /** What its body is made of. */
  readonly hit: HitMaterial
  /** What a blocked hit strikes (its shield or ward); default 'shield'. */
  readonly shield?: HitMaterial
  /** Bosses are heard from further away. */
  readonly boss?: boolean
}

const V = (archetype: VoiceArchetype, hit: HitMaterial, pitch = 1, idleEvery = 18, extra: Partial<EntityVoice> = {}): EntityVoice => ({
  archetype,
  hit,
  pitch,
  idleEvery,
  ...extra,
})

const ENTITY_VOICES: Record<string, EntityVoice> = {
  // Surface animals
  cow: V('cow', 'flesh', 1, 20),
  pig: V('pig', 'flesh', 1, 16),
  deer: V('deer', 'flesh', 1, 30),
  rabbit: V('small', 'flesh', 1.15, 0),
  fox: V('fox', 'flesh', 1, 28),
  monkey: V('monkey', 'flesh', 1, 14),
  crab: V('critter', 'shell', 1, 0),
  sea_star: V('shell', 'soft', 1.3, 0),
  sea_shell: V('shell', 'shell', 1.4, 0),
  slug: V('shell', 'soft', 0.8, 0),
  snake: V('snake', 'flesh', 1, 24),
  komodo_dragon: V('reptile', 'flesh', 1, 22),
  alligator: V('reptile', 'flesh', 0.85, 22),
  wolf: V('canine', 'flesh', 1, 20),
  bear: V('bear', 'flesh', 1, 20),
  cave_slime: V('slime', 'soft', 1, 12),
  magma_slime: V('slime', 'soft', 0.8, 12),

  // Hell mobs
  ember_hog: V('hog', 'flesh', 1, 16),
  ember_roach: V('insect', 'shell', 1, 10),
  spore_drone: V('drone', 'soft', 1, 9),
  prism_wisp: V('wisp', 'crystal', 1, 10),
  spore_stalker: V('fungal', 'soft', 1, 14),
  rootbound_warden: V('treant', 'wood', 1, 14),
  skeleton: V('skeleton', 'bone', 1, 16),
  crypt_ghoul: V('ghoul', 'flesh', 1, 12),
  ice_revenant: V('revenant', 'ice', 1, 14),
  bone_hound: V('canine', 'bone', 1.12, 16),
  hellhound: V('canine', 'flesh', 0.82, 14),
  wraith: V('wraith', 'ghost', 1, 14),
  frost_wraith: V('wraith', 'ghost', 1.25, 14),
  crystal_sentinel: V('crystal', 'crystal', 0.75, 0, { shield: 'crystal' }),
  shardling: V('crystal', 'crystal', 1.1, 0),
  prism_focus: V('crystal', 'crystal', 1.3, 0),
  frozen_knight: V('knight', 'armor', 1.05, 18),
  infernal_knight: V('knight', 'armor', 0.92, 18),
  hollow_priest: V('humanoid', 'flesh', 0.9, 16),
  ember_caster: V('humanoid', 'flesh', 1.05, 16),
  prism_acolyte: V('humanoid', 'flesh', 1.12, 16),
  rime_archer: V('humanoid', 'flesh', 1, 18),

  // Night creatures (the surface after dark)
  stillwatcher: V('straw', 'soft', 1, 22),
  duskmoth: V('moth', 'soft', 1, 9),
  // Caves and dark places
  glow_bat: V('fox', 'flesh', 1.9, 22),
  cave_spider: V('insect', 'flesh', 0.8, 12),
  geode_crawler: V('insect', 'crystal', 0.7, 20, { shield: 'crystal' }),
  sporeling: V('fungal', 'soft', 1.6, 14),
  ember_salamander: V('reptile', 'stone', 1.25, 16),
  sandmaw: V('burrower', 'shell', 1, 16),
  ashwalker: V('ember', 'stone', 1, 16),
  mire_angler: V('angler', 'flesh', 1, 14),
  hollow_stag: V('bellow', 'flesh', 1, 22),
  orchid_mantis: V('insect', 'shell', 1.3, 20),
  // Weather creatures (come and go with their weather)
  thunderhead: V('storm', 'ghost', 1, 12),
  dune_dervish: V('whirl', 'soft', 1, 10),
  whiteout_stalker: V('bigcat', 'flesh', 1, 18),
  marsh_wisp: V('will', 'ghost', 1, 11),

  // Guardians (a blocked hit: invulnerable, warded or shielded)
  bone_king: V('boss-bone', 'bone', 1, 9, { boss: true, shield: 'bone' }),
  pyre_tyrant: V('boss-fire', 'stone', 1, 9, { boss: true, shield: 'stone' }),
  prism_warden: V('boss-prism', 'crystal', 1, 10, { boss: true, shield: 'crystal' }),
  rime_sovereign: V('boss-frost', 'ice', 1, 9, { boss: true, shield: 'ice' }),
  sporemother: V('boss-spore', 'soft', 1, 9, { boss: true, shield: 'wood' }),
  cave_drake: V('boss-fire', 'shell', 0.72, 9, { boss: true, shield: 'stone' }),
}

export function getEntityVoice(entityType: string): EntityVoice | null {
  return ENTITY_VOICES[entityType] ?? null
}
