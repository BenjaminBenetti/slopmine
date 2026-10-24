/**
 * Non-block sound effects: player, items, UI, stations, liquids, combat,
 * magic and boss moments. Pure recipes - see dsp.ts.
 */

import { creak, woodKnock } from './blockSounds.ts'
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
  whiteNoise,
  brownNoise,
  pinkNoise,
  type Mode,
  type Param,
  type Rng,
} from './dsp.ts'

type Recipe = (rng: Rng, sr: number) => Float32Array

/** Normalize and trim; `hp` (Hz) first cuts rumble below it. */
function finish(buf: Float32Array, sr: number, hp = 0): Float32Array {
  if (hp > 0) biquad(buf, sr, 'highpass', hp, 0.707)
  return trimTail(normalize(buf, 0.9), sr)
}

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

/** Soft bell partials (chimes, toasts). */
function bellModes(f0: number, decay: number, amp = 1): Mode[] {
  return [
    { freq: f0, amp: amp, decay },
    { freq: f0 * 2.0, amp: amp * 0.35, decay: decay * 0.6 },
    { freq: f0 * 3.0, amp: amp * 0.18, decay: decay * 0.4 },
    { freq: f0 * 4.2, amp: amp * 0.12, decay: decay * 0.25 },
    { freq: f0 * 5.4, amp: amp * 0.06, decay: decay * 0.15 },
  ]
}

/** Filtered-noise whoosh following a band sweep. */
function whoosh(buf: Float32Array, sr: number, rng: Rng, start: number, length: number, from: number, to: number, q: number, amp: number, color: 'white' | 'pink' = 'white'): void {
  const n = Math.ceil(length * sr)
  const noise = color === 'pink' ? pinkNoise(n, rng) : whiteNoise(n, rng)
  biquad(noise, sr, 'bandpass', (t) => from * Math.pow(to / from, t / length), q)
  const env = swellEnv(length * 0.35, length, length * 0.6)
  const i0 = Math.floor(start * sr)
  for (let i = 0; i < n && i0 + i < buf.length; i++) buf[i0 + i] += noise[i] * env(i / sr) * amp
}

/** Harmonic glottal-ish source through vowel formants: grunts, moans, creature voices. */
export function voice(
  buf: Float32Array,
  sr: number,
  rng: Rng,
  opts: {
    start?: number
    length: number
    f0: (t: number) => number
    /** [frequency (Hz, or a function of time), Q, gain] per formant. */
    formants: readonly (readonly [Param, number, number])[]
    amp: number
    attack?: number
    release?: number
    breath?: number
    rough?: number
    roughRate?: number
    vibrato?: number
    vibratoRate?: number
    /** Irregular pitch drift (strain), as a fraction of f0. */
    wobble?: number
  },
): void {
  const n = Math.ceil(opts.length * sr)
  const src = new Float32Array(n)
  let phase = 0
  const vib = opts.vibrato ?? 0
  const vibRate = opts.vibratoRate ?? 5.5
  const rough = opts.rough ?? 0
  const roughRate = opts.roughRate ?? 32
  const wobble = opts.wobble ?? 0
  let drift = 0
  let driftTarget = 0
  const driftK = 1 - Math.exp((-2 * Math.PI * 14) / sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    if (wobble > 0 && i % Math.max(1, Math.floor(sr / 40)) === 0) driftTarget = (rng() * 2 - 1) * wobble
    drift += driftK * (driftTarget - drift)
    const f = opts.f0(t) * (1 + vib * Math.sin(2 * Math.PI * vibRate * t)) * (1 + drift) * (1 + 0.004 * (rng() - 0.5))
    phase += f / sr
    phase -= Math.floor(phase)
    // Band-limited-enough saw (harmonics fall 1/n), softened by the formant filters.
    let s = 0
    const maxH = Math.min(24, Math.floor(sr / 2 / Math.max(40, f)))
    for (let h = 1; h <= maxH; h++) s += Math.sin(2 * Math.PI * h * phase) / h
    const am = rough > 0 ? 1 - rough * (0.5 + 0.5 * Math.sin(2 * Math.PI * roughRate * t + rng() * 0.6)) : 1
    src[i] = s * am + (opts.breath ?? 0.05) * (rng() * 2 - 1)
  }
  const out = new Float32Array(n)
  for (const [freq, q, gain] of opts.formants) {
    const band = src.slice()
    biquad(band, sr, 'bandpass', freq, q)
    for (let i = 0; i < n; i++) out[i] += band[i] * gain
  }
  const env = swellEnv(opts.attack ?? 0.02, opts.length, opts.release ?? opts.length * 0.5)
  const i0 = Math.floor((opts.start ?? 0) * sr)
  for (let i = 0; i < n && i0 + i < buf.length; i++) buf[i0 + i] += out[i] * env(i / sr) * opts.amp
}

const NASAL_HM: [number, number, number][] = [
  [300, 4, 1],
  [1100, 6, 0.25],
  [2400, 8, 0.1],
]

/**
 * A pained cry: the voice jumps up then falls (`rise` × f0 at 12 % of the
 * length, then down to `fall` × f0), strained (rough, irregular pitch) and
 * closing from an open vowel toward "uh/oh", with an aspirated onset and a
 * breath going out after. The difference between "oof" and "ow, that hurt".
 */
function painCry(
  buf: Float32Array,
  sr: number,
  rng: Rng,
  opts: { start?: number; length: number; f0: number; rise: number; fall: number; amp: number; rough: number; vowelEnd: [number, number] },
): void {
  const { length, f0, rise, fall } = opts
  const start = opts.start ?? 0
  addNoiseBurst(buf, sr, rng, { start, duration: 0.05, amp: opts.amp * 0.22, freq: 1800, q: 0.8, attack: 0.003, tau: 0.018 })
  const [f1End, f2End] = opts.vowelEnd
  voice(buf, sr, rng, {
    start: start + 0.012,
    length,
    f0: (t) => {
      const u = t / length
      return u < 0.12 ? f0 * (1 + (rise - 1) * (u / 0.12)) : f0 * rise * Math.pow(fall / rise, (u - 0.12) / 0.88)
    },
    formants: [
      [(t) => 740 + (f1End - 740) * Math.min(1, t / length), 5, 1],
      [(t) => 1250 + (f2End - 1250) * Math.min(1, t / length), 7, 0.55],
      [2600, 9, 0.22],
    ],
    amp: opts.amp,
    attack: 0.012,
    release: length * 0.45,
    rough: opts.rough,
    roughRate: 55,
    breath: 0.12,
    wobble: 0.025,
  })
  addNoiseBurst(buf, sr, rng, { start: start + length * 0.75, duration: 0.16, amp: opts.amp * 0.1, freq: 1200, q: 0.9, attack: 0.02, tau: 0.045 })
}

