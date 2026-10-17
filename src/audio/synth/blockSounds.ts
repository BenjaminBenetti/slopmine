/**
 * Block sounds: one voice per surface material, four actions each (mining
 * hit, break, place, footstep). Pure recipes - see dsp.ts.
 *
 * Every recipe returns a mono buffer normalized to a common peak; loudness is
 * calibrated per sound when the bank loads (SoundLibrary targets), so the
 * levels here only shape each sound's internal balance.
 *
 * Voicing: block sounds live in the mids and highs (crunch, grain, crack);
 * the low end is filtered away, so breaking a block crumbles rather than
 * thumps. Struck bodies (wood, bone, metal) use many short random modes, so
 * they knock instead of ringing at one pitch.
 */

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
  trimTail,
  type Mode,
  type Rng,
} from './dsp.ts'

export const BLOCK_SOUND_MATERIALS = [
  'stone',
  'wood',
  'soil',
  'grass',
  'sand',
  'gravel',
  'snow',
  'leaves',
  'glass',
  'crystal',
  'metal',
  'ice',
  'bone',
  'soft',
  'cloth',
] as const

export type BlockSoundMaterial = (typeof BLOCK_SOUND_MATERIALS)[number]
export type BlockSoundAction = 'hit' | 'break' | 'place' | 'step'

type Recipe = (rng: Rng, sr: number) => Float32Array

/** High-pass (`poles` × 12 dB/oct below `hp` Hz), normalize, trim. */
function finish(buf: Float32Array, sr: number, hp = 110, poles = 1): Float32Array {
  for (let i = 0; i < poles; i++) biquad(buf, sr, 'highpass', hp, 0.707)
  return trimTail(normalize(buf, 0.9), sr)
}

/** Breaks: steeper and higher low cut - a crumble, never a thump. */
function finishBreak(buf: Float32Array, sr: number): Float32Array {
  return finish(buf, sr, 170, 2)
}

/**
 * Struck wood: a dense cluster of short resonances (grain, fibres, hollows)
 * around `center`, the fibrous noise of the blow and a soft low-mid body.
 */
export function woodKnock(
  buf: Float32Array,
  sr: number,
  rng: Rng,
  opts: { start?: number; center: number; decay: number; amp: number; click?: number },
): void {
  const start = opts.start ?? 0
  const { center, decay, amp } = opts
  addDenseModes(buf, sr, rng, { count: 24, lo: center * 0.5, hi: center * 3.4, decay: decay * 0.8, amp: amp * 0.32, start, tilt: 0.9 })
  addNoiseBurst(buf, sr, rng, { start, duration: decay * 5, amp: amp * 0.9, freq: center * range(rng, 0.9, 1.15), q: 1.2, attack: 0.0006, tau: decay * 0.45 })
  addNoiseBurst(buf, sr, rng, { start, duration: decay * 4, amp: amp * 0.3, freq: center * 0.5, q: 0.8, attack: 0.001, tau: decay * 0.6 })
  if (opts.click) addNoiseBurst(buf, sr, rng, { start, duration: 0.006, amp: amp * opts.click, type: 'highpass', freq: 2800, tau: 0.0012 })
}

function metalModes(rng: Rng, f0: number, decay: number): Mode[] {
  return [
    { freq: f0, amp: 1, decay },
    { freq: f0 * range(rng, 2.7, 2.8), amp: 0.7, decay: decay * 0.75 },
    { freq: f0 * range(rng, 5.3, 5.5), amp: 0.45, decay: decay * 0.5 },
    { freq: f0 * range(rng, 8.8, 9.1), amp: 0.28, decay: decay * 0.35 },
    { freq: f0 * range(rng, 13, 13.4), amp: 0.12, decay: decay * 0.2 },
  ]
}

function glassModes(rng: Rng, f0: number, decay: number): Mode[] {
  return [
    { freq: f0, amp: 1, decay },
    { freq: f0 * range(rng, 1.55, 1.7), amp: 0.6, decay: decay * 0.8 },
    { freq: f0 * range(rng, 2.3, 2.5), amp: 0.4, decay: decay * 0.55 },
    { freq: f0 * range(rng, 3.2, 3.5), amp: 0.25, decay: decay * 0.4 },
  ]
}

