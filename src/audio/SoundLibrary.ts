/**
 * Every playable sound: which recipe renders it, how many variants, which bus
 * it plays on and how loud it sits in the mix.
 *
 * `loudness` is the target short-term loudness in dBFS before the bus
 * volumes (see measureLoudnessDb): each rendered variant is gain-corrected to
 * it, so the mix is set here and nowhere else. Reference points: footsteps
 * -35, mining hits -30, block breaks -26, melee impacts -26, UI ticks -34,
 * player hurt -22. The whole mix is deliberately quiet - sound is a layer
 * under the game, not on top of it.
 */

import { BLOCK_SOUND_MATERIALS, type BlockSoundAction, type BlockSoundMaterial } from './synth/blockSounds.ts'
import { CREATURE_VOICES, type VoiceArchetype, type VoiceKind } from './synth/creatureVoices.ts'

export type SoundBusId = 'sfx' | 'ui' | 'ambience'

export interface SoundDef {
  readonly recipe: string
  readonly variants: number
  readonly loudness: number
  readonly bus: SoundBusId
  /** Random pitch spread per play, ± semitones. */
  readonly pitch?: number
  /** Random level spread per play, ± dB. */
  readonly volume?: number
  /** Concurrent instances; the oldest is cut when exceeded. */
  readonly maxVoices?: number
  /** Minimum seconds between two starts (spam guard). */
  readonly minInterval?: number
  /** Positional: full level within this distance (blocks). */
  readonly ref?: number
  /** Positional: not played beyond this distance (blocks). */
  readonly range?: number
  /** Render in the first startup batch (everything else renders right after it). */
  readonly preload?: boolean
}

type Def = Omit<SoundDef, 'recipe'> & { recipe?: string }

function defs<K extends string>(table: Record<K, Def>): Record<K, SoundDef> {
  const out = {} as Record<K, SoundDef>
  for (const key of Object.keys(table) as K[]) out[key] = { recipe: key, ...table[key] }
  return out
}

const BLOCK_ACTION_DEFS: Record<BlockSoundAction, Omit<SoundDef, 'recipe'>> = {
  hit: { variants: 3, loudness: -30, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 2, preload: true },
  break: { variants: 3, loudness: -26, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 4, preload: true },
  place: { variants: 3, loudness: -27, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, preload: true },
  step: { variants: 4, loudness: -35, bus: 'sfx', pitch: 1.2, volume: 1.5, maxVoices: 2, preload: true },
}