function thud(buf: Float32Array, sr: number, rng: Rng, from: number, to: number, tau: number, amp: number, start = 0): void {
  addSine(buf, sr, (t) => to + (from - to) * Math.exp(-t / (tau * 0.5)), (t) => amp * Math.exp(-t / tau), start, tau * 8)
  addNoiseBurst(buf, sr, rng, { start, duration: tau * 3, amp: amp * 0.6, type: 'lowpass', freq: 500, tau: tau * 0.6 })
}

/** Rising bubble chirps (water). */
function bubbles(buf: Float32Array, sr: number, rng: Rng, count: number, start: number, spread: number, lo: number, hi: number, amp: number): void {
  for (let i = 0; i < count; i++) {
    const at = start + Math.pow(rng(), 1.3) * spread
    const f = range(rng, lo, hi)
    const len = range(rng, 0.02, 0.05)
    addSine(buf, sr, (t) => f * (1 + 1.2 * (t / len)), (t) => amp * range(rng, 0.4, 1) * Math.exp(-t / (len * 0.4)), at, len * 2)
  }
}

/** Crackling embers. */
function crackle(buf: Float32Array, sr: number, rng: Rng, count: number, start: number, spread: number, amp: number): void {
  addGrains(buf, sr, rng, { count, start, spread, grainLength: [0.001, 0.004], freq: [1500, 6000], q: 1.5, amp, bunch: 1 })
}

function boom(buf: Float32Array, sr: number, rng: Rng, size: number, amp: number, start = 0): void {
  const n = Math.ceil(size * 2.2 * sr)
  const rumble = brownNoise(n, rng)
  biquad(rumble, sr, 'lowpass', (t) => 200 + 1200 * Math.exp(-t / (size * 0.15)), 0.8)
  const i0 = Math.floor(start * sr)
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    const t = i / sr
    buf[i0 + i] += rumble[i] * amp * (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / (size * 0.45)))
  }
  addSine(buf, sr, (t) => 32 + 30 * Math.exp(-t / 0.15), (t) => amp * 0.9 * Math.exp(-t / (size * 0.3)), start, size * 2)
  addNoiseBurst(buf, sr, rng, { start, duration: 0.05, amp: amp * 0.6, freq: 1200, q: 0.6, tau: 0.015 })
  crackle(buf, sr, rng, Math.round(30 * size), start + 0.03, size * 0.9, amp * 0.25)
}

/** A short chord of bells, staggered (chimes, fanfares). */
function chime(buf: Float32Array, sr: number, notes: readonly number[], stagger: number, decay: number, amp: number, start = 0): void {
  notes.forEach((m, i) => addModes(buf, sr, bellModes(midiHz(m), decay, amp * (1 - i * 0.08)), start + i * stagger, 0.004))
}

/** Sustained shimmering partial cluster with a swell (magic). */
function shimmer(buf: Float32Array, sr: number, rng: Rng, start: number, length: number, notes: readonly number[], amp: number, glide = 0): void {
  for (const m of notes) {
    const f = midiHz(m)
    const det = range(rng, -0.003, 0.003)
    const env = swellEnv(length * 0.4, length, length * 0.5)
    addSine(buf, sr, (t) => f * (1 + det) * Math.pow(2, (glide * t) / length / 12), (t) => amp * env(t) * (0.8 + 0.2 * Math.sin(t * 13 + m)), start, length)
  }
}

// ---------------------------------------------------------------------------