/** Musical crystal partials (near-harmonic, long ring). */
function crystalModes(rng: Rng, f0: number, decay: number): Mode[] {
  return [
    { freq: f0, amp: 1, decay },
    { freq: f0 * range(rng, 2.0, 2.02), amp: 0.45, decay: decay * 0.7 },
    { freq: f0 * range(rng, 3.0, 3.05), amp: 0.25, decay: decay * 0.45 },
    { freq: f0 * range(rng, 4.15, 4.25), amp: 0.18, decay: decay * 0.3 },
  ]
}

/** Tiny glass/ice tinkles scattered after a shatter. */
function tinkles(buf: Float32Array, sr: number, rng: Rng, count: number, spread: number, lo: number, hi: number, amp: number): void {
  for (let i = 0; i < count; i++) {
    const at = Math.pow(rng(), 2) * spread
    const f0 = range(rng, lo, hi)
    const fade = 1 - 0.7 * (at / spread)
    addModes(buf, sr, glassModes(rng, f0, range(rng, 0.015, 0.07)).map((m) => ({ ...m, amp: m.amp * amp * fade * range(rng, 0.3, 1) })), at)
  }
}

/** Stick-slip creak: irregular impulses through a resonant body. */
export function creak(buf: Float32Array, sr: number, rng: Rng, start: number, length: number, rate: number, body: number, amp: number): void {
  const exc = new Float32Array(Math.ceil(length * sr))
  let t = 0
  while (t < length) {
    const i = Math.floor(t * sr)
    if (i < exc.length) exc[i] = (rng() * 0.6 + 0.4) * (rng() < 0.5 ? -1 : 1)
    const r = rate * (0.8 + 0.4 * Math.sin((t / length) * Math.PI)) * range(rng, 0.85, 1.15)
    t += 1 / r
  }
  biquad(exc, sr, 'bandpass', (tt) => body * (1 + 0.15 * Math.sin(tt * 9)), 7)
  biquad(exc, sr, 'bandpass', body * 2.1, 5)
  for (let i = 0; i < exc.length; i++) {
    const tt = i / sr
    exc[i] *= Math.sin((Math.PI * tt) / length) * amp
  }
  const i0 = Math.floor(start * sr)
  for (let i = 0; i < exc.length && i0 + i < buf.length; i++) buf[i0 + i] += exc[i] * 4
}

// ---------------------------------------------------------------------------
// Per-material recipes
// ---------------------------------------------------------------------------

const stone: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.15, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.07, amp: 1, freq: range(rng, 1800, 2700), q: 1.2, tau: 0.01 })
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.5, freq: range(rng, 700, 1000), q: 1, tau: 0.014 })
    addGrains(b, sr, rng, { count: 3, start: 0.01, spread: 0.05, grainLength: [0.003, 0.008], freq: [2500, 5000], amp: 0.35 })
    return finish(b, sr, 150)
  },
  break(rng, sr) {
    const b = samples(0.45, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 0.6, freq: range(rng, 1200, 1700), q: 0.8, attack: 0.0025, tau: 0.018 })
    addNoiseBurst(b, sr, rng, { duration: 0.25, amp: 0.6, freq: range(rng, 420, 560), q: 0.8, attack: 0.003, tau: 0.05 })
    addGrains(b, sr, rng, { count: 34, start: 0.004, spread: 0.3, grainLength: [0.003, 0.012], freq: [600, 3800], amp: 0.6, bunch: 1.4 })
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.16, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 1, freq: range(rng, 650, 850), q: 0.8, tau: 0.018 })
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.35, freq: 2600, q: 1.5, tau: 0.004 })
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.25, freq: 320, q: 0.8, tau: 0.012 })
    addGrains(b, sr, rng, { count: 3, start: 0.01, spread: 0.06, grainLength: [0.003, 0.008], freq: [1500, 3500], amp: 0.25 })
    return finish(b, sr, 130)
  },
  step(rng, sr) {
    const b = samples(0.12, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 1, freq: range(rng, 1000, 1500), q: 0.8, tau: 0.012 })
    addGrains(b, sr, rng, { count: 4, spread: 0.04, grainLength: [0.002, 0.006], freq: [1500, 4000], amp: 0.5 })
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.25, freq: 350, q: 0.8, tau: 0.01 })
    return finish(b, sr, 120)
  },
}

