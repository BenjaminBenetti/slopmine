/**
 * Creature voices: hurt, death and idle sounds per voice archetype. Mobs are
 * mapped to an archetype by entity type (EntityVoices.ts); archetypes keep the
 * recipe count small while every creature family sounds like itself.
 *
 * The impact of a hit is a separate sound chosen by what the creature is made
 * of (`hit.<material>`); a voice's `hurt` is only the creature's reaction, so
 * creatures that don't cry out (crystal constructs, skeletons) have none.
 */

import { BLOCK_SOUND_RECIPES, creak } from './blockSounds.ts'
import { voice } from './sfxRecipes.ts'
import {
  addDenseModes,
  addGrains,
  addModes,
  addNoiseBurst,
  addSine,
  biquad,
  normalize,
  range,
  samples,
  swellEnv,
  trimTail,
  type Rng,
} from './dsp.ts'

type Recipe = (rng: Rng, sr: number) => Float32Array

export type VoiceKind = 'hurt' | 'death' | 'idle'

function finish(buf: Float32Array, sr: number): Float32Array {
  return trimTail(normalize(buf, 0.9), sr)
}

type Formants = readonly [number, number, number][]

const OO: Formants = [
  [350, 6, 1],
  [800, 7, 0.45],
  [2400, 9, 0.12],
]
const AH: Formants = [
  [750, 6, 1],
  [1200, 7, 0.55],
  [2600, 9, 0.18],
]
const EH: Formants = [
  [550, 6, 1],
  [1750, 8, 0.5],
  [2600, 9, 0.2],
]
const NASAL: Formants = [
  [900, 5, 1],
  [1500, 6, 0.6],
  [2900, 8, 0.25],
]
const GROWL: Formants = [
  [300, 4, 1],
  [700, 5, 0.5],
  [1500, 6, 0.2],
]

/** One vocal call: f0 contour from `a` through `b` to `c` (Hz) over `length`. */
function call(opts: {
  length: [number, number]
  pitch: [number, number, number]
  pitchJitter?: number
  formants: Formants
  rough?: number
  roughRate?: number
  breath?: number
  vibrato?: number
  vibratoRate?: number
  attack?: number
}): Recipe {
  return (rng, sr) => {
    const length = range(rng, opts.length[0], opts.length[1])
    const j = 1 + (opts.pitchJitter ?? 0.08) * (rng() * 2 - 1)
    const [a, b, c] = opts.pitch.map((p) => p * j)
    const b0 = samples(length + 0.05, sr)
    voice(b0, sr, rng, {
      length,
      f0: (t) => {
        const u = t / length
        return u < 0.35 ? a + (b - a) * (u / 0.35) : b + (c - b) * ((u - 0.35) / 0.65)
      },
      formants: opts.formants,
      amp: 1,
      attack: opts.attack ?? Math.min(0.04, length * 0.2),
      release: length * 0.5,
      breath: opts.breath ?? 0.06,
      rough: opts.rough ?? 0,
      roughRate: opts.roughRate,
      vibrato: opts.vibrato ?? 0,
      vibratoRate: opts.vibratoRate,
    })
    return finish(b0, sr)
  }
}

/** Layer two recipes (same length budget). */
function layer(a: Recipe, b: Recipe, bGain: number): Recipe {
  return (rng, sr) => {
    const x = a(rng, sr)
    const y = b(rng, sr)
    const out = new Float32Array(Math.max(x.length, y.length))
    out.set(x)
    for (let i = 0; i < y.length; i++) out[i] += y[i] * bGain
    return finish(out, sr)
  }
}

function hiss(length: number, growl: number): Recipe {
  return (rng, sr) => {
    const b = samples(length + 0.05, sr)
    addNoiseBurst(b, sr, rng, { duration: length, amp: 0.8, type: 'highpass', freq: range(rng, 2500, 3500), attack: length * 0.15, tau: length * 0.4 })
    if (growl > 0) {
      voice(b, sr, rng, { length: length * 0.8, f0: () => range(rng, 65, 80), formants: GROWL, amp: growl, rough: 0.6, roughRate: 28, breath: 0.2 })
    }
    return finish(b, sr)
  }
}

/** Dry clatter of bones (or shell): many short knocks, no ringing pitch. */
function rattle(count: number, spread: number, lo: number, hi: number): Recipe {
  return (rng, sr) => {
    const b = samples(spread + 0.1, sr)
    for (let i = 0; i < count; i++) {
      const at = Math.pow(rng(), 1.3) * spread
      const center = range(rng, lo, hi)
      const amp = range(rng, 0.5, 1)
      addDenseModes(b, sr, rng, { count: 6, lo: center * 0.7, hi: center * 2.5, decay: 0.008, amp: amp * 0.5, start: at, tilt: 0.6 })
      addNoiseBurst(b, sr, rng, { start: at, duration: 0.015, amp: amp * 0.5, freq: center * 1.8, q: 1.5, tau: 0.003 })
    }
    return finish(b, sr)
  }
}

