/**
 * The single lookup from a recipe id to its renderer, shared by the audio
 * synth worker and offline analysis. Ids:
 *   block.<material>.<hit|break|place|step>   (blockSounds.ts)
 *   voice.<archetype>.<hurt|death|idle>       (creatureVoices.ts)
 *   bed.<name>, amb.<name>                    (ambience.ts)
 *   weather beds (bed.rain...), weather.<name> (weatherSounds.ts)
 *   note.<instrument>.<midi>                  (instruments.ts)
 *   anything else                             (sfxRecipes.ts)
 */

import { AMBIENCE_BEDS, AMBIENCE_DETAILS } from './ambience.ts'
import { BLOCK_SOUND_RECIPES, type BlockSoundAction, type BlockSoundMaterial } from './blockSounds.ts'
import { CREATURE_VOICES, type VoiceArchetype, type VoiceKind } from './creatureVoices.ts'
import { biquad, createRng } from './dsp.ts'
import { renderInstrumentNote, type InstrumentId } from './instruments.ts'
import { SFX_RECIPES } from './sfxRecipes.ts'
import { WEATHER_BEDS, WEATHER_SFX } from './weatherSounds.ts'
import { WATER_BEDS } from './waterSounds.ts'

export function hasRecipe(id: string): boolean {
  try {
    return findRecipe(id) !== null
  } catch {
    return false
  }
}

function findRecipe(id: string): ((seed: number, sr: number) => Float32Array) | null {
  const parts = id.split('.')
  if (parts[0] === 'block' && parts.length === 3) {
    const recipe = BLOCK_SOUND_RECIPES[parts[1] as BlockSoundMaterial]?.[parts[2] as BlockSoundAction]
    return recipe ? (seed, sr) => recipe(createRng(seed), sr) : null
  }
  if (parts[0] === 'voice' && parts.length === 3) {
    const recipe = CREATURE_VOICES[parts[1] as VoiceArchetype]?.[parts[2] as VoiceKind]
    return recipe ? (seed, sr) => recipe(createRng(seed), sr) : null
  }
  if (parts[0] === 'note' && parts.length === 3) {
    const instrument = parts[1] as InstrumentId
    const midi = Number(parts[2])
    return Number.isFinite(midi) ? (_seed, sr) => renderInstrumentNote(instrument, midi, sr) : null
  }
  const recipe = AMBIENCE_BEDS[id] ?? AMBIENCE_DETAILS[id] ?? WEATHER_BEDS[id] ?? WEATHER_SFX[id] ?? WATER_BEDS[id] ?? SFX_RECIPES[id]
  return recipe ? (seed, sr) => recipe(createRng(seed), sr) : null
}

/** Render a recipe. Throws on an unknown id. */
export function renderRecipe(id: string, seed: number, sr: number): Float32Array {
  const recipe = findRecipe(id)
  if (!recipe) throw new Error(`Unknown sound recipe: ${id}`)
  return recipe(seed, sr)
}

/**
 * Short-term loudness in dBFS: the loudest 50 ms window (10 ms hop) of the
 * signal after a 150 Hz high-pass (a rough stand-in for how much less loud
 * deep bass sounds than its energy suggests). Used to calibrate every sound
 * to its target level, so recipes never need hand-tuned gains.
 */
export function measureLoudnessDb(buf: Float32Array, sr: number): number {
  const weighted = biquad(buf.slice(), sr, 'highpass', 150, 0.707)
  const win = Math.max(1, Math.min(weighted.length, Math.round(0.05 * sr)))
  const hop = Math.max(1, Math.round(0.01 * sr))
  let best = 0
  // Running sum of squares over the window.
  let sum = 0
  for (let i = 0; i < win; i++) sum += weighted[i] * weighted[i]
  best = sum
  let start = 0
  while (start + win + hop <= weighted.length) {
    for (let i = 0; i < hop; i++) {
      const out = weighted[start + i]
      const inn = weighted[start + win + i]
      sum += inn * inn - out * out
    }
    start += hop
    if (sum > best) best = sum
  }
  const meanSquare = Math.max(1e-12, best / win)
  return 10 * Math.log10(meanSquare)
}