const wood: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.16, sr)
    woodKnock(b, sr, rng, { center: range(rng, 600, 760), decay: 0.018, amp: 1, click: 0.4 })
    addGrains(b, sr, rng, { count: 3, start: 0.004, spread: 0.03, grainLength: [0.002, 0.005], freq: [1500, 4000], amp: 0.25 })
    return finish(b, sr, 140)
  },
  break(rng, sr) {
    const b = samples(0.5, sr)
    woodKnock(b, sr, rng, { center: range(rng, 500, 620), decay: 0.02, amp: 1, click: 0.35 })
    // The grain gives way: a tearing crack, then splinters and a loose piece knocking
    addNoiseBurst(b, sr, rng, { start: 0.01, duration: 0.2, amp: 0.45, freq: (t) => 1400 - t * 3000, q: 1.8, attack: 0.004, tau: 0.05 })
    addGrains(b, sr, rng, { count: 20, start: 0.006, spread: 0.3, grainLength: [0.002, 0.008], freq: [1000, 4000], amp: 0.45, bunch: 1.3 })
    woodKnock(b, sr, rng, { start: range(rng, 0.08, 0.15), center: range(rng, 700, 900), decay: 0.014, amp: 0.4 })
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.15, sr)
    woodKnock(b, sr, rng, { center: range(rng, 440, 540), decay: 0.022, amp: 1, click: 0.25 })
    return finish(b, sr, 120)
  },
  step(rng, sr) {
    const b = samples(0.12, sr)
    woodKnock(b, sr, rng, { center: range(rng, 380, 470), decay: 0.015, amp: 0.8, click: 0.15 })
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.3, type: 'lowpass', freq: 900, tau: 0.01 })
    return finish(b, sr, 120)
  },
}

const soil: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.14, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 1, freq: range(rng, 700, 950), q: 0.7, tau: 0.018 })
    addGrains(b, sr, rng, { count: 5, spread: 0.06, grainLength: [0.003, 0.01], freq: [400, 1600], amp: 0.6 })
    return finish(b, sr, 140)
  },
  break(rng, sr) {
    const b = samples(0.4, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.28, amp: 0.6, freq: 620, q: 0.7, attack: 0.004, tau: 0.06, color: 'pink' })
    addGrains(b, sr, rng, { count: 28, spread: 0.26, grainLength: [0.005, 0.016], freq: [350, 2200], amp: 0.7, bunch: 1.4 })
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.15, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.1, amp: 1, freq: range(rng, 500, 650), q: 0.7, tau: 0.025 })
    addGrains(b, sr, rng, { count: 6, spread: 0.08, grainLength: [0.004, 0.012], freq: [350, 1400], amp: 0.5 })
    return finish(b, sr, 120)
  },
  step(rng, sr) {
    const b = samples(0.12, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 1, type: 'lowpass', freq: range(rng, 900, 1200), tau: 0.016 })
    addGrains(b, sr, rng, { count: 6, spread: 0.06, grainLength: [0.004, 0.012], freq: [400, 1800], amp: 0.6 })
    return finish(b, sr, 120)
  },
}

/** Soil plus a dry rustle on top. */
function withRustle(base: Recipe, count: number, amp: number, spread: number, hp: number, poles: number): Recipe {
  return (rng, sr) => {
    const b = base(rng, sr)
    const out = new Float32Array(Math.max(b.length, Math.ceil((spread + 0.03) * sr)))
    out.set(b)
    addGrains(out, sr, rng, { count, spread, grainLength: [0.004, 0.012], freq: [2500, 6500], q: 0.8, amp, bunch: 1.2 })
    return finish(out, sr, hp, poles)
  }
}