function chitter(length: number, rate: number): Recipe {
  return (rng, sr) => {
    const b = samples(length + 0.05, sr)
    let t = 0
    while (t < length) {
      addNoiseBurst(b, sr, rng, { start: t, duration: 0.006, amp: range(rng, 0.4, 1) * Math.sin((Math.PI * t) / length), freq: range(rng, 3000, 5500), q: 3, tau: 0.0015 })
      t += 1 / (rate * range(rng, 0.7, 1.3))
    }
    return finish(b, sr)
  }
}

function ghost(length: number, lo: number, hi: number, whistle: number): Recipe {
  return (rng, sr) => {
    const b = samples(length + 0.1, sr)
    const env = swellEnv(length * 0.35, length, length * 0.5)
    const f = range(rng, lo, hi)
    // Airy moan: breath through moving vowel formants.
    voice(b, sr, rng, { length, f0: (t) => f * (1 + 0.25 * Math.sin((Math.PI * t) / length)), formants: OO, amp: 0.5, breath: 1.2, vibrato: 0.02, vibratoRate: 4 })
    addSine(b, sr, (t) => f * 4 * (1 + 0.03 * Math.sin(t * 30)) * (1 + 0.2 * Math.sin((Math.PI * t) / length)), (t) => whistle * env(t), 0, length)
    return finish(b, sr)
  }
}

/** A crystal body shattering: a glassy crack, shards breaking off and skittering. */
function crystalShatter(rng: Rng, sr: number): Float32Array {
  const b = samples(0.9, sr)
  addNoiseBurst(b, sr, rng, { duration: 0.1, amp: 0.7, type: 'highpass', freq: 2800, attack: 0.001, tau: 0.025 })
  for (let i = 0; i < 10; i++) {
    addDenseModes(b, sr, rng, { count: 6, lo: 1400, hi: 6500, decay: 0.045, amp: range(rng, 0.1, 0.25), start: Math.pow(rng(), 2) * 0.45, tilt: 0.4 })
  }
  addGrains(b, sr, rng, { count: 30, spread: 0.6, grainLength: [0.001, 0.005], freq: [2500, 8000], amp: 0.35, bunch: 2 })
  return finish(b, sr)
}

/** Plates and mail hitting the ground. */
function armorClatter(buf: Float32Array, sr: number, rng: Rng, start: number, pieces: number): void {
  for (let i = 0; i < pieces; i++) {
    const at = start + i * range(rng, 0.06, 0.12)
    addDenseModes(buf, sr, rng, { count: 12, lo: 500, hi: 4000, decay: 0.05, amp: 0.4 - i * 0.05, start: at, tilt: 0.7 })
    addNoiseBurst(buf, sr, rng, { start: at, duration: 0.03, amp: 0.3, type: 'highpass', freq: 2200, tau: 0.006 })
  }
}

const soft = BLOCK_SOUND_RECIPES.soft

/** Dry straw rustling: a cloud of tiny high grains under a hushed hiss. */
function strawRustle(buf: Float32Array, sr: number, rng: Rng, start: number, length: number, amp: number): void {
  addGrains(buf, sr, rng, { start, count: Math.round(length * 160), spread: length, grainLength: [0.001, 0.004], freq: [2200, 7000], q: 1.2, amp, bunch: 1.3 })
  addNoiseBurst(buf, sr, rng, { start, duration: length, amp: amp * 0.35, type: 'highpass', freq: 3000, attack: length * 0.2, tau: length * 0.35 })
}

/** One soft, papery wing beat: a puff of air with no pitch. */
function wingBeat(buf: Float32Array, sr: number, rng: Rng, start: number, amp: number): void {
  addNoiseBurst(buf, sr, rng, { start, duration: 0.07, amp, type: 'bandpass', freq: range(rng, 500, 750), q: 0.8, attack: 0.012, tau: 0.02, color: 'pink' })
  addNoiseBurst(buf, sr, rng, { start: start + 0.01, duration: 0.05, amp: amp * 0.3, type: 'highpass', freq: 2500, attack: 0.008, tau: 0.012 })
}

/** A low electric rumble with crackling discharge (the Thunderhead). */
function stormRumble(buf: Float32Array, sr: number, rng: Rng, start: number, length: number, amp: number, sparks: number): void {
  addNoiseBurst(buf, sr, rng, { start, duration: length, amp: amp * 0.6, type: 'lowpass', freq: range(rng, 240, 300), attack: length * 0.25, tau: length * 0.45, color: 'brown' })
  addNoiseBurst(buf, sr, rng, { start, duration: length, amp: amp * 0.7, type: 'bandpass', freq: range(rng, 300, 420), q: 1.3, attack: length * 0.3, tau: length * 0.4, color: 'pink' })
  addGrains(buf, sr, rng, { count: sparks, start: start + length * 0.1, spread: length * 0.8, grainLength: [0.0006, 0.003], freq: [2500, 8000], q: 1.5, amp: amp * 0.5, bunch: 1 })
}