export const SFX_RECIPES: Record<string, Recipe> = {
  // --- player ------------------------------------------------------------
  'player.hurt'(rng, sr) {
    const b = samples(0.48, sr)
    painCry(b, sr, rng, { length: range(rng, 0.24, 0.3), f0: range(rng, 150, 178), rise: range(rng, 1.22, 1.35), fall: 0.8, amp: 1, rough: 0.3, vowelEnd: [480, 920] })
    // The blow itself, under the voice
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.3, freq: 350, q: 0.7, tau: 0.015 })
    return finish(b, sr, 90)
  },
  'player.hurt.soft'(rng, sr) {
    // Environmental ticks (poison, burning): a short closed-mouth grunt.
    const b = samples(0.22, sr)
    const f = range(rng, 135, 155)
    voice(b, sr, rng, { start: 0.005, length: 0.13, f0: (t) => f * (1.1 - t), formants: NASAL_HM, amp: 1, attack: 0.01, release: 0.07, rough: 0.25, breath: 0.1, wobble: 0.02 })
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.25, freq: 380, q: 0.7, tau: 0.012 })
    return finish(b, sr, 90)
  },
  'player.sizzle'(rng, sr) {
    const b = samples(0.45, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.4, amp: 0.5, type: 'highpass', freq: 3500, attack: 0.01, tau: 0.12 })
    crackle(b, sr, rng, 20, 0, 0.35, 0.8)
    return finish(b, sr)
  },
  'player.death'(rng, sr) {
    const b = samples(1.1, sr)
    painCry(b, sr, rng, { length: 0.7, f0: 165, rise: 1.3, fall: 0.6, amp: 1, rough: 0.35, vowelEnd: [560, 850] })
    addNoiseBurst(b, sr, rng, { start: 0.55, duration: 0.12, amp: 0.3, freq: 300, q: 0.7, tau: 0.03 })
    return finish(b, sr, 90)
  },
  'player.land'(rng, sr) {
    const b = samples(0.3, sr)
    thud(b, sr, rng, 90, 45, 0.07, 1)
    return finish(b, sr)
  },
  'player.swing'(rng, sr) {
    const b = samples(0.24, sr)
    whoosh(b, sr, rng, 0, 0.2, range(rng, 450, 600), range(rng, 1600, 2200), 1.4, 1)
    return finish(b, sr)
  },
  // --- melee impacts, by what was hit ----------------------------------------
  'hit.flesh'(rng, sr) {
    const b = samples(0.18, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.03, amp: 0.65, freq: range(rng, 1400, 1900), q: 0.9, attack: 0.0008, tau: 0.006 })
    addNoiseBurst(b, sr, rng, { duration: 0.09, amp: 1, freq: range(rng, 260, 340), q: 0.9, attack: 0.001, tau: 0.02 })
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.5, freq: range(rng, 700, 900), q: 1.2, tau: 0.012 })
    return finish(b, sr, 110)
  },
  'hit.bone'(rng, sr) {
    const b = samples(0.16, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.8, freq: range(rng, 2200, 2800), q: 1.5, attack: 0.0005, tau: 0.004 })
    addDenseModes(b, sr, rng, { count: 12, lo: 700, hi: 2600, decay: 0.009, amp: 0.5, tilt: 0.6 })
    addGrains(b, sr, rng, { count: 4, start: 0.012, spread: 0.05, grainLength: [0.002, 0.005], freq: [1500, 4000], q: 1.5, amp: 0.4 })
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.3, freq: 600, q: 1, tau: 0.008 })
    return finish(b, sr, 200)
  },
  'hit.armor'(rng, sr) {
    const b = samples(0.3, sr)
    // A dented plate, not a bell: many short modes blurred by the scrape of the blade
    addDenseModes(b, sr, rng, { count: 26, lo: 900, hi: 5500, decay: 0.03, amp: 0.3, tilt: 0.8 })
    addNoiseBurst(b, sr, rng, { duration: 0.03, amp: 0.75, type: 'highpass', freq: 2500, attack: 0.0005, tau: 0.007 })
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.5, freq: 1500, q: 0.8, tau: 0.01 })
    addNoiseBurst(b, sr, rng, { duration: 0.07, amp: 0.5, freq: 450, q: 0.8, tau: 0.015 })
    return finish(b, sr, 150)
  },
  'hit.shield'(rng, sr) {
    const b = samples(0.3, sr)
    addDenseModes(b, sr, rng, { count: 24, lo: 380, hi: 3000, decay: 0.028, amp: 0.28, tilt: 0.8 })
    addNoiseBurst(b, sr, rng, { duration: 0.1, amp: 0.9, type: 'lowpass', freq: 900, attack: 0.001, tau: 0.028 })
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.5, freq: 1500, q: 1, tau: 0.006 })
    return finish(b, sr, 120)
  },
  'hit.crystal'(rng, sr) {
    const b = samples(0.25, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.03, amp: 0.8, type: 'highpass', freq: 3000, attack: 0.0005, tau: 0.008 })
    addDenseModes(b, sr, rng, { count: 14, lo: 1800, hi: 7000, decay: 0.03, amp: 0.35, tilt: 0.5 })
    addGrains(b, sr, rng, { count: 6, start: 0.01, spread: 0.06, grainLength: [0.001, 0.004], freq: [4000, 9000], amp: 0.3 })
    return finish(b, sr, 400)
  },
  'hit.ghost'(rng, sr) {
    const b = samples(0.24, sr)
    whoosh(b, sr, rng, 0, 0.18, 2400, 500, 1.4, 0.8)
    addNoiseBurst(b, sr, rng, { duration: 0.15, amp: 0.3, freq: 320, q: 1, attack: 0.02, tau: 0.04 })
    return finish(b, sr, 150)
  },
  'hit.soft'(rng, sr) {
    const b = samples(0.18, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.12, amp: 1, freq: (t) => 300 + t * 6000, q: 3, attack: 0.002, tau: 0.03 })
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.5, freq: 400, q: 0.8, tau: 0.015 })
    addGrains(b, sr, rng, { count: 5, start: 0.02, spread: 0.08, grainLength: [0.005, 0.014], freq: [400, 1400], q: 2, amp: 0.4 })
    return finish(b, sr, 130)
  },
  'hit.shell'(rng, sr) {
    const b = samples(0.12, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.8, freq: 3000, q: 1.2, attack: 0.0005, tau: 0.004 })
    addDenseModes(b, sr, rng, { count: 10, lo: 1500, hi: 4500, decay: 0.006, amp: 0.4, tilt: 0.5 })
    addGrains(b, sr, rng, { count: 8, spread: 0.025, grainLength: [0.001, 0.004], freq: [1500, 5000], amp: 0.5 })
    return finish(b, sr, 300)
  },
  'hit.wood'(rng, sr) {
    const b = samples(0.16, sr)
    woodKnock(b, sr, rng, { center: range(rng, 500, 620), decay: 0.02, amp: 1, click: 0.4 })
    return finish(b, sr, 130)
  },
  'hit.ice'(rng, sr) {
    const b = samples(0.18, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.03, amp: 0.8, freq: 3500, q: 1.2, attack: 0.0005, tau: 0.006 })
    addDenseModes(b, sr, rng, { count: 12, lo: 1500, hi: 5000, decay: 0.015, amp: 0.3, tilt: 0.5 })
    addGrains(b, sr, rng, { count: 6, start: 0.005, spread: 0.05, grainLength: [0.001, 0.004], freq: [2000, 6000], amp: 0.4 })
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.3, freq: 700, q: 0.8, tau: 0.012 })
    return finish(b, sr, 200)
  },
  'hit.stone'(rng, sr) {
    const b = samples(0.18, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.04, amp: 0.9, freq: range(rng, 1300, 1700), q: 0.8, attack: 0.0006, tau: 0.01 })
    addGrains(b, sr, rng, { count: 6, start: 0.004, spread: 0.05, grainLength: [0.002, 0.006], freq: [1000, 4000], amp: 0.45 })
    addNoiseBurst(b, sr, rng, { duration: 0.07, amp: 0.5, freq: 450, q: 0.8, tau: 0.015 })
    return finish(b, sr, 140)
  },
  'player.splash'(rng, sr) {
    const b = samples(0.9, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.5, amp: 0.9, freq: (t) => 1800 * Math.exp(-t * 4) + 400, q: 0.9, attack: 0.008, tau: 0.12 })
    addNoiseBurst(b, sr, rng, { duration: 0.15, amp: 0.4, type: 'lowpass', freq: 400, tau: 0.04 })
    bubbles(b, sr, rng, 14, 0.06, 0.55, 350, 1100, 0.25)
    return finish(b, sr)
  },
  'player.splash.small'(rng, sr) {
    const b = samples(0.45, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.25, amp: 0.8, freq: (t) => 1500 * Math.exp(-t * 5) + 500, q: 1, attack: 0.006, tau: 0.06 })
    bubbles(b, sr, rng, 5, 0.03, 0.25, 400, 1100, 0.25)
    return finish(b, sr)
  },
  'player.swim'(rng, sr) {
    const b = samples(0.5, sr)
    whoosh(b, sr, rng, 0, 0.4, 500, 1200, 0.9, 0.8, 'pink')
    bubbles(b, sr, rng, 4, 0.1, 0.3, 400, 900, 0.15)
    return finish(b, sr)
  },
  'player.lava'(rng, sr) {
    const b = samples(0.7, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.6, amp: 0.6, type: 'highpass', freq: 2500, attack: 0.01, tau: 0.18 })
    crackle(b, sr, rng, 28, 0, 0.5, 0.7)
    addSine(b, sr, (t) => 120 + 90 * Math.min(1, t / 0.08), (t) => 0.5 * Math.exp(-t / 0.08), 0, 0.3)
    return finish(b, sr)
  },
  'player.respawn'(_rng, sr) {
    const b = samples(2.2, sr)
    chime(b, sr, [64, 71], 0.18, 1.1, 0.7)
    return finish(b, sr)
  },

  // --- items -------------------------------------------------------------
  'item.pickup'(rng, sr) {
    // A soft "pop": a low bubble-like blip rising a little (not an octave
    // sweep - that's a "boop"), dying fast, over a muffled puff of air. The
    // highs are rolled off so nothing hisses or grates.
    const b = samples(0.1, sr)
    const f = range(rng, 380, 450)
    const blip = (t: number): number => (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / 0.02))
    addSine(b, sr, (t) => f * (1 + 0.5 * Math.min(1, t / 0.018)), (t) => blip(t), 0, 0.1)
    addSine(b, sr, (t) => 2 * f * (1 + 0.5 * Math.min(1, t / 0.018)), (t) => 0.12 * blip(t) * Math.exp(-t / 0.006), 0, 0.03)
    addNoiseBurst(b, sr, rng, { duration: 0.025, amp: 0.3, type: 'lowpass', freq: 1400, attack: 0.0008, tau: 0.005 })
    biquad(b, sr, 'lowpass', 2800, 0.707)
    return finish(b, sr, 150)
  },
  'item.eat'(rng, sr) {
    const b = samples(0.16, sr)
    addGrains(b, sr, rng, { count: 9, spread: 0.07, grainLength: [0.003, 0.01], freq: [900, 3200], q: 1.2, amp: 0.8 })
    addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 0.6, freq: 1100, q: 2.5, tau: 0.02 })
    addNoiseBurst(b, sr, rng, { duration: 0.06, amp: 0.5, type: 'lowpass', freq: 600, tau: 0.015 })
    return finish(b, sr)
  },
  'item.drink'(rng, sr) {
    const b = samples(0.2, sr)
    const f = range(rng, 200, 250)
    addSine(b, sr, (t) => f - t * 500, (t) => (t < 0.006 ? t / 0.006 : Math.exp(-(t - 0.006) / 0.045)), 0, 0.2)
    addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 0.4, type: 'lowpass', freq: 450, tau: 0.03 })
    bubbles(b, sr, rng, 2, 0.04, 0.08, 500, 900, 0.3)
    return finish(b, sr)
  },
  'item.heart'(rng, sr) {
    const b = samples(2.4, sr)
    thud(b, sr, rng, 70, 45, 0.07, 0.8, 0)
    thud(b, sr, rng, 70, 45, 0.07, 0.6, 0.22)
    shimmer(b, sr, rng, 0.15, 2.0, [52, 59, 64, 68], 0.18)
    return finish(b, sr)
  },
  'item.equip'(rng, sr) {
    const b = samples(0.3, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.12, amp: 0.6, type: 'lowpass', freq: 1200, attack: 0.01, tau: 0.03, color: 'pink' })
    addModes(b, sr, [
      { freq: range(rng, 900, 1100), amp: 0.4, decay: 0.05 },
      { freq: range(rng, 2400, 2700), amp: 0.25, decay: 0.03 },
    ], 0.03)
    addModes(b, sr, [{ freq: range(rng, 700, 850), amp: 0.3, decay: 0.04 }], 0.09)
    return finish(b, sr)
  },
  'item.bonemeal'(rng, sr) {
    const b = samples(0.6, sr)
    addGrains(b, sr, rng, { count: 16, spread: 0.3, grainLength: [0.003, 0.01], freq: [2500, 7000], q: 0.8, amp: 0.5 })
    shimmer(b, sr, rng, 0.05, 0.45, [84, 88, 91], 0.12)
    return finish(b, sr)
  },

  // --- UI ----------------------------------------------------------------
  'ui.click'(rng, sr) {
    const b = samples(0.05, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.01, amp: 0.6, freq: 3000, q: 2, tau: 0.002 })
    addModes(b, sr, [{ freq: range(rng, 1700, 1900), amp: 0.5, decay: 0.008 }])
    return finish(b, sr)
  },
  'ui.pick'(rng, sr) {
    const b = samples(0.06, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.012, amp: 0.5, freq: 2600, q: 1.5, tau: 0.003 })
    addModes(b, sr, [{ freq: range(rng, 2200, 2500), amp: 0.5, decay: 0.01 }])
    return finish(b, sr)
  },
  'ui.drop'(rng, sr) {
    const b = samples(0.08, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.03, amp: 0.6, type: 'lowpass', freq: 900, tau: 0.008 })
    addModes(b, sr, [{ freq: range(rng, 1300, 1500), amp: 0.4, decay: 0.012 }])
    return finish(b, sr)
  },
  'ui.open'(rng, sr) {
    const b = samples(0.26, sr)
    whoosh(b, sr, rng, 0, 0.18, 350, 1300, 1, 0.8, 'pink')
    addNoiseBurst(b, sr, rng, { start: 0.12, duration: 0.03, amp: 0.25, type: 'lowpass', freq: 1200, tau: 0.008 })
    return finish(b, sr)
  },
  'ui.close'(rng, sr) {
    const b = samples(0.24, sr)
    whoosh(b, sr, rng, 0, 0.16, 1300, 400, 1, 0.8, 'pink')
    addNoiseBurst(b, sr, rng, { start: 0.1, duration: 0.03, amp: 0.3, type: 'lowpass', freq: 900, tau: 0.008 })
    return finish(b, sr)
  },
  'ui.craft'(rng, sr) {
    const b = samples(0.9, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.5, freq: 2000, q: 1.2, tau: 0.004 })
    addNoiseBurst(b, sr, rng, { start: 0.06, duration: 0.02, amp: 0.4, freq: 1600, q: 1.2, tau: 0.004 })
    chime(b, sr, [91], 0, 0.3, 0.35, 0.09)
    return finish(b, sr)
  },
  'ui.hotbar'(rng, sr) {
    const b = samples(0.035, sr)
    addModes(b, sr, [{ freq: range(rng, 2800, 3000), amp: 0.5, decay: 0.005 }])
    return finish(b, sr)
  },
  'ui.refused'(_rng, sr) {
    const b = samples(0.2, sr)
    addModes(b, sr, [
      { freq: 220, amp: 0.8, decay: 0.05 },
      { freq: 233, amp: 0.6, decay: 0.05 },
      { freq: 660, amp: 0.2, decay: 0.02 },
    ], 0, 0.004)
    return finish(b, sr)
  },
  'ui.milestone'(_rng, sr) {
    const b = samples(2.5, sr)
    chime(b, sr, [76, 83], 0.14, 1.0, 0.7)
    return finish(b, sr)
  },
  'ui.discover'(rng, sr) {
    // A point of interest found: a breath of air, then a low, open chime under a high shimmer
    const b = samples(3.4, sr)
    whoosh(b, sr, rng, 0, 0.9, 300, 1400, 0.6, 0.22, 'pink')
    shimmer(b, sr, rng, 0.3, 1.6, [81, 88, 93], 0.16)
    chime(b, sr, [69, 76, 72], 0.22, 1.5, 0.55, 0.15)
    return finish(b, sr)
  },
  'ui.chapter'(_rng, sr) {
    const b = samples(3.2, sr)
    chime(b, sr, [72, 76, 79, 84], 0.16, 1.3, 0.6)
    return finish(b, sr)
  },

  // --- stations and world interactions ------------------------------------
  'chest.open'(rng, sr) {
    const b = samples(0.6, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.015, amp: 0.6, freq: 1800, q: 2, tau: 0.003 })
    creak(b, sr, rng, 0.02, 0.4, range(rng, 45, 70), range(rng, 550, 750), 0.7)
    return finish(b, sr)
  },
  'chest.close'(rng, sr) {
    const b = samples(0.25, sr)
    woodKnock(b, sr, rng, { center: range(rng, 340, 420), decay: 0.035, amp: 1, click: 0.2 })
    addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 0.35, freq: 260, q: 0.8, tau: 0.02 })
    return finish(b, sr, 110)
  },
  'door.open'(rng, sr) {
    const b = samples(0.5, sr)
    creak(b, sr, rng, 0, 0.32, range(rng, 60, 85), range(rng, 700, 900), 0.6)
    woodKnock(b, sr, rng, { start: 0.3, center: range(rng, 420, 520), decay: 0.02, amp: 0.35 })
    return finish(b, sr, 110)
  },
  'door.close'(rng, sr) {
    const b = samples(0.25, sr)
    woodKnock(b, sr, rng, { center: range(rng, 360, 460), decay: 0.03, amp: 1, click: 0.3 })
    addNoiseBurst(b, sr, rng, { duration: 0.015, amp: 0.3, freq: 2200, q: 1.5, tau: 0.004 })
    return finish(b, sr, 110)
  },
  'forge.open'(rng, sr) {
    const b = samples(0.8, sr)
    whoosh(b, sr, rng, 0, 0.6, 250, 700, 0.7, 0.7, 'pink')
    crackle(b, sr, rng, 22, 0.05, 0.6, 0.45)
    return finish(b, sr)
  },
  'forge.done'(rng, sr) {
    const b = samples(0.7, sr)
    addModes(b, sr, [
      { freq: range(rng, 1250, 1350), amp: 0.6, decay: 0.2 },
      { freq: range(rng, 3300, 3500), amp: 0.3, decay: 0.12 },
      { freq: range(rng, 5600, 5900), amp: 0.12, decay: 0.07 },
    ])
    return finish(b, sr)
  },
  'hellforge.craft'(rng, sr) {
    const b = samples(1.6, sr)
    const f0 = range(rng, 820, 900)
    addModes(b, sr, [
      { freq: f0, amp: 1, decay: 0.5 },
      { freq: f0 * 2.76, amp: 0.6, decay: 0.35 },
      { freq: f0 * 5.4, amp: 0.35, decay: 0.2 },
      { freq: f0 * 8.9, amp: 0.15, decay: 0.12 },
    ])
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.7, type: 'highpass', freq: 2500, tau: 0.004 })
    whoosh(b, sr, rng, 0.05, 0.8, 200, 600, 0.7, 0.5, 'pink')
    crackle(b, sr, rng, 20, 0.08, 0.7, 0.3)
    return finish(b, sr)
  },
  'woodwork.craft'(rng, sr) {
    const b = samples(0.6, sr)
    const n = Math.ceil(0.4 * sr)
    const rasp = whiteNoise(n, rng)
    biquad(rasp, sr, 'bandpass', 2200, 2)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      rasp[i] *= Math.pow(Math.abs(Math.sin(Math.PI * 9 * t)), 3) * Math.sin((Math.PI * t) / 0.4)
    }
    for (let i = 0; i < n; i++) b[i] += rasp[i] * 0.7
    woodKnock(b, sr, rng, { start: 0.45, center: range(rng, 420, 520), decay: 0.025, amp: 0.6, click: 0.2 })
    return finish(b, sr, 110)
  },
  'brew.craft'(rng, sr) {
    const b = samples(1.0, sr)
    bubbles(b, sr, rng, 14, 0, 0.6, 300, 900, 0.5)
    addModes(b, sr, [
      { freq: range(rng, 2600, 2900), amp: 0.4, decay: 0.12 },
      { freq: range(rng, 4300, 4600), amp: 0.2, decay: 0.08 },
    ], 0.62)
    return finish(b, sr)
  },
  'brew.open'(rng, sr) {
    const b = samples(0.5, sr)
    addModes(b, sr, [
      { freq: range(rng, 2300, 2600), amp: 0.4, decay: 0.1 },
      { freq: range(rng, 3700, 4000), amp: 0.2, decay: 0.06 },
    ])
    bubbles(b, sr, rng, 5, 0.05, 0.3, 350, 800, 0.4)
    return finish(b, sr)
  },
  'tree.fall'(rng, sr) {
    const b = samples(1.6, sr)
    // The trunk gives (a long crack), the canopy sweeps down, the logs hit the ground.
    addNoiseBurst(b, sr, rng, { duration: 0.3, amp: 0.7, freq: (t) => 900 - t * 1500, q: 2, tau: 0.08 })
    addGrains(b, sr, rng, { count: 20, spread: 0.35, grainLength: [0.003, 0.01], freq: [900, 3000], amp: 0.5, bunch: 1 })
    whoosh(b, sr, rng, 0.2, 0.7, 2500, 6000, 0.6, 0.35)
    for (let i = 0; i < 4; i++) {
      const at = 0.75 + i * range(rng, 0.07, 0.14)
      woodKnock(b, sr, rng, { start: at, center: range(rng, 280, 360), decay: 0.04, amp: 0.8 - i * 0.14 })
      addNoiseBurst(b, sr, rng, { start: at, duration: 0.1, amp: 0.35 - i * 0.06, freq: 300, q: 0.8, tau: 0.025 })
    }
    return finish(b, sr, 90)
  },
  'explosion'(rng, sr) {
    const b = samples(2.6, sr)
    boom(b, sr, rng, 1, 1)
    return finish(b, sr)
  },
  'tnt.fuse'(rng, sr) {
    const b = samples(1.0, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.9, amp: 0.6, type: 'highpass', freq: 4000, attack: 0.05, tau: 0.5 })
    crackle(b, sr, rng, 30, 0, 0.9, 0.6)
    return finish(b, sr)
  },
  'geyser.burst'(rng, sr) {
    const b = samples(1.8, sr)
    const n = Math.ceil(1.6 * sr)
    const hiss = whiteNoise(n, rng)
    biquad(hiss, sr, 'bandpass', (t) => 1800 + 1200 * Math.sin(t * 7), 0.6)
    const env = swellEnv(0.06, 1.6, 1.1)
    for (let i = 0; i < n; i++) b[i] += hiss[i] * env(i / sr) * 0.7
    addNoiseBurst(b, sr, rng, { duration: 0.6, amp: 0.6, type: 'lowpass', freq: 300, attack: 0.02, tau: 0.2, color: 'brown' })
    return finish(b, sr)
  },
  'geyser.warn'(rng, sr) {
    const b = samples(1.0, sr)
    bubbles(b, sr, rng, 10, 0, 0.8, 120, 320, 0.6)
    addNoiseBurst(b, sr, rng, { duration: 0.9, amp: 0.4, type: 'lowpass', freq: 250, attack: 0.2, tau: 0.4, color: 'brown' })
    return finish(b, sr)
  },
  'spawner.wake'(rng, sr) {
    const b = samples(1.4, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.8, amp: 0.6, freq: (t) => 300 + t * 900, q: 3, attack: 0.1, tau: 0.25 })
    thud(b, sr, rng, 80, 45, 0.12, 0.8, 0.05)
    crackle(b, sr, rng, 16, 0.1, 0.9, 0.3)
    return finish(b, sr)
  },

  // --- projectiles and magic -----------------------------------------------
  'proj.fire'(rng, sr) {
    const b = samples(0.6, sr)
    whoosh(b, sr, rng, 0, 0.5, 300, 900, 0.8, 0.9, 'pink')
    crackle(b, sr, rng, 18, 0, 0.45, 0.4)
    return finish(b, sr)
  },
  'proj.fire.hit'(rng, sr) {
    const b = samples(1.1, sr)
    boom(b, sr, rng, 0.35, 1)
    return finish(b, sr)
  },
  'proj.ice'(rng, sr) {
    const b = samples(0.4, sr)
    whoosh(b, sr, rng, 0, 0.3, 2500, 6000, 1.5, 0.7)
    addGrains(b, sr, rng, { count: 8, spread: 0.2, grainLength: [0.001, 0.004], freq: [3000, 7000], amp: 0.25, bunch: 1 })
    return finish(b, sr, 300)
  },
  'proj.crystal'(rng, sr) {
    const b = samples(0.45, sr)
    whoosh(b, sr, rng, 0, 0.3, 2000, 5000, 1.5, 0.7)
    addDenseModes(b, sr, rng, { count: 10, lo: 2500, hi: 7000, decay: 0.03, amp: 0.15, tilt: 0.4 })
    return finish(b, sr, 300)
  },
  'proj.bone'(rng, sr) {
    const b = samples(0.3, sr)
    whoosh(b, sr, rng, 0, 0.25, 700, 2000, 1.4, 0.8)
    return finish(b, sr)
  },
  'proj.spore'(rng, sr) {
    const b = samples(0.35, sr)
    addSine(b, sr, (t) => 160 + 300 * Math.min(1, t / 0.06), (t) => 0.8 * Math.exp(-t / 0.05), 0, 0.3)
    addNoiseBurst(b, sr, rng, { duration: 0.15, amp: 0.5, freq: (t) => 400 + t * 4000, q: 3, tau: 0.04 })
    return finish(b, sr)
  },
  'proj.magic'(rng, sr) {
    const b = samples(0.6, sr)
    const f = range(rng, 500, 600)
    const env = swellEnv(0.05, 0.5, 0.3)
    addSine(b, sr, (t) => f * (1 + 0.04 * Math.sin(t * 40)) * (1 + t * 0.6), (t) => 0.5 * env(t), 0, 0.5)
    whoosh(b, sr, rng, 0, 0.45, 800, 2400, 1.2, 0.5)
    return finish(b, sr)
  },
  'proj.hit'(rng, sr) {
    const b = samples(0.25, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.8, freq: range(rng, 900, 1400), q: 0.8, tau: 0.012 })
    addGrains(b, sr, rng, { count: 6, spread: 0.08, grainLength: [0.003, 0.008], freq: [1500, 4000], amp: 0.5 })
    return finish(b, sr)
  },
  'proj.shatter'(rng, sr) {
    const b = samples(0.45, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.05, amp: 0.7, type: 'highpass', freq: 3000, attack: 0.0005, tau: 0.012 })
    for (let i = 0; i < 6; i++) {
      addDenseModes(b, sr, rng, { count: 5, lo: 2000, hi: 7000, decay: 0.025, amp: range(rng, 0.1, 0.25), start: Math.pow(rng(), 2) * 0.2, tilt: 0.4 })
    }
    addGrains(b, sr, rng, { count: 14, spread: 0.25, grainLength: [0.001, 0.004], freq: [3000, 8000], amp: 0.35 })
    return finish(b, sr, 400)
  },
  'proj.splat'(rng, sr) {
    const b = samples(0.3, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.2, amp: 0.9, freq: (t) => 900 - t * 2500, q: 3, tau: 0.04 })
    addGrains(b, sr, rng, { count: 8, spread: 0.12, grainLength: [0.005, 0.015], freq: [300, 1200], q: 2, amp: 0.5 })
    return finish(b, sr)
  },
  'magic.buff'(rng, sr) {
    const b = samples(1.4, sr)
    chime(b, sr, [81, 86, 88], 0.08, 0.6, 0.35)
    whoosh(b, sr, rng, 0, 0.8, 3000, 7000, 0.8, 0.15)
    return finish(b, sr)
  },
  'magic.debuff'(rng, sr) {
    const b = samples(1.0, sr)
    const env = swellEnv(0.1, 0.9, 0.6)
    addSine(b, sr, 110, (t) => 0.5 * env(t), 0, 0.9)
    addSine(b, sr, 116.5, (t) => 0.45 * env(t), 0, 0.9)
    addSine(b, sr, 233, (t) => 0.15 * env(t), 0, 0.9)
    addNoiseBurst(b, sr, rng, { duration: 0.8, amp: 0.2, type: 'lowpass', freq: 500, attack: 0.15, tau: 0.3 })
    return finish(b, sr)
  },
  'magic.frost'(rng, sr) {
    const b = samples(1.6, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.2, amp: 0.7, freq: (t) => 4000 - t * 8000, q: 1.2, tau: 0.05 })
    whoosh(b, sr, rng, 0, 0.9, 3500, 900, 0.8, 0.6)
    for (let i = 0; i < 12; i++) {
      addModes(b, sr, bellModes(range(rng, 1800, 4500), range(rng, 0.05, 0.2), range(rng, 0.15, 0.35)), Math.pow(rng(), 1.5) * 0.6)
    }
    thud(b, sr, rng, 90, 50, 0.1, 0.6)
    return finish(b, sr)
  },
  'magic.slam'(rng, sr) {
    const b = samples(1.4, sr)
    thud(b, sr, rng, 85, 38, 0.16, 1)
    addNoiseBurst(b, sr, rng, { duration: 0.5, amp: 0.5, type: 'lowpass', freq: 700, attack: 0.002, tau: 0.12, color: 'brown' })
    addGrains(b, sr, rng, { count: 24, start: 0.02, spread: 0.5, grainLength: [0.004, 0.014], freq: [600, 3000], amp: 0.35 })
    return finish(b, sr)
  },
  'magic.windup'(rng, sr) {
    const b = samples(1.1, sr)
    const n = Math.ceil(1.0 * sr)
    const rise = pinkNoise(n, rng)
    biquad(rise, sr, 'bandpass', (t) => 200 * Math.pow(6, t), 2.5)
    const env = swellEnv(0.8, 1.0, 0.15)
    for (let i = 0; i < n; i++) b[i] += rise[i] * env(i / sr)
    return finish(b, sr)
  },
  'magic.shield'(rng, sr) {
    const b = samples(1.4, sr)
    shimmer(b, sr, rng, 0, 1.2, [62, 69, 74], 0.25, 3)
    addNoiseBurst(b, sr, rng, { duration: 0.6, amp: 0.25, freq: 2500, q: 0.8, attack: 0.2, tau: 0.25 })
    return finish(b, sr)
  },
  'magic.shield.break'(rng, sr) {
    const b = samples(0.9, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.12, amp: 0.7, type: 'highpass', freq: 2500, attack: 0.001, tau: 0.03 })
    for (let i = 0; i < 10; i++) {
      addDenseModes(b, sr, rng, { count: 6, lo: 1500, hi: 6500, decay: 0.05, amp: range(rng, 0.1, 0.25), start: Math.pow(rng(), 2) * 0.45, tilt: 0.4 })
    }
    addGrains(b, sr, rng, { count: 30, spread: 0.6, grainLength: [0.001, 0.005], freq: [2500, 8000], amp: 0.35, bunch: 2 })
    addNoiseBurst(b, sr, rng, { duration: 0.08, amp: 0.3, freq: 500, q: 0.8, tau: 0.02 })
    return finish(b, sr, 200)
  },
  'idol.channel'(rng, sr) {
    const b = samples(3.3, sr)
    shimmer(b, sr, rng, 0, 3.2, [57, 64, 69, 76], 0.22, 5)
    const n = Math.ceil(3.2 * sr)
    const air = whiteNoise(n, rng)
    biquad(air, sr, 'bandpass', (t) => 2000 + t * 1500, 1.2)
    const env = swellEnv(2.4, 3.2, 0.5)
    for (let i = 0; i < n; i++) b[i] += air[i] * env(i / sr) * 0.12
    return finish(b, sr)
  },
  'idol.teleport'(rng, sr) {
    const b = samples(2.6, sr)
    whoosh(b, sr, rng, 0, 0.7, 4000, 300, 0.8, 0.6)
    addSine(b, sr, (t) => 70 - t * 10, (t) => 0.6 * Math.exp(-t / 0.5), 0, 2)
    chime(b, sr, [69, 76], 0.1, 1.3, 0.5, 0.25)
    return finish(b, sr)
  },
  'idol.fail'(_rng, sr) {
    const b = samples(0.8, sr)
    addSine(b, sr, (t) => 520 * Math.pow(0.5, t / 0.6), (t) => 0.6 * Math.exp(-t / 0.25), 0, 0.8)
    addSine(b, sr, (t) => 780 * Math.pow(0.5, t / 0.6), (t) => 0.25 * Math.exp(-t / 0.2), 0, 0.8)
    return finish(b, sr)
  },

  // --- dungeons and guardians ---------------------------------------------
  'dungeon.enter'(rng, sr) {
    const b = samples(4.5, sr)
    const env = swellEnv(1.8, 4.3, 2.2)
    addSine(b, sr, (t) => 55 * (1 + 0.003 * Math.sin(t * 2)), (t) => 0.6 * env(t), 0, 4.3)
    addSine(b, sr, 82.4, (t) => 0.35 * env(t), 0, 4.3)
    addSine(b, sr, 116.5, (t) => 0.12 * env(t), 0.6, 3.7)
    const n = Math.ceil(4.3 * sr)
    const wind = pinkNoise(n, rng)
    biquad(wind, sr, 'bandpass', (t) => 300 + 150 * Math.sin(t * 1.3), 2)
    for (let i = 0; i < n; i++) b[i] += wind[i] * env(i / sr) * 0.25
    return finish(b, sr)
  },
  'boss.engage'(rng, sr) {
    const b = samples(3.6, sr)
    // Taiko-like hit, then a dark swell.
    addSine(b, sr, (t) => 48 + 30 * Math.exp(-t / 0.04), (t) => Math.exp(-t / 0.45), 0, 2.5)
    addNoiseBurst(b, sr, rng, { duration: 0.3, amp: 0.6, type: 'lowpass', freq: 300, tau: 0.08 })
    addNoiseBurst(b, sr, rng, { duration: 0.03, amp: 0.4, freq: 900, q: 1, tau: 0.008 })
    const env = swellEnv(1.2, 3.4, 1.6)
    addSine(b, sr, 73.4, (t) => 0.3 * env(t), 0.2, 3.2)
    addSine(b, sr, 77.8, (t) => 0.22 * env(t), 0.2, 3.2)
    return finish(b, sr)
  },
  'boss.phase'(rng, sr) {
    const b = samples(2.2, sr)
    addSine(b, sr, (t) => 42 + 25 * Math.exp(-t / 0.05), (t) => Math.exp(-t / 0.5), 0, 2)
    addNoiseBurst(b, sr, rng, { duration: 1.6, amp: 0.5, type: 'lowpass', freq: 220, attack: 0.05, tau: 0.5, color: 'brown' })
    return finish(b, sr)
  },
  'boss.defeat'(rng, sr) {
    const b = samples(5.5, sr)
    boom(b, sr, rng, 0.6, 0.6)
    chime(b, sr, [60, 67, 72, 76, 79], 0.12, 2.2, 0.45, 0.35)
    return finish(b, sr)
  },

  // --- night creatures ------------------------------------------------------
  'night.creak'(rng, sr) {
    // The Stillwatcher, caught mid-step: its pole frame settles with a dry creak
    const b = samples(0.5, sr)
    creak(b, sr, rng, 0, 0.32, range(rng, 28, 40), range(rng, 340, 440), 0.9)
    addGrains(b, sr, rng, { count: 30, start: 0.02, spread: 0.25, grainLength: [0.001, 0.003], freq: [2500, 7000], amp: 0.25, bunch: 1.5 })
    return finish(b, sr, 200)
  },
  'night.flutter'(rng, sr) {
    // A moth folding its wings into a dive: papery beats, then rushing air
    const b = samples(0.55, sr)
    for (let i = 0; i < 3; i++) {
      addNoiseBurst(b, sr, rng, { start: i * 0.06, duration: 0.06, amp: 0.7 - i * 0.15, type: 'bandpass', freq: range(rng, 550, 800), q: 0.8, attack: 0.01, tau: 0.018, color: 'pink' })
    }
    whoosh(b, sr, rng, 0.12, 0.38, 700, 1900, 0.9, 0.7, 'pink')
    return finish(b, sr, 180)
  },
  'night.rumble'(rng, sr) {
    // Sand churning under the player's feet: something is coming up
    const b = samples(1.1, sr)
    addNoiseBurst(b, sr, rng, { duration: 1.0, amp: 0.7, type: 'lowpass', freq: (t) => 280 + 320 * t, attack: 0.35, tau: 0.6, color: 'brown' })
    addGrains(b, sr, rng, { count: 90, spread: 1.0, grainLength: [0.001, 0.004], freq: [1200, 5000], amp: 0.45, bunch: 0.6 })
    return finish(b, sr)
  },
  'night.erupt'(rng, sr) {
    // The Sandmaw bursts out: a spray of sand over a heavy thump
    const b = samples(1.2, sr)
    thud(b, sr, rng, 95, 45, 0.1, 0.9)
    addNoiseBurst(b, sr, rng, { duration: 0.7, amp: 0.8, type: 'bandpass', freq: (t) => 2600 - t * 2200, q: 0.6, attack: 0.004, tau: 0.18 })
    addGrains(b, sr, rng, { count: 120, start: 0.03, spread: 0.9, grainLength: [0.001, 0.004], freq: [1000, 6000], amp: 0.4, bunch: 2 })
    return finish(b, sr, 60)
  },
  'night.emberburst'(rng, sr) {
    // The Ashwalker's breath of embers: a roaring gout, crackling out
    const b = samples(0.9, sr)
    whoosh(b, sr, rng, 0, 0.55, 500, 1800, 0.7, 0.9)
    addNoiseBurst(b, sr, rng, { duration: 0.45, amp: 0.45, type: 'lowpass', freq: 600, attack: 0.02, tau: 0.15, color: 'brown' })
    crackle(b, sr, rng, 40, 0.1, 0.7, 0.55)
    return finish(b, sr, 80)
  },
  'night.hoof'(rng, sr) {
    // A hoof scraping the earth: the Hollow Stag is about to charge
    const b = samples(0.35, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.22, amp: 0.8, type: 'bandpass', freq: (t) => 1100 - t * 1800, q: 0.9, attack: 0.005, tau: 0.06 })
    addGrains(b, sr, rng, { count: 26, spread: 0.22, grainLength: [0.002, 0.006], freq: [700, 3000], amp: 0.45, bunch: 1.4 })
    return finish(b, sr, 150)
  },
  'night.slam'(rng, sr) {
    // Antlers into a trunk at full gallop: a deep woody crack
    const b = samples(1.1, sr)
    thud(b, sr, rng, 80, 42, 0.12, 0.8)
    woodKnock(b, sr, rng, { center: range(rng, 230, 290), decay: 0.06, amp: 1 })
    addNoiseBurst(b, sr, rng, { start: 0.01, duration: 0.25, amp: 0.45, freq: (t) => 1200 - t * 2000, q: 1.6, tau: 0.06 })
    addGrains(b, sr, rng, { count: 30, start: 0.05, spread: 0.6, grainLength: [0.003, 0.01], freq: [1500, 5000], amp: 0.3, bunch: 1.5 })
    return finish(b, sr, 70)
  },
  'night.slash'(rng, sr) {
    // A mantis scythe cutting the air, ending in a chitin click
    const b = samples(0.3, sr)
    whoosh(b, sr, rng, 0, 0.16, 1800, 5200, 1.2, 0.9)
    addDenseModes(b, sr, rng, { count: 6, lo: 2500, hi: 6500, decay: 0.006, amp: 0.4, start: 0.13, tilt: 0.5 })
    return finish(b, sr, 300)
  },
  'night.vanish'(rng, sr) {
    // A night creature leaves with the dawn: a soft airy sigh
    const b = samples(1.2, sr)
    whoosh(b, sr, rng, 0, 1.0, 1400, 500, 0.8, 0.7, 'pink')
    return finish(b, sr, 200)
  },
}