const VOICE_KIND_DEFS: Record<VoiceKind, Omit<SoundDef, 'recipe'>> = {
  hurt: { variants: 2, loudness: -27, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  death: { variants: 2, loudness: -25, bus: 'sfx', pitch: 0.8, volume: 1, maxVoices: 3, ref: 4, range: 36 },
  idle: { variants: 3, loudness: -34, bus: 'sfx', pitch: 1.5, volume: 2, maxVoices: 3, ref: 3, range: 24 },
}

export const SOUND_DEFS = defs({
  // Player
  'player.hurt': { variants: 3, loudness: -22, bus: 'sfx', pitch: 0.6, maxVoices: 1, preload: true },
  'player.hurt.soft': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1, maxVoices: 1, minInterval: 0.3, preload: true },
  'player.sizzle': { variants: 2, loudness: -31, bus: 'sfx', pitch: 1, maxVoices: 1, minInterval: 0.4, preload: true },
  'player.death': { variants: 1, loudness: -22, bus: 'sfx', preload: true },
  'player.land': { variants: 2, loudness: -27, bus: 'sfx', pitch: 1, maxVoices: 1, preload: true },
  'player.swing': { variants: 3, loudness: -35, bus: 'sfx', pitch: 1.5, maxVoices: 2, preload: true },
  'player.splash': { variants: 2, loudness: -26, bus: 'sfx', pitch: 1, maxVoices: 1, minInterval: 0.4, preload: true },
  'player.splash.small': { variants: 2, loudness: -31, bus: 'sfx', pitch: 1.5, maxVoices: 1, minInterval: 0.3, preload: true },
  'player.swim': { variants: 3, loudness: -35, bus: 'sfx', pitch: 1.5, maxVoices: 1, preload: true },
  'player.lava': { variants: 1, loudness: -25, bus: 'sfx', maxVoices: 1, minInterval: 0.5 },
  'player.respawn': { variants: 1, loudness: -29, bus: 'ui' },

  // Melee impacts, by what the target is made of (EntityVoices `hit` / `shield`)
  'hit.flesh': { variants: 3, loudness: -26, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32, preload: true },
  'hit.bone': { variants: 3, loudness: -26, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.armor': { variants: 3, loudness: -26, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.shield': { variants: 3, loudness: -25, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.crystal': { variants: 3, loudness: -27, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.ghost': { variants: 2, loudness: -28, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.soft': { variants: 3, loudness: -26, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.shell': { variants: 3, loudness: -27, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.wood': { variants: 3, loudness: -26, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.ice': { variants: 3, loudness: -27, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },
  'hit.stone': { variants: 3, loudness: -26, bus: 'sfx', pitch: 1, volume: 1, maxVoices: 3, ref: 4, range: 32 },

  // Items
  'item.pickup': { variants: 3, loudness: -33, bus: 'sfx', pitch: 2, maxVoices: 2, minInterval: 0.05, preload: true },
  'item.eat': { variants: 4, loudness: -30, bus: 'sfx', pitch: 1.5, volume: 1.5, maxVoices: 1, preload: true },
  'item.drink': { variants: 3, loudness: -30, bus: 'sfx', pitch: 1.5, volume: 1, maxVoices: 1, preload: true },
  'item.heart': { variants: 1, loudness: -25, bus: 'sfx' },
  'item.equip': { variants: 2, loudness: -29, bus: 'ui', pitch: 1, preload: true },
  'item.bonemeal': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1, ref: 4, range: 20 },

  // UI
  'ui.click': { variants: 2, loudness: -34, bus: 'ui', pitch: 0.5, maxVoices: 2, preload: true },
  'ui.pick': { variants: 2, loudness: -35, bus: 'ui', pitch: 0.7, maxVoices: 2, preload: true },
  'ui.drop': { variants: 2, loudness: -35, bus: 'ui', pitch: 0.7, maxVoices: 2, preload: true },
  'ui.open': { variants: 2, loudness: -33, bus: 'ui', pitch: 0.5, maxVoices: 1, preload: true },
  'ui.close': { variants: 2, loudness: -34, bus: 'ui', pitch: 0.5, maxVoices: 1, preload: true },
  'ui.craft': { variants: 2, loudness: -30, bus: 'ui', pitch: 0.4, maxVoices: 2, minInterval: 0.06, preload: true },
  'ui.hotbar': { variants: 2, loudness: -40, bus: 'ui', pitch: 0.4, maxVoices: 1, minInterval: 0.03, preload: true },
  'ui.refused': { variants: 1, loudness: -32, bus: 'ui', maxVoices: 1, preload: true },
  'ui.milestone': { variants: 1, loudness: -27, bus: 'ui', maxVoices: 1 },
  'ui.chapter': { variants: 1, loudness: -26, bus: 'ui', maxVoices: 1 },
  'ui.discover': { variants: 1, loudness: -28, bus: 'ui', maxVoices: 1 },

  // Stations and world interactions
  'chest.open': { variants: 2, loudness: -28, bus: 'sfx', pitch: 1, maxVoices: 1, ref: 4, range: 24, preload: true },
  'chest.close': { variants: 2, loudness: -29, bus: 'sfx', pitch: 1, maxVoices: 1, ref: 4, range: 24, preload: true },
  'door.open': { variants: 2, loudness: -29, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 4, range: 24, preload: true },
  'door.close': { variants: 2, loudness: -29, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 4, range: 24, preload: true },
  'forge.open': { variants: 2, loudness: -31, bus: 'sfx', pitch: 1, maxVoices: 1, ref: 4, range: 24 },
  'forge.done': { variants: 2, loudness: -34, bus: 'sfx', pitch: 0.5, maxVoices: 1, minInterval: 1, ref: 4, range: 20 },
  'hellforge.craft': { variants: 2, loudness: -26, bus: 'sfx', pitch: 0.5, maxVoices: 1, minInterval: 0.15 },
  'woodwork.craft': { variants: 2, loudness: -29, bus: 'sfx', pitch: 1, maxVoices: 1, minInterval: 0.15 },
  'brew.craft': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1, maxVoices: 1, minInterval: 1, ref: 4, range: 20 },
  'brew.open': { variants: 2, loudness: -31, bus: 'sfx', pitch: 1, maxVoices: 1, ref: 4, range: 24 },
  'tree.fall': { variants: 2, loudness: -25, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 40 },
  explosion: { variants: 2, loudness: -19, bus: 'sfx', pitch: 1, maxVoices: 3, ref: 8, range: 80 },
  'tnt.fuse': { variants: 1, loudness: -31, bus: 'sfx', pitch: 1, maxVoices: 4, ref: 4, range: 24 },
  'geyser.burst': { variants: 2, loudness: -26, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 40 },
  'geyser.warn': { variants: 2, loudness: -31, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 4, range: 28 },
  'spawner.wake': { variants: 1, loudness: -28, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 32 },

  // Projectiles and magic
  'proj.fire': { variants: 2, loudness: -29, bus: 'sfx', pitch: 1.5, maxVoices: 4, minInterval: 0.08, ref: 4, range: 40 },
  'proj.fire.hit': { variants: 2, loudness: -24, bus: 'sfx', pitch: 1.5, maxVoices: 4, minInterval: 0.05, ref: 5, range: 48 },
  'proj.ice': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1.5, maxVoices: 4, minInterval: 0.08, ref: 4, range: 36 },
  'proj.crystal': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1.5, maxVoices: 4, minInterval: 0.08, ref: 4, range: 36 },
  'proj.bone': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1.5, maxVoices: 4, minInterval: 0.08, ref: 4, range: 36 },
  'proj.spore': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1.5, maxVoices: 4, minInterval: 0.08, ref: 4, range: 36 },
  'proj.magic': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1.5, maxVoices: 4, minInterval: 0.08, ref: 4, range: 36 },
  'proj.hit': { variants: 2, loudness: -29, bus: 'sfx', pitch: 2, maxVoices: 4, minInterval: 0.05, ref: 4, range: 32 },
  'proj.shatter': { variants: 2, loudness: -28, bus: 'sfx', pitch: 2, maxVoices: 4, minInterval: 0.05, ref: 4, range: 32 },
  'proj.splat': { variants: 2, loudness: -29, bus: 'sfx', pitch: 2, maxVoices: 4, minInterval: 0.05, ref: 4, range: 32 },
  'magic.buff': { variants: 1, loudness: -29, bus: 'ui', maxVoices: 1, minInterval: 0.5 },
  'magic.debuff': { variants: 1, loudness: -29, bus: 'sfx', maxVoices: 1, minInterval: 1 },
  'magic.frost': { variants: 1, loudness: -23, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 48 },
  'magic.slam': { variants: 2, loudness: -22, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 48 },
  'magic.windup': { variants: 2, loudness: -30, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 40 },
  'magic.shield': { variants: 1, loudness: -28, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 40 },
  'magic.shield.break': { variants: 1, loudness: -25, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 6, range: 48 },
  'idol.channel': { variants: 1, loudness: -29, bus: 'sfx', maxVoices: 1 },
  'idol.teleport': { variants: 1, loudness: -25, bus: 'sfx', maxVoices: 1 },
  'idol.fail': { variants: 1, loudness: -31, bus: 'sfx', maxVoices: 1 },

  // Dungeons and guardians
  'dungeon.enter': { variants: 1, loudness: -25, bus: 'ui', maxVoices: 1 },
  'boss.engage': { variants: 1, loudness: -21, bus: 'sfx', maxVoices: 1, minInterval: 4 },
  'boss.phase': { variants: 1, loudness: -22, bus: 'sfx', maxVoices: 1, ref: 8, range: 64 },
  'boss.defeat': { variants: 1, loudness: -21, bus: 'ui', maxVoices: 1 },

  // Night creatures (their voices are voice.<archetype>.*; see EntityVoices)
  'night.creak': { variants: 3, loudness: -31, bus: 'sfx', pitch: 1.5, maxVoices: 2, minInterval: 0.4, ref: 3, range: 24 },
  'night.flutter': { variants: 2, loudness: -31, bus: 'sfx', pitch: 1.5, maxVoices: 3, ref: 3, range: 24 },
  'night.rumble': { variants: 2, loudness: -27, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 4, range: 28 },
  'night.erupt': { variants: 2, loudness: -24, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 5, range: 40 },
  'night.emberburst': { variants: 2, loudness: -26, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 4, range: 32 },
  'night.splash': { recipe: 'player.splash', variants: 2, loudness: -26, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 4, range: 32 },
  'night.hoof': { variants: 2, loudness: -31, bus: 'sfx', pitch: 1.5, maxVoices: 2, minInterval: 0.25, ref: 3, range: 28 },
  'night.slam': { variants: 2, loudness: -24, bus: 'sfx', pitch: 1, maxVoices: 2, ref: 5, range: 40 },
  'night.slash': { variants: 3, loudness: -30, bus: 'sfx', pitch: 1.5, maxVoices: 3, minInterval: 0.08, ref: 3, range: 24 },
  'night.vanish': { variants: 2, loudness: -33, bus: 'sfx', pitch: 2, maxVoices: 3, ref: 3, range: 24 },

  // Ambience details (beds are handled by AmbienceController)
  'amb.drip': { variants: 4, loudness: -33, bus: 'ambience', pitch: 2, maxVoices: 2, ref: 3, range: 30 },
  'amb.lavapop': { variants: 3, loudness: -31, bus: 'ambience', pitch: 2, maxVoices: 2, ref: 3, range: 30 },
  'amb.icecreak': { variants: 3, loudness: -33, bus: 'ambience', pitch: 2, maxVoices: 1, ref: 3, range: 30 },
  'amb.crystalping': { variants: 4, loudness: -33, bus: 'ambience', maxVoices: 2, ref: 3, range: 30 },
  'amb.bonechime': { variants: 3, loudness: -35, bus: 'ambience', pitch: 2, maxVoices: 1, ref: 3, range: 30 },
  'amb.sporepuff': { variants: 3, loudness: -35, bus: 'ambience', pitch: 2, maxVoices: 2, ref: 3, range: 30 },
  'amb.bird': { variants: 4, loudness: -35, bus: 'ambience', pitch: 2, maxVoices: 2, ref: 3, range: 30 },
  'amb.frog': { variants: 3, loudness: -33, bus: 'ambience', pitch: 2, maxVoices: 2, ref: 3, range: 30 },
  'amb.owl': { variants: 2, loudness: -36, bus: 'ambience', pitch: 1.5, maxVoices: 1, ref: 3, range: 30 },
  'amb.distantrumble': { variants: 2, loudness: -30, bus: 'ambience', pitch: 2, maxVoices: 1, ref: 3, range: 30 },
})