/** A whirl of sand: a band of hiss sweeping up and back down, grains peppering it. */
function sandWhirl(buf: Float32Array, sr: number, rng: Rng, start: number, length: number, amp: number, from: number, peak: number): void {
  const n = Math.ceil(length * sr)
  const env = swellEnv(length * 0.35, length, length * 0.45)
  const i0 = Math.floor(start * sr)
  const noise = new Float32Array(n)
  for (let i = 0; i < n; i++) noise[i] = rng() * 2 - 1
  const band = noise.slice()
  // Rises to `peak` at 40 % of the length, falls back toward `from`
  biquad(band, sr, 'bandpass', (t) => {
    const u = t / length
    return u < 0.4 ? from + (peak - from) * (u / 0.4) : peak + (from - peak) * ((u - 0.4) / 0.6)
  }, 1.6)
  for (let i = 0; i < n && i0 + i < buf.length; i++) buf[i0 + i] += band[i] * env(i / sr) * amp
  addGrains(buf, sr, rng, { count: Math.round(length * 90), start, spread: length, grainLength: [0.0005, 0.002], freq: [3000, 8000], q: 1.2, amp: amp * 0.35, bunch: 1 })
}

/** A breathy, pitchless whisper: noise through moving vowel formants. */
function whisper(buf: Float32Array, sr: number, rng: Rng, start: number, length: number, amp: number): void {
  voice(buf, sr, rng, {
    start,
    length,
    f0: () => range(rng, 180, 220),
    formants: [
      [(t) => 500 + 300 * Math.sin((Math.PI * t) / length), 6, 1],
      [(t) => 1500 + 600 * Math.sin((Math.PI * t) / length + 1), 8, 0.5],
      [2800, 9, 0.25],
    ],
    amp,
    breath: 4,
    attack: length * 0.3,
    release: length * 0.5,
  })
}

/** Faint glassy chimes with no fixed pitch (the marsh wisp's glimmer). */
function glimmer(buf: Float32Array, sr: number, rng: Rng, start: number, count: number, spread: number, amp: number): void {
  for (let i = 0; i < count; i++) {
    addDenseModes(buf, sr, rng, { count: 3, lo: 1800, hi: 5200, decay: range(rng, 0.12, 0.3), amp: amp * range(rng, 0.5, 1), start: start + rng() * spread, tilt: 0.4 })
  }
}

export type VoiceArchetype =
  | 'cow'
  | 'pig'
  | 'deer'
  | 'small'
  | 'fox'
  | 'monkey'
  | 'critter'
  | 'shell'
  | 'snake'
  | 'reptile'
  | 'canine'
  | 'bear'
  | 'hog'
  | 'slime'
  | 'insect'
  | 'drone'
  | 'wisp'
  | 'fungal'
  | 'treant'
  | 'skeleton'
  | 'ghoul'
  | 'revenant'
  | 'wraith'
  | 'crystal'
  | 'knight'
  | 'humanoid'
  | 'boss-bone'
  | 'boss-fire'
  | 'boss-prism'
  | 'boss-frost'
  | 'boss-spore'
  | 'straw'
  | 'moth'
  | 'ember'
  | 'angler'
  | 'bellow'
  | 'burrower'
  | 'storm'
  | 'whirl'
  | 'bigcat'
  | 'will'