const grass: Record<BlockSoundAction, Recipe> = {
  hit: withRustle(soil.hit, 8, 0.45, 0.07, 140, 1),
  break: withRustle(soil.break, 22, 0.5, 0.25, 170, 2),
  place: withRustle(soil.place, 8, 0.4, 0.08, 120, 1),
  step: withRustle(soil.step, 9, 0.5, 0.07, 120, 1),
}

function granular(opts: {
  length: number
  count: number
  spread: number
  grain: [number, number]
  freq: [number, number]
  q: number
  hiss: number
  hissFreq: number
  body: number
  breaking?: boolean
}): Recipe {
  return (rng, sr) => {
    const b = samples(opts.length, sr)
    addGrains(b, sr, rng, { count: opts.count, spread: opts.spread, grainLength: opts.grain, freq: opts.freq, q: opts.q, amp: 0.8, bunch: 1.4 })
    if (opts.hiss > 0) {
      addNoiseBurst(b, sr, rng, { duration: opts.spread + 0.04, amp: opts.hiss, freq: opts.hissFreq, q: 0.7, attack: 0.004, tau: opts.spread / 3 })
    }
    if (opts.body > 0) {
      addNoiseBurst(b, sr, rng, { duration: 0.08, amp: opts.body, freq: 600, q: 0.8, attack: 0.002, tau: 0.02 })
    }
    return opts.breaking ? finishBreak(b, sr) : finish(b, sr, 130)
  }
}

const sand: Record<BlockSoundAction, Recipe> = {
  hit: granular({ length: 0.14, count: 18, spread: 0.08, grain: [0.002, 0.006], freq: [2000, 6000], q: 0.8, hiss: 0.35, hissFreq: 3500, body: 0.3 }),
  break: granular({ length: 0.4, count: 50, spread: 0.3, grain: [0.002, 0.007], freq: [1500, 6000], q: 0.8, hiss: 0.4, hissFreq: 3000, body: 0.35, breaking: true }),
  place: granular({ length: 0.18, count: 22, spread: 0.1, grain: [0.002, 0.006], freq: [1500, 5000], q: 0.8, hiss: 0.3, hissFreq: 3000, body: 0.5 }),
  step: granular({ length: 0.14, count: 16, spread: 0.08, grain: [0.002, 0.006], freq: [2000, 6000], q: 0.8, hiss: 0.3, hissFreq: 3500, body: 0.2 }),
}

const gravel: Record<BlockSoundAction, Recipe> = {
  hit: granular({ length: 0.15, count: 10, spread: 0.07, grain: [0.004, 0.012], freq: [800, 3500], q: 2, hiss: 0, hissFreq: 0, body: 0.45 }),
  break: granular({ length: 0.42, count: 34, spread: 0.3, grain: [0.004, 0.014], freq: [800, 3500], q: 2, hiss: 0, hissFreq: 0, body: 0.45, breaking: true }),
  place: granular({ length: 0.18, count: 12, spread: 0.09, grain: [0.004, 0.012], freq: [700, 3000], q: 2, hiss: 0, hissFreq: 0, body: 0.6 }),
  step: granular({ length: 0.14, count: 10, spread: 0.07, grain: [0.004, 0.012], freq: [900, 3500], q: 2, hiss: 0, hissFreq: 0, body: 0.4 }),
}

const snow: Record<BlockSoundAction, Recipe> = {
  hit: granular({ length: 0.13, count: 14, spread: 0.07, grain: [0.003, 0.008], freq: [1200, 3000], q: 1, hiss: 0, hissFreq: 0, body: 0.45 }),
  break: granular({ length: 0.35, count: 36, spread: 0.24, grain: [0.003, 0.008], freq: [1000, 3000], q: 1, hiss: 0.2, hissFreq: 2000, body: 0.4, breaking: true }),
  place: granular({ length: 0.16, count: 16, spread: 0.09, grain: [0.003, 0.008], freq: [1000, 2600], q: 1, hiss: 0, hissFreq: 0, body: 0.5 }),
  step: granular({ length: 0.15, count: 20, spread: 0.1, grain: [0.003, 0.008], freq: [1200, 3000], q: 1.2, hiss: 0, hissFreq: 0, body: 0.35 }),
}