export type NamedSoundId = keyof typeof SOUND_DEFS
export type BlockSoundId = `block.${BlockSoundMaterial}.${BlockSoundAction}`
export type VoiceSoundId = `voice.${VoiceArchetype}.${VoiceKind}`
export type SoundId = NamedSoundId | BlockSoundId | VoiceSoundId

/** Look up any sound's definition (named, block or voice). */
export function getSoundDef(id: string): SoundDef | null {
  const named = (SOUND_DEFS as Record<string, SoundDef>)[id]
  if (named) return named
  const parts = id.split('.')
  if (parts.length !== 3) return null
  if (parts[0] === 'block' && (BLOCK_SOUND_MATERIALS as readonly string[]).includes(parts[1])) {
    const action = BLOCK_ACTION_DEFS[parts[2] as BlockSoundAction]
    return action ? { recipe: id, ...action } : null
  }
  if (parts[0] === 'voice') {
    const archetype = CREATURE_VOICES[parts[1] as VoiceArchetype]
    const kind = VOICE_KIND_DEFS[parts[2] as VoiceKind]
    return archetype && kind && archetype[parts[2] as VoiceKind] ? { recipe: id, ...kind } : null
  }
  return null
}

/** Named sounds not in the startup set (rendered right after it, in the background). */
export function getDeferredSoundIds(): string[] {
  return (Object.entries(SOUND_DEFS) as [string, SoundDef][]).filter(([, def]) => !def.preload).map(([id]) => id)
}

/** Ids rendered first at startup. */
export function getPreloadSoundIds(): string[] {
  const ids: string[] = []
  for (const material of BLOCK_SOUND_MATERIALS) {
    for (const action of Object.keys(BLOCK_ACTION_DEFS)) ids.push(`block.${material}.${action}`)
  }
  for (const [id, def] of Object.entries(SOUND_DEFS) as [string, SoundDef][]) {
    if (def.preload) ids.push(id)
  }
  return ids
}

/** Every voice sound id of an archetype (preloaded when such a creature first appears). */
export function getVoiceSoundIds(archetype: VoiceArchetype): VoiceSoundId[] {
  const kinds = Object.keys(CREATURE_VOICES[archetype]) as VoiceKind[]
  return kinds.map((kind) => `voice.${archetype}.${kind}` as VoiceSoundId)
}