export const CREATURE_VOICES: Record<VoiceArchetype, Partial<Record<VoiceKind, Recipe>>> = {
  cow: {
    hurt: call({ length: [0.3, 0.4], pitch: [140, 125, 100], formants: OO, rough: 0.15 }),
    death: call({ length: [0.7, 0.8], pitch: [125, 110, 70], formants: OO, rough: 0.2 }),
    idle: call({ length: [0.8, 1.1], pitch: [100, 112, 95], formants: OO, rough: 0.1, attack: 0.12 }),
  },
  pig: {
    hurt: call({ length: [0.25, 0.32], pitch: [600, 760, 520], formants: NASAL, rough: 0.2, roughRate: 40 }),
    death: call({ length: [0.5, 0.6], pitch: [650, 700, 350], formants: NASAL, rough: 0.25, roughRate: 40 }),
    idle: call({ length: [0.18, 0.28], pitch: [170, 160, 140], formants: NASAL, rough: 0.6, roughRate: 26, breath: 0.15 }),
  },
  deer: {
    hurt: call({ length: [0.18, 0.24], pitch: [520, 560, 420], formants: EH, vibrato: 0.04, vibratoRate: 9 }),
    death: call({ length: [0.4, 0.5], pitch: [480, 450, 300], formants: EH, vibrato: 0.05, vibratoRate: 8 }),
    idle: call({ length: [0.25, 0.35], pitch: [380, 420, 360], formants: EH, vibrato: 0.05, vibratoRate: 8 }),
  },
  small: {
    hurt: call({ length: [0.07, 0.1], pitch: [1100, 1250, 900], formants: EH, pitchJitter: 0.1 }),
    death: call({ length: [0.16, 0.2], pitch: [1100, 1000, 650], formants: EH }),
  },
  fox: {
    hurt: call({ length: [0.1, 0.14], pitch: [700, 800, 480], formants: AH, rough: 0.15 }),
    death: call({ length: [0.3, 0.38], pitch: [720, 650, 380], formants: AH }),
    idle: call({ length: [0.1, 0.13], pitch: [650, 750, 600], formants: AH }),
  },
  monkey: {
    hurt: call({ length: [0.14, 0.2], pitch: [700, 900, 600], formants: AH, pitchJitter: 0.12 }),
    death: call({ length: [0.35, 0.45], pitch: [700, 650, 380], formants: AH }),
    idle: call({ length: [0.25, 0.35], pitch: [420, 650, 560], formants: OO, vibrato: 0.03, vibratoRate: 11 }),
  },
  critter: {
    death: rattle(6, 0.16, 1400, 3000),
  },
  shell: {
    death: soft.break,
  },
  snake: {
    hurt: hiss(0.25, 0),
    death: hiss(0.5, 0),
    idle: hiss(0.45, 0),
  },
  reptile: {
    hurt: hiss(0.3, 0.6),
    death: hiss(0.7, 0.8),
    idle: hiss(0.6, 0.4),
  },
  canine: {
    hurt: call({ length: [0.13, 0.18], pitch: [720, 800, 460], formants: AH, rough: 0.1 }),
    death: call({ length: [0.45, 0.55], pitch: [650, 560, 300], formants: OO, vibrato: 0.04, vibratoRate: 7 }),
    idle: call({ length: [0.5, 0.75], pitch: [95, 105, 90], formants: GROWL, rough: 0.7, roughRate: 30, breath: 0.25 }),
  },
  bear: {
    hurt: call({ length: [0.25, 0.35], pitch: [170, 190, 130], formants: GROWL, rough: 0.5, roughRate: 26, breath: 0.2 }),
    death: call({ length: [0.8, 1.0], pitch: [150, 130, 70], formants: GROWL, rough: 0.6, roughRate: 22, breath: 0.25 }),
    idle: call({ length: [0.6, 0.9], pitch: [85, 95, 80], formants: GROWL, rough: 0.7, roughRate: 24, breath: 0.3 }),
  },
  hog: {
    hurt: call({ length: [0.25, 0.32], pitch: [420, 560, 380], formants: NASAL, rough: 0.35, roughRate: 34 }),
    death: call({ length: [0.5, 0.6], pitch: [480, 520, 240], formants: NASAL, rough: 0.35, roughRate: 34 }),
    idle: call({ length: [0.2, 0.3], pitch: [120, 115, 100], formants: NASAL, rough: 0.7, roughRate: 22, breath: 0.2 }),
  },
  slime: {
    death: soft.break,
    idle: soft.step,
  },
  insect: {
    hurt: chitter(0.12, 70),
    death: chitter(0.3, 55),
    idle: chitter(0.22, 45),
  },
  drone: {
    hurt: chitter(0.1, 120),
    death: (rng, sr) => {
      const b = samples(0.5, sr)
      addNoiseBurst(b, sr, rng, { duration: 0.35, amp: 0.8, freq: (t) => 600 + t * 3000, q: 1.5, attack: 0.005, tau: 0.08 })
      addSine(b, sr, (t) => 200 + 300 * Math.min(1, t / 0.05), (t) => 0.6 * Math.exp(-t / 0.05), 0, 0.3)
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      // Soft wing buzz.
      const b = samples(0.6, sr)
      const f = range(rng, 150, 190)
      const env = swellEnv(0.12, 0.55, 0.25)
      addSine(b, sr, (t) => f * (1 + 0.02 * Math.sin(t * 25)), (t) => 0.4 * env(t), 0, 0.55)
      addSine(b, sr, (t) => f * 2.02, (t) => 0.25 * env(t), 0, 0.55)
      addSine(b, sr, (t) => f * 3.01, (t) => 0.15 * env(t), 0, 0.55)
      return finish(b, sr)
    },
  },
  wisp: {
    death: (rng, sr) => crystalShatter(rng, sr),
    idle: (rng, sr) => {
      const b = samples(0.8, sr)
      const pitches = [1318.5, 1568, 1760, 2093]
      for (let i = 0; i < 3; i++) {
        const f = pitches[Math.floor(rng() * pitches.length)]
        addModes(b, sr, [{ freq: f, amp: 0.6, decay: 0.15 }, { freq: f * 2.01, amp: 0.2, decay: 0.08 }], i * range(rng, 0.08, 0.15))
      }
      return finish(b, sr)
    },
  },
  fungal: {
    hurt: call({ length: [0.25, 0.32], pitch: [140, 160, 110], formants: GROWL, rough: 0.5, breath: 0.3 }),
    death: layer(call({ length: [0.6, 0.7], pitch: [130, 120, 60], formants: GROWL, rough: 0.5, breath: 0.35 }), soft.break, 0.6),
    idle: call({ length: [0.5, 0.7], pitch: [90, 100, 80], formants: GROWL, rough: 0.6, breath: 0.4 }),
  },
  treant: {
    hurt: (rng, sr) => {
      const b = samples(0.5, sr)
      creak(b, sr, rng, 0, 0.35, range(rng, 35, 50), range(rng, 300, 400), 0.8)
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(1.3, sr)
      creak(b, sr, rng, 0, 0.9, range(rng, 25, 35), range(rng, 250, 320), 0.8)
      voice(b, sr, rng, { start: 0.1, length: 0.9, f0: (t) => 70 - t * 20, formants: OO, amp: 0.4, rough: 0.4, breath: 0.2 })
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      const b = samples(0.9, sr)
      creak(b, sr, rng, 0, 0.8, range(rng, 20, 30), range(rng, 260, 340), 0.7)
      return finish(b, sr)
    },
  },
  skeleton: {
    death: rattle(14, 0.4, 500, 1300),
    idle: rattle(4, 0.2, 800, 1300),
  },
  ghoul: {
    hurt: call({ length: [0.2, 0.28], pitch: [190, 220, 150], formants: AH, rough: 0.5, roughRate: 36, breath: 0.6 }),
    death: call({ length: [0.6, 0.75], pitch: [180, 160, 80], formants: AH, rough: 0.6, roughRate: 30, breath: 0.7 }),
    idle: call({ length: [0.5, 0.7], pitch: [110, 125, 100], formants: GROWL, rough: 0.6, roughRate: 30, breath: 0.8 }),
  },
  revenant: {
    hurt: call({ length: [0.3, 0.4], pitch: [90, 105, 75], formants: OO, rough: 0.45, breath: 0.3 }),
    death: layer(call({ length: [0.9, 1.1], pitch: [85, 75, 45], formants: OO, rough: 0.45, breath: 0.35 }), BLOCK_SOUND_RECIPES.ice.break, 0.7),
    idle: call({ length: [0.9, 1.2], pitch: [62, 70, 58], formants: OO, rough: 0.4, breath: 0.4, attack: 0.2 }),
  },
  wraith: {
    hurt: ghost(0.35, 280, 360, 0.08),
    death: ghost(1.0, 240, 300, 0.12),
    idle: ghost(1.1, 200, 260, 0.1),
  },
  crystal: {
    death: (rng, sr) => crystalShatter(rng, sr),
  },
  knight: {
    // The armour's clank is the hit sound; the knight inside grunts
    hurt: call({ length: [0.18, 0.24], pitch: [125, 150, 100], formants: AH, rough: 0.35, breath: 0.15 }),
    death: (rng, sr) => {
      const b = samples(1.1, sr)
      voice(b, sr, rng, { length: 0.5, f0: (t) => 130 * Math.pow(0.6, t / 0.5), formants: AH, amp: 0.6, rough: 0.35, wobble: 0.02 })
      armorClatter(b, sr, rng, 0.35, 4)
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      // Armour shifting as it moves
      const b = samples(0.4, sr)
      for (let i = 0; i < 2; i++) {
        addDenseModes(b, sr, rng, { count: 8, lo: 1200, hi: 5000, decay: 0.02, amp: 0.4, start: i * range(rng, 0.12, 0.2), tilt: 0.6 })
      }
      return finish(b, sr)
    },
  },
  humanoid: {
    hurt: call({ length: [0.16, 0.22], pitch: [170, 185, 130], formants: AH, rough: 0.2 }),
    death: call({ length: [0.5, 0.6], pitch: [180, 160, 90], formants: AH, rough: 0.25 }),
    idle: (rng, sr) => {
      // A murmured incantation: breathy, low.
      const b = samples(0.8, sr)
      voice(b, sr, rng, { length: 0.7, f0: (t) => 140 + 15 * Math.sin(t * 9), formants: EH, amp: 0.6, breath: 0.9, rough: 0.2 })
      return finish(b, sr)
    },
  },
  'boss-bone': {
    hurt: call({ length: [0.25, 0.3], pitch: [95, 115, 80], formants: OO, rough: 0.45, breath: 0.2 }),
    death: layer(rattle(24, 0.9, 350, 1000), call({ length: [1.2, 1.4], pitch: [90, 80, 40], formants: OO, rough: 0.5 }), 0.8),
    idle: call({ length: [0.9, 1.2], pitch: [70, 78, 62], formants: OO, rough: 0.5, breath: 0.3 }),
  },
  'boss-fire': {
    hurt: call({ length: [0.3, 0.4], pitch: [110, 125, 85], formants: GROWL, rough: 0.6, roughRate: 24, breath: 0.4 }),
    death: (rng, sr) => {
      const b = samples(2.2, sr)
      voice(b, sr, rng, { length: 1.6, f0: (t) => 100 * Math.pow(0.45, t / 1.6), formants: GROWL, amp: 0.8, rough: 0.6, roughRate: 22, breath: 0.5 })
      addGrains(b, sr, rng, { count: 60, spread: 1.8, grainLength: [0.001, 0.004], freq: [1500, 6000], amp: 0.3, bunch: 1 })
      return finish(b, sr)
    },
    idle: call({ length: [1.0, 1.3], pitch: [60, 68, 55], formants: GROWL, rough: 0.7, roughRate: 20, breath: 0.5, attack: 0.25 }),
  },
  'boss-prism': {
    death: (rng, sr) => {
      const b = samples(2.5, sr)
      b.set(crystalShatter(rng, sr).subarray(0, Math.min(b.length, Math.ceil(0.9 * sr))))
      const env = swellEnv(0.05, 2.3, 1.8)
      for (const f of [220, 330, 440, 554]) addSine(b, sr, (t) => f * (1 - 0.08 * (t / 2.3)), (t) => 0.15 * env(t), 0, 2.3)
      return finish(b, sr)
    },
    idle: (_rng, sr) => {
      const b = samples(1.6, sr)
      const env = swellEnv(0.5, 1.5, 0.8)
      for (const f of [220, 277.2, 330]) addSine(b, sr, (t) => f * (1 + 0.004 * Math.sin(t * 6 + f)), (t) => 0.3 * env(t), 0, 1.5)
      return finish(b, sr)
    },
  },
  'boss-frost': {
    hurt: call({ length: [0.3, 0.38], pitch: [100, 115, 85], formants: OO, rough: 0.4, breath: 0.4 }),
    death: layer(call({ length: [1.3, 1.5], pitch: [95, 85, 45], formants: OO, rough: 0.4, breath: 0.45 }), BLOCK_SOUND_RECIPES.ice.break, 0.8),
    idle: ghost(1.4, 160, 200, 0.12),
  },
  // Night creatures
  straw: {
    // The Stillwatcher never cries out: its frame creaks, its straw rustles
    hurt: (rng, sr) => {
      const b = samples(0.4, sr)
      strawRustle(b, sr, rng, 0, 0.25, 0.7)
      creak(b, sr, rng, 0.02, 0.2, range(rng, 45, 60), range(rng, 380, 480), 0.5)
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(1.4, sr)
      creak(b, sr, rng, 0, 0.7, range(rng, 25, 35), range(rng, 300, 380), 0.8)
      strawRustle(b, sr, rng, 0.5, 0.8, 0.8)
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      const b = samples(0.8, sr)
      strawRustle(b, sr, rng, 0, 0.5, 0.5)
      creak(b, sr, rng, range(rng, 0.1, 0.3), 0.3, range(rng, 30, 40), range(rng, 320, 420), 0.45)
      return finish(b, sr)
    },
  },
  moth: {
    hurt: (rng, sr) => {
      const b = samples(0.35, sr)
      voice(b, sr, rng, { length: 0.08, f0: (t) => 1500 + 900 * Math.min(1, t / 0.03), formants: EH, amp: 0.6, breath: 0.5 })
      wingBeat(b, sr, rng, 0.02, 0.8)
      wingBeat(b, sr, rng, 0.12, 0.6)
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(0.9, sr)
      for (let i = 0; i < 5; i++) wingBeat(b, sr, rng, i * range(rng, 0.08, 0.13), 0.9 - i * 0.15)
      addGrains(b, sr, rng, { count: 40, start: 0.15, spread: 0.6, grainLength: [0.001, 0.003], freq: [3000, 7000], amp: 0.25 })
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      // A soft double flap
      const b = samples(0.35, sr)
      wingBeat(b, sr, rng, 0, 1)
      wingBeat(b, sr, rng, range(rng, 0.11, 0.15), 0.8)
      return finish(b, sr)
    },
  },
  ember: {
    hurt: (rng, sr) => {
      const b = samples(0.5, sr)
      addNoiseBurst(b, sr, rng, { duration: 0.3, amp: 0.6, type: 'highpass', freq: 2600, attack: 0.01, tau: 0.08 })
      addGrains(b, sr, rng, { count: 26, spread: 0.35, grainLength: [0.001, 0.004], freq: [1500, 6000], amp: 0.6, bunch: 1.5 })
      voice(b, sr, rng, { length: 0.25, f0: (t) => 95 - t * 60, formants: GROWL, amp: 0.4, rough: 0.6, roughRate: 28, breath: 0.8 })
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(1.8, sr)
      voice(b, sr, rng, { length: 1.1, f0: (t) => 80 * Math.pow(0.6, t / 1.1), formants: GROWL, amp: 0.6, rough: 0.5, roughRate: 22, breath: 1.0 })
      addGrains(b, sr, rng, { count: 70, start: 0.2, spread: 1.4, grainLength: [0.001, 0.005], freq: [800, 5000], amp: 0.4, bunch: 1 })
      addNoiseBurst(b, sr, rng, { start: 0.6, duration: 0.9, amp: 0.35, type: 'lowpass', freq: 900, attack: 0.05, tau: 0.3, color: 'brown' })
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      // A low, breathy rasp with a crackle of embers
      const b = samples(1.0, sr)
      voice(b, sr, rng, { length: 0.8, f0: (t) => 72 + 8 * Math.sin(t * 5), formants: GROWL, amp: 0.5, rough: 0.55, roughRate: 26, breath: 1.1, attack: 0.15 })
      addGrains(b, sr, rng, { count: 18, spread: 0.85, grainLength: [0.001, 0.003], freq: [1800, 6000], amp: 0.35, bunch: 1 })
      return finish(b, sr)
    },
  },
  angler: {
    hurt: call({ length: [0.2, 0.28], pitch: [130, 150, 95], formants: OO, rough: 0.7, roughRate: 22, breath: 0.3 }),
    death: (rng, sr) => {
      const b = samples(1.5, sr)
      voice(b, sr, rng, { length: 0.9, f0: (t) => 110 * Math.pow(0.55, t / 0.9), formants: OO, amp: 0.7, rough: 0.6, roughRate: 18, breath: 0.4 })
      for (let i = 0; i < 16; i++) {
        const at = 0.3 + Math.pow(rng(), 0.8) * 1.0
        const f = range(rng, 180, 520)
        addSine(b, sr, (t) => f * (1 + 1.4 * (t / 0.04)), (t) => range(rng, 0.15, 0.35) * Math.exp(-t / 0.015), at, 0.06)
      }
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      // A deep bullfrog croak: a pulsed, throaty "rrrum"
      const b = samples(0.9, sr)
      voice(b, sr, rng, { length: 0.55, f0: (t) => 88 + 14 * Math.sin((Math.PI * t) / 0.55), formants: OO, amp: 0.8, rough: 0.85, roughRate: 17, breath: 0.15, attack: 0.05 })
      return finish(b, sr)
    },
  },
  bellow: {
    hurt: call({ length: [0.25, 0.32], pitch: [120, 135, 90], formants: OO, rough: 0.35, breath: 0.45 }),
    death: call({ length: [1.4, 1.7], pitch: [130, 115, 55], formants: OO, rough: 0.3, breath: 0.6, vibrato: 0.03, vibratoRate: 5 }),
    // A long, hollow moan through the trees
    idle: call({ length: [1.3, 1.7], pitch: [105, 128, 92], formants: OO, rough: 0.25, breath: 0.7, vibrato: 0.025, vibratoRate: 4.5, attack: 0.3 }),
  },
  burrower: {
    hurt: (rng, sr) => {
      const b = samples(0.5, sr)
      voice(b, sr, rng, { length: 0.3, f0: (t) => 110 - t * 80, formants: GROWL, amp: 0.6, rough: 0.8, roughRate: 34, breath: 0.4 })
      addGrains(b, sr, rng, { count: 20, spread: 0.3, grainLength: [0.002, 0.006], freq: [900, 3500], amp: 0.4, bunch: 1 })
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(1.8, sr)
      voice(b, sr, rng, { length: 1.0, f0: (t) => 95 * Math.pow(0.5, t / 1.0), formants: GROWL, amp: 0.7, rough: 0.7, roughRate: 26, breath: 0.4 })
      addNoiseBurst(b, sr, rng, { start: 0.5, duration: 1.1, amp: 0.45, type: 'highpass', freq: 1800, attack: 0.2, tau: 0.45 })
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      // A low growl from under the ground
      const b = samples(1.0, sr)
      addNoiseBurst(b, sr, rng, { duration: 0.85, amp: 0.6, type: 'lowpass', freq: 260, attack: 0.15, tau: 0.35, color: 'brown' })
      voice(b, sr, rng, { length: 0.7, f0: (t) => 60 + 6 * Math.sin(t * 7), formants: GROWL, amp: 0.45, rough: 0.8, roughRate: 22, breath: 0.3, attack: 0.15 })
      return finish(b, sr)
    },
  },
  // Weather creatures
  storm: {
    // The Thunderhead: a cloud that rumbles and crackles
    hurt: (rng, sr) => {
      const b = samples(0.6, sr)
      addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 0.7, type: 'highpass', freq: 2600, attack: 0.0005, tau: 0.02 })
      stormRumble(b, sr, rng, 0.02, 0.45, 0.8, 18)
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(2.0, sr)
      addNoiseBurst(b, sr, rng, { duration: 0.15, amp: 0.9, type: 'highpass', freq: 1800, attack: 0.0005, tau: 0.04 })
      stormRumble(b, sr, rng, 0.03, 1.7, 0.9, 70)
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      const b = samples(1.3, sr)
      stormRumble(b, sr, rng, 0, range(rng, 0.9, 1.2), 0.8, 22)
      return finish(b, sr)
    },
  },
  whirl: {
    // The Dune Dervish: a whirlwind of sand
    hurt: (rng, sr) => {
      const b = samples(0.55, sr)
      addGrains(b, sr, rng, { count: 40, spread: 0.3, grainLength: [0.0008, 0.004], freq: [1500, 6000], amp: 0.6, bunch: 1.5 })
      sandWhirl(b, sr, rng, 0, 0.45, 0.7, 900, 2600)
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(1.8, sr)
      sandWhirl(b, sr, rng, 0, 0.8, 0.8, 1500, 3500)
      // The column collapses: a long pour of sand settling
      addGrains(b, sr, rng, { count: 160, start: 0.4, spread: 1.3, grainLength: [0.001, 0.005], freq: [800, 5000], amp: 0.45, bunch: 1.4 })
      addNoiseBurst(b, sr, rng, { start: 0.45, duration: 1.2, amp: 0.3, type: 'lowpass', freq: 900, attack: 0.05, tau: 0.4, color: 'pink' })
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      const b = samples(1.4, sr)
      sandWhirl(b, sr, rng, 0, range(rng, 1.0, 1.3), 0.8, range(rng, 700, 1000), range(rng, 2200, 3200))
      return finish(b, sr)
    },
  },
  bigcat: {
    // The Whiteout Stalker: a big cat's growls, snarls and chuffs
    hurt: call({ length: [0.22, 0.3], pitch: [230, 260, 170], formants: AH, rough: 0.55, roughRate: 30, breath: 0.35 }),
    death: call({ length: [0.9, 1.1], pitch: [190, 160, 75], formants: GROWL, rough: 0.6, roughRate: 24, breath: 0.4 }),
    idle: (rng, sr) => {
      const b = samples(1.3, sr)
      voice(b, sr, rng, { length: 0.75, f0: (t) => 68 + 8 * Math.sin(t * 6), formants: GROWL, amp: 0.7, rough: 0.75, roughRate: 26, breath: 0.35, attack: 0.12 })
      // Two breathy chuffs after the growl
      for (let i = 0; i < 2; i++) {
        addNoiseBurst(b, sr, rng, { start: 0.85 + i * range(rng, 0.14, 0.2), duration: 0.09, amp: 0.45, type: 'bandpass', freq: range(rng, 500, 700), q: 0.9, attack: 0.008, tau: 0.025, color: 'pink' })
      }
      return finish(b, sr)
    },
  },
  will: {
    // The marsh wisp: an airy whisper and a faint glassy glimmer
    hurt: (rng, sr) => {
      const b = samples(0.5, sr)
      whisper(b, sr, rng, 0, 0.3, 0.8)
      addNoiseBurst(b, sr, rng, { duration: 0.2, amp: 0.25, type: 'highpass', freq: 4000, attack: 0.005, tau: 0.05 })
      glimmer(b, sr, rng, 0.02, 3, 0.15, 0.3)
      return finish(b, sr)
    },
    death: (rng, sr) => {
      const b = samples(1.6, sr)
      whisper(b, sr, rng, 0, 1.0, 0.7)
      glimmer(b, sr, rng, 0.05, 12, 1.1, 0.35)
      return finish(b, sr)
    },
    idle: (rng, sr) => {
      const b = samples(1.4, sr)
      whisper(b, sr, rng, 0, range(rng, 0.8, 1.1), 0.7)
      glimmer(b, sr, rng, 0.2, 3, 0.9, 0.25)
      return finish(b, sr)
    },
  },
  'boss-spore': {
    hurt: call({ length: [0.3, 0.38], pitch: [130, 150, 100], formants: GROWL, rough: 0.5, breath: 0.4 }),
    death: layer(call({ length: [1.3, 1.5], pitch: [120, 105, 50], formants: GROWL, rough: 0.55, breath: 0.5 }), soft.break, 0.8),
    idle: call({ length: [1.0, 1.3], pitch: [70, 80, 62], formants: GROWL, rough: 0.55, breath: 0.6, attack: 0.25 }),
  },
}