function rustle(length: number, count: number, spread: number, snapAmp: number, breaking = false): Recipe {
  return (rng, sr) => {
    const b = samples(length, sr)
    addGrains(b, sr, rng, { count, spread, grainLength: [0.006, 0.02], freq: [2800, 8000], q: 0.7, amp: 0.8, bunch: 1.1 })
    addNoiseBurst(b, sr, rng, { duration: spread, amp: 0.25, type: 'highpass', freq: 3000, attack: spread * 0.2, tau: spread / 3 })
    if (snapAmp > 0) {
      // A twig snapping
      addNoiseBurst(b, sr, rng, { duration: 0.01, amp: snapAmp, freq: 2000, q: 1.5, tau: 0.003 })
      woodKnock(b, sr, rng, { center: range(rng, 1100, 1500), decay: 0.006, amp: snapAmp * 0.6 })
    }
    return breaking ? finishBreak(b, sr) : finish(b, sr, 200)
  }
}

const leaves: Record<BlockSoundAction, Recipe> = {
  hit: rustle(0.14, 8, 0.08, 0),
  break: rustle(0.4, 26, 0.3, 0.5, true),
  place: rustle(0.16, 10, 0.1, 0.2),
  step: rustle(0.15, 9, 0.1, 0),
}

const glass: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.2, sr)
    addModes(b, sr, glassModes(rng, range(rng, 2400, 3400), 0.05))
    addNoiseBurst(b, sr, rng, { duration: 0.01, amp: 0.45, type: 'highpass', freq: 3000, tau: 0.002 })
    return finish(b, sr, 300)
  },
  break(rng, sr) {
    const b = samples(0.75, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.12, amp: 0.7, type: 'highpass', freq: 3000, attack: 0.002, tau: 0.03 })
    tinkles(b, sr, rng, 30, 0.5, 2000, 7000, 0.6)
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.18, sr)
    addModes(b, sr, glassModes(rng, range(rng, 1800, 2600), 0.035).map((m) => ({ ...m, amp: m.amp * 0.6 })))
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.7, freq: 800, q: 0.8, tau: 0.015 })
    return finish(b, sr, 150)
  },
  step(rng, sr) {
    const b = samples(0.13, sr)
    addModes(b, sr, glassModes(rng, range(rng, 2000, 3000), 0.025).map((m) => ({ ...m, amp: m.amp * 0.5 })))
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.8, freq: 850, q: 0.8, tau: 0.012 })
    return finish(b, sr, 150)
  },
}

/** Pentatonic pitches (A major pentatonic, 5th-6th octave) so crystal pings never clash. */
const CRYSTAL_PITCHES = [880, 987.8, 1108.7, 1318.5, 1480, 1760, 1975.5, 2217.5]

function crystalPitch(rng: Rng): number {
  return CRYSTAL_PITCHES[Math.floor(rng() * CRYSTAL_PITCHES.length)]
}

const crystal: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.5, sr)
    addModes(b, sr, crystalModes(rng, crystalPitch(rng), 0.14))
    addNoiseBurst(b, sr, rng, { duration: 0.01, amp: 0.5, type: 'highpass', freq: 3500, tau: 0.002 })
    return finish(b, sr, 300)
  },
  break(rng, sr) {
    const b = samples(1.1, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.1, amp: 0.6, type: 'highpass', freq: 3500, attack: 0.002, tau: 0.025 })
    tinkles(b, sr, rng, 20, 0.45, 2500, 7000, 0.45)
    for (let i = 0; i < 3; i++) {
      addModes(b, sr, crystalModes(rng, crystalPitch(rng), 0.3).map((m) => ({ ...m, amp: m.amp * 0.45 })), i * range(rng, 0.05, 0.1))
    }
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.45, sr)
    addModes(b, sr, crystalModes(rng, crystalPitch(rng) * 0.5, 0.12).map((m) => ({ ...m, amp: m.amp * 0.55 })))
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.7, freq: 800, q: 0.8, tau: 0.015 })
    return finish(b, sr, 150)
  },
  step(rng, sr) {
    const b = samples(0.28, sr)
    addModes(b, sr, crystalModes(rng, crystalPitch(rng), 0.05).map((m) => ({ ...m, amp: m.amp * 0.45 })))
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.8, freq: 900, q: 0.8, tau: 0.012 })
    return finish(b, sr, 150)
  },
}

const metal: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.4, sr)
    addModes(b, sr, metalModes(rng, range(rng, 420, 650), 0.12))
    addNoiseBurst(b, sr, rng, { duration: 0.01, amp: 0.6, type: 'highpass', freq: 3000, tau: 0.003 })
    return finish(b, sr, 200)
  },
  break(rng, sr) {
    const b = samples(0.8, sr)
    addModes(b, sr, metalModes(rng, range(rng, 380, 520), 0.15))
    for (let i = 0; i < 4; i++) {
      addModes(b, sr, metalModes(rng, range(rng, 600, 1400), 0.05).map((m) => ({ ...m, amp: m.amp * 0.4 })), range(rng, 0.06, 0.35))
    }
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.6, type: 'highpass', freq: 2500, tau: 0.005 })
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.3, sr)
    addModes(b, sr, metalModes(rng, range(rng, 320, 440), 0.07))
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.8, freq: 700, q: 0.8, tau: 0.015 })
    return finish(b, sr, 150)
  },
  step(rng, sr) {
    const b = samples(0.18, sr)
    addModes(b, sr, metalModes(rng, range(rng, 280, 380), 0.035).map((m) => ({ ...m, amp: m.amp * 0.6 })))
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.9, freq: 750, q: 0.8, tau: 0.012 })
    return finish(b, sr, 150)
  },
}

const ice: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.16, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.03, amp: 0.8, freq: 4000, q: 1.2, tau: 0.006 })
    addModes(b, sr, glassModes(rng, range(rng, 1500, 2200), 0.03))
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.3, freq: 700, q: 0.8, tau: 0.01 })
    return finish(b, sr, 200)
  },
  break(rng, sr) {
    const b = samples(0.55, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.15, amp: 0.8, freq: (t) => 3000 - t * 8000, q: 1.5, attack: 0.002, tau: 0.04 })
    tinkles(b, sr, rng, 14, 0.35, 2000, 6000, 0.5)
    addGrains(b, sr, rng, { count: 12, spread: 0.25, grainLength: [0.002, 0.006], freq: [1500, 5000], amp: 0.4 })
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.16, sr)
    addModes(b, sr, glassModes(rng, range(rng, 1200, 1700), 0.03).map((m) => ({ ...m, amp: m.amp * 0.55 })))
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.8, freq: 800, q: 0.8, tau: 0.015 })
    return finish(b, sr, 150)
  },
  step(rng, sr) {
    const b = samples(0.12, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.7, freq: 3200, q: 1.2, tau: 0.005 })
    addModes(b, sr, glassModes(rng, range(rng, 1400, 2000), 0.018).map((m) => ({ ...m, amp: m.amp * 0.45 })))
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.6, freq: 850, q: 0.8, tau: 0.01 })
    return finish(b, sr, 150)
  },
}

/** Dry bone: a short knock (dense, quickly damped modes) with a crack on top. */
function boneKnock(buf: Float32Array, sr: number, rng: Rng, start: number, center: number, amp: number): void {
  addDenseModes(buf, sr, rng, { count: 10, lo: center * 0.6, hi: center * 3, decay: 0.009, amp: amp * 0.5, start, tilt: 0.6 })
  addNoiseBurst(buf, sr, rng, { start, duration: 0.02, amp: amp * 0.6, freq: center * 1.6, q: 1.5, tau: 0.003 })
}

const bone: Record<BlockSoundAction, Recipe> = {
  hit(rng, sr) {
    const b = samples(0.1, sr)
    boneKnock(b, sr, rng, 0, range(rng, 800, 1100), 1)
    return finish(b, sr, 250)
  },
  break(rng, sr) {
    const b = samples(0.38, sr)
    for (let i = 0; i < 6; i++) boneKnock(b, sr, rng, Math.pow(rng(), 1.5) * 0.25, range(rng, 650, 1300), range(rng, 0.4, 1))
    addGrains(b, sr, rng, { count: 12, spread: 0.25, grainLength: [0.003, 0.008], freq: [1500, 4000], amp: 0.4 })
    return finishBreak(b, sr)
  },
  place(rng, sr) {
    const b = samples(0.12, sr)
    boneKnock(b, sr, rng, 0, range(rng, 600, 800), 1)
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.5, freq: 700, q: 0.8, tau: 0.012 })
    return finish(b, sr, 180)
  },
  step(rng, sr) {
    const b = samples(0.1, sr)
    boneKnock(b, sr, rng, 0, range(rng, 700, 950), 0.6)
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.6, type: 'lowpass', freq: 900, tau: 0.01 })
    return finish(b, sr, 180)
  },
}

/** Wet squelch: a resonant filter sweeping up over noise, plus a small bloop. */
function squelch(length: number, sweep: [number, number], sweepTime: number, bloop: number, splat: number, breaking = false): Recipe {
  return (rng, sr) => {
    const b = samples(length, sr)
    const n = Math.ceil(sweepTime * 1.6 * sr)
    const noise = new Float32Array(n)
    for (let i = 0; i < n; i++) noise[i] = rng() * 2 - 1
    const [f0, f1] = sweep
    biquad(noise, sr, 'bandpass', (t) => f0 + (f1 - f0) * Math.min(1, t / sweepTime), 4)
    for (let i = 0; i < n && i < b.length; i++) {
      const t = i / sr
      b[i] += noise[i] * (t < 0.006 ? t / 0.006 : Math.exp(-(t - 0.006) / (sweepTime * 0.5))) * 2
    }
    if (bloop > 0) addSine(b, sr, (t) => 220 + 260 * Math.min(1, t / 0.05), (t) => bloop * Math.exp(-t / 0.03), 0, 0.2)
    if (splat > 0) addGrains(b, sr, rng, { count: 8, spread: length * 0.5, grainLength: [0.006, 0.02], freq: [300, 1200], q: 2, amp: splat })
    return breaking ? finishBreak(b, sr) : finish(b, sr, 140)
  }
}

const soft: Record<BlockSoundAction, Recipe> = {
  hit: squelch(0.14, [280, 800], 0.07, 0.25, 0),
  break: squelch(0.38, [240, 900], 0.16, 0.35, 0.5, true),
  place: squelch(0.16, [220, 600], 0.08, 0.4, 0),
  step: squelch(0.12, [260, 650], 0.06, 0.2, 0),
}

function muffled(length: number, cutoff: number, tau: number, grains: number, breaking = false): Recipe {
  return (rng, sr) => {
    const b = samples(length, sr)
    addNoiseBurst(b, sr, rng, { duration: length * 0.8, amp: 1, type: 'lowpass', freq: cutoff, attack: 0.004, tau, color: 'pink' })
    if (grains > 0) addGrains(b, sr, rng, { count: grains, spread: length * 0.5, grainLength: [0.006, 0.016], freq: [500, 1500], amp: 0.3 })
    return breaking ? finishBreak(b, sr) : finish(b, sr, 160)
  }
}

const cloth: Record<BlockSoundAction, Recipe> = {
  hit: muffled(0.12, 1200, 0.025, 2),
  break: muffled(0.3, 1400, 0.06, 8, true),
  place: muffled(0.14, 1100, 0.03, 3),
  step: muffled(0.12, 1200, 0.025, 2),
}

export const BLOCK_SOUND_RECIPES: Record<BlockSoundMaterial, Record<BlockSoundAction, Recipe>> = {
  stone,
  wood,
  soil,
  grass,
  sand,
  gravel,
  snow,
  leaves,
  glass,
  crystal,
  metal,
  ice,
  bone,
  soft,
  cloth,
}
