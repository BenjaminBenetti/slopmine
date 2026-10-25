/**
 * Weather sounds: the looping beds AmbienceController crossfades by the live
 * weather (rain, hail, gale, sandstorm, blizzard, embers, shimmer, aurora,
 * rain on the roof) and the one-shots of storms and skies (thunder, the zap
 * of a strike, a falling star, the Sky Bell). Pure recipes - see dsp.ts.
 */

import { loop, slowWalk } from './ambience.ts'
import {
  addDenseModes,
  addGrains,
  addModes,
  addNoiseBurst,
  addSine,
  biquad,
  brownNoise,
  normalize,
  pinkNoise,
  range,
  samples,
  swellEnv,
  trimTail,
  whiteNoise,
  type Mode,
  type Rng,
} from './dsp.ts'

type Recipe = (rng: Rng, sr: number) => Float32Array

/** Normalize and trim; `hp` (Hz) first cuts rumble below it. */
function finish(buf: Float32Array, sr: number, hp = 0): Float32Array {
  if (hp > 0) biquad(buf, sr, 'highpass', hp, 0.707)
  return trimTail(normalize(buf, 0.9), sr)
}

/**
 * Scatter `count` tiny filtered ticks evenly over a buffer (raindrops, sand,
 * hail bounces): unlike addGrains there is no settling fade, so a bed stays
 * level from start to end.
 */
function scatter(
  buf: Float32Array,
  sr: number,
  rng: Rng,
  opts: { count: number; length: [number, number]; freq: [number, number]; amp: [number, number]; q?: number; type?: 'bandpass' | 'lowpass' | 'highpass' },
): void {
  const seconds = buf.length / sr
  for (let i = 0; i < opts.count; i++) {
    const len = range(rng, opts.length[0], opts.length[1])
    addNoiseBurst(buf, sr, rng, {
      start: rng() * (seconds - len),
      duration: len,
      amp: range(rng, opts.amp[0], opts.amp[1]),
      type: opts.type ?? 'bandpass',
      freq: range(rng, opts.freq[0], opts.freq[1]),
      q: opts.q ?? 1.2,
      attack: 0.0004,
      tau: len / 3,
    })
  }
}

/** A band of noise whose centre wanders (wind whistling through things). */
function whistle(n: number, sr: number, rng: Rng, centre: (t: number) => number, q: number): Float32Array {
  const w = whiteNoise(n, rng)
  biquad(w, sr, 'bandpass', centre, q)
  return w
}

export const WEATHER_BEDS: Record<string, Recipe> = {
  'bed.rain'(rng, sr) {
    // Steady rain: a soft high hiss full of tiny droplet ticks
    return loop(sr, (n) => {
      const hiss = pinkNoise(n, rng)
      biquad(hiss, sr, 'highpass', 1100, 0.6)
      biquad(hiss, sr, 'lowpass', 6500, 0.6)
      const swell = slowWalk(rng, n, sr, 0.15)
      for (let i = 0; i < n; i++) hiss[i] *= 0.35 * (0.75 + 0.25 * swell[i])
      scatter(hiss, sr, rng, { count: Math.round((n / sr) * 170), length: [0.0008, 0.003], freq: [1800, 7000], amp: [0.12, 0.55] })
      return hiss
    })
  },
  'bed.rain_heavy'(rng, sr) {
    // A downpour: a full roar of water with gusts, splashes everywhere
    return loop(sr, (n) => {
      const roar = pinkNoise(n, rng)
      biquad(roar, sr, 'highpass', 250, 0.6)
      biquad(roar, sr, 'lowpass', 4200, 0.6)
      const body = brownNoise(n, rng)
      biquad(body, sr, 'lowpass', 420, 0.7)
      const gust = slowWalk(rng, n, sr, 0.1)
      for (let i = 0; i < n; i++) roar[i] = roar[i] * 0.7 * (0.7 + 0.3 * gust[i]) + body[i] * 0.22
      scatter(roar, sr, rng, { count: Math.round((n / sr) * 380), length: [0.001, 0.004], freq: [800, 5000], amp: [0.08, 0.35] })
      return roar
    })
  },
  'bed.drizzle'(rng, sr) {
    // Fine rain: a faint airy hiss and a few drops
    return loop(sr, (n) => {
      const hiss = whiteNoise(n, rng)
      biquad(hiss, sr, 'bandpass', 5200, 0.7)
      const swell = slowWalk(rng, n, sr, 0.12)
      for (let i = 0; i < n; i++) hiss[i] *= 0.3 * (0.7 + 0.3 * swell[i])
      scatter(hiss, sr, rng, { count: Math.round((n / sr) * 45), length: [0.0006, 0.002], freq: [2500, 7500], amp: [0.08, 0.3] })
      return hiss
    })
  },
  'bed.hail'(rng, sr) {
    // Hail: a dry clatter of ice knocking on everything, some bouncing again
    return loop(sr, (n) => {
      const out = pinkNoise(n, rng)
      biquad(out, sr, 'highpass', 1500, 0.6)
      for (let i = 0; i < n; i++) out[i] *= 0.12
      const seconds = n / sr
      const hits = Math.round(seconds * 36)
      for (let h = 0; h < hits; h++) {
        const at = rng() * (seconds - 0.2)
        const amp = range(rng, 0.25, 0.8)
        const centre = range(rng, 1600, 4200)
        addDenseModes(out, sr, rng, { count: 4, lo: centre * 0.8, hi: centre * 1.9, decay: 0.005, amp: amp * 0.5, start: at, tilt: 0.5 })
        addNoiseBurst(out, sr, rng, { start: at, duration: 0.004, amp: amp * 0.4, type: 'highpass', freq: 3000, tau: 0.001 })
        if (rng() < 0.4) {
          const bounce = at + range(rng, 0.04, 0.11)
          addDenseModes(out, sr, rng, { count: 3, lo: centre, hi: centre * 2, decay: 0.004, amp: amp * 0.22, start: bounce, tilt: 0.5 })
        }
      }
      return out
    })
  },
  'bed.gale'(rng, sr) {
    // A gale: hard gusts howling through the trees, whistling resonances
    return loop(sr, (n) => {
      const body = pinkNoise(n, rng)
      biquad(body, sr, 'lowpass', 700, 0.6)
      biquad(body, sr, 'highpass', 80, 0.7)
      const gust = slowWalk(rng, n, sr, 0.22)
      const howl = whistle(n, sr, rng, (t) => 380 + 220 * Math.sin(t * 0.53) + 90 * Math.sin(t * 1.7), 7)
      const high = whistle(n, sr, rng, (t) => 760 + 300 * Math.sin(t * 0.41 + 1), 9)
      for (let i = 0; i < n; i++) {
        const g = Math.pow(gust[i], 1.5)
        body[i] = body[i] * (0.3 + 0.7 * g) + (howl[i] * 0.8 + high[i] * 0.45) * g * g
      }
      return body
    })
  },
  'bed.sandstorm'(rng, sr) {
    // Blowing sand: a dry hiss in gusts, grains peppering everything
    return loop(sr, (n) => {
      const hiss = whiteNoise(n, rng)
      biquad(hiss, sr, 'highpass', 1600, 0.6)
      biquad(hiss, sr, 'lowpass', 7500, 0.6)
      const body = pinkNoise(n, rng)
      biquad(body, sr, 'lowpass', 500, 0.7)
      const gust = slowWalk(rng, n, sr, 0.18)
      for (let i = 0; i < n; i++) hiss[i] = hiss[i] * 0.45 * (0.5 + 0.5 * gust[i]) + body[i] * 0.35 * (0.4 + 0.6 * gust[i])
      scatter(hiss, sr, rng, { count: Math.round((n / sr) * 300), length: [0.0005, 0.0018], freq: [3000, 8000], amp: [0.05, 0.22] })
      return hiss
    })
  },
  'bed.blizzard'(rng, sr) {
    // A blizzard: a high, cold howl over the roar, icy hiss in the gusts
    return loop(sr, (n) => {
      const body = pinkNoise(n, rng)
      biquad(body, sr, 'lowpass', 500, 0.6)
      biquad(body, sr, 'highpass', 80, 0.7)
      const gust = slowWalk(rng, n, sr, 0.2)
      const howl = whistle(n, sr, rng, (t) => 1100 + 500 * Math.sin(t * 0.37) + 260 * Math.sin(t * 1.21), 8)
      const high = whistle(n, sr, rng, (t) => 1700 + 400 * Math.sin(t * 0.29 + 2), 10)
      const icy = whiteNoise(n, rng)
      biquad(icy, sr, 'highpass', 4500, 0.6)
      for (let i = 0; i < n; i++) {
        const g = gust[i]
        body[i] = body[i] * (0.35 + 0.5 * g) + (howl[i] * 1.2 + high[i] * 0.6) * g * g + icy[i] * 0.12 * (0.5 + 0.5 * g)
      }
      return body
    })
  },
  'bed.embers'(rng, sr) {
    // Falling embers: sparse crackles and pops over a faint low roar
    return loop(sr, (n) => {
      const out = brownNoise(n, rng)
      biquad(out, sr, 'lowpass', 260, 0.7)
      const swell = slowWalk(rng, n, sr, 0.1)
      for (let i = 0; i < n; i++) out[i] *= 0.3 * (0.6 + 0.4 * swell[i])
      const seconds = n / sr
      const clusters = Math.round(seconds * 6)
      for (let c = 0; c < clusters; c++) {
        const at = rng() * (seconds - 0.1)
        addGrains(out, sr, rng, { count: 2 + Math.floor(rng() * 5), start: at, spread: 0.025, grainLength: [0.0008, 0.004], freq: [1500, 6000], q: 1.5, amp: range(rng, 0.25, 0.7), bunch: 1 })
      }
      scatter(out, sr, rng, { count: Math.round(seconds * 0.8), length: [0.004, 0.008], freq: [600, 1500], amp: [0.3, 0.6], q: 1 })
      return out
    })
  },
  'bed.shimmer'(rng, sr) {
    // Glittering ice or ringing crystals: sparse tiny pings at no fixed pitch, a breath of air
    return loop(sr, (n) => {
      const air = whiteNoise(n, rng)
      biquad(air, sr, 'bandpass', 6000, 0.8)
      const breathe = slowWalk(rng, n, sr, 0.08)
      for (let i = 0; i < n; i++) air[i] *= 0.05 * (0.5 + 0.5 * breathe[i])
      const seconds = n / sr
      const pings = Math.round(seconds * 2.6)
      for (let p = 0; p < pings; p++) {
        const f = range(rng, 2500, 7000)
        const decay = range(rng, 0.2, 0.55)
        const amp = range(rng, 0.12, 0.38)
        const modes: Mode[] = [
          { freq: f, amp, decay },
          { freq: f * 2.76, amp: amp * 0.3, decay: decay * 0.4 },
          { freq: f * 5.4, amp: amp * 0.12, decay: decay * 0.2 },
        ]
        addModes(air, sr, modes, rng() * (seconds - 0.8), 0.003)
      }
      return air
    })
  },
  'bed.aurora'(rng, sr) {
    // The aurora: a slow, morphing chord of drifting partials and a breathing high air
    return loop(sr, (n) => {
      const out = new Float32Array(n)
      const base = range(rng, 165, 185)
      const ratios = [1, 1.5, 2, 3.01, 4.02]
      ratios.forEach((ratio, idx) => {
        const swell = slowWalk(rng, n, sr, 0.05)
        const drift = slowWalk(rng, n, sr, 0.03)
        let phase = rng() * Math.PI * 2
        const amp = idx === 0 ? 0.3 : 0.18 / Math.sqrt(idx)
        for (let i = 0; i < n; i++) {
          phase += (2 * Math.PI * base * ratio * (1 + 0.006 * (drift[i] - 0.5))) / sr
          out[i] += Math.sin(phase) * amp * swell[i]
        }
      })
      const air = pinkNoise(n, rng)
      biquad(air, sr, 'bandpass', 2400, 2)
      const breathe = slowWalk(rng, n, sr, 0.07)
      for (let i = 0; i < n; i++) out[i] += air[i] * 0.08 * breathe[i]
      return out
    })
  },
  'bed.roof'(rng, sr) {
    // Rain on the roof, heard from inside: a dull, close patter of thuds
    return loop(sr, (n) => {
      const body = brownNoise(n, rng)
      biquad(body, sr, 'lowpass', 450, 0.7)
      for (let i = 0; i < n; i++) body[i] *= 0.4
      scatter(body, sr, rng, { count: Math.round((n / sr) * 240), length: [0.002, 0.006], freq: [150, 900], amp: [0.1, 0.45], q: 1 })
      return body
    })
  },
}

/** Church-bell partials (relative to the prime): hum, prime, tierce, quint, nominal and the upper partials. */
const BELL_PARTIALS: readonly [number, number, number][] = [
  // ratio, amplitude, decay (s)
  [0.5, 0.45, 4.0],
  [1.0, 0.55, 3.0],
  [1.19, 0.4, 2.4],
  [1.5, 0.22, 1.6],
  [2.0, 0.8, 2.0],
  [2.51, 0.28, 1.1],
  [2.66, 0.22, 0.9],
  [3.36, 0.2, 0.6],
  [4.07, 0.16, 0.45],
  [4.45, 0.12, 0.35],
  [5.4, 0.1, 0.25],
  [6.1, 0.07, 0.18],
  [7.3, 0.05, 0.12],
]

export const WEATHER_SFX: Record<string, Recipe> = {
  'weather.thunder.near'(rng, sr) {
    // A strike close by: a tearing crack, then a long rolling rumble that
    // swells again a second or two later
    const length = 6.5
    const b = samples(length, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.22, amp: 0.55, type: 'highpass', freq: 900, attack: 0.0005, tau: 0.03 })
    addGrains(b, sr, rng, { count: 45, spread: 0.4, grainLength: [0.001, 0.006], freq: [600, 6000], q: 1.2, amp: 0.35, bunch: 1.8 })
    const n = Math.ceil((length - 0.1) * sr)
    const rumble = brownNoise(n, rng)
    biquad(rumble, sr, 'lowpass', (t) => 150 + 600 * Math.exp(-t / 0.5), 0.7)
    const mid = pinkNoise(n, rng)
    biquad(mid, sr, 'bandpass', (t) => 320 + 260 * Math.exp(-t / 1.0), 1.0)
    const rolls = slowWalk(rng, n, sr, 1.2)
    const secondAt = range(rng, 1.0, 2.0)
    const i0 = Math.floor(0.02 * sr)
    for (let i = 0; i < n && i0 + i < b.length; i++) {
      const t = i / sr
      const second = 0.7 * Math.exp(-((t - secondAt) ** 2) / (2 * 0.45 * 0.45))
      const env = Math.min(1, t / 0.06) * Math.exp(-t / 3.0) * (0.45 + 0.55 * rolls[i]) * (1 + second)
      b[i0 + i] += (rumble[i] + mid[i] * 0.9) * env
    }
    return finish(b, sr, 25)
  },
  'weather.thunder.far'(rng, sr) {
    // Far off: no crack, a low roll that swells and fades
    const length = 6
    const b = samples(length, sr)
    const n = Math.ceil((length - 0.1) * sr)
    const rumble = brownNoise(n, rng)
    biquad(rumble, sr, 'lowpass', 280, 0.7)
    // Enough low-mid that the roll still reads on small speakers
    const mid = pinkNoise(n, rng)
    biquad(mid, sr, 'bandpass', (t) => 270 + 80 * Math.sin(t * 1.3), 1.2)
    const rolls = slowWalk(rng, n, sr, 0.9)
    const env = swellEnv(range(rng, 0.4, 0.8), length - 0.1, 3.2)
    for (let i = 0; i < n; i++) b[i] += (rumble[i] * 0.9 + mid[i] * 0.5) * env(i / sr) * (0.45 + 0.55 * rolls[i])
    return finish(b, sr, 25)
  },
  'weather.zap'(rng, sr) {
    // An electric crack: a hard snap, crackling sparks, a short buzz
    const b = samples(0.5, sr)
    addNoiseBurst(b, sr, rng, { duration: 0.12, amp: 0.9, type: 'highpass', freq: 2500, attack: 0.0004, tau: 0.03 })
    addGrains(b, sr, rng, { count: 40, spread: 0.3, grainLength: [0.0006, 0.003], freq: [3000, 8000], q: 1.5, amp: 0.55, bunch: 1.6 })
    const n = Math.ceil(0.18 * sr)
    const buzz = new Float32Array(n)
    const f = range(rng, 95, 125)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let s = 0
      for (let h = 1; h <= 30; h++) s += Math.sin(2 * Math.PI * f * h * t) / h
      buzz[i] = s * Math.exp(-t / 0.05)
    }
    biquad(buzz, sr, 'bandpass', 1500, 0.9)
    for (let i = 0; i < n; i++) b[i] += buzz[i] * 0.5
    return finish(b, sr, 150)
  },
  'weather.meteor.whoosh'(rng, sr) {
    // A falling star: a hiss that drops and swells, sizzling, as it comes down
    const length = 1.4
    const b = samples(length, sr)
    const n = Math.ceil(1.3 * sr)
    const hiss = whiteNoise(n, rng)
    biquad(hiss, sr, 'bandpass', (t) => 5000 * Math.pow(500 / 5000, t / 1.3), 1.2)
    const roar = brownNoise(n, rng)
    biquad(roar, sr, 'lowpass', 300, 0.7)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const env = Math.pow(Math.min(1, t / 1.2), 2.2) * (t > 1.24 ? Math.max(0, 1 - (t - 1.24) / 0.06) : 1)
      b[i] += (hiss[i] * 0.7 + roar[i] * 0.35 * env) * env
    }
    addGrains(b, sr, rng, { count: 60, start: 0.2, spread: 1.0, grainLength: [0.0006, 0.003], freq: [2000, 7000], q: 1.4, amp: 0.3, bunch: 0.6 })
    return finish(b, sr, 120)
  },
  'weather.meteor.impact'(rng, sr) {
    // It lands: a soft heavy thud, earth crumbling, a scatter of glassy shards
    const b = samples(1.2, sr)
    addSine(b, sr, (t) => 40 + 50 * Math.exp(-t / 0.05), (t) => 0.8 * Math.exp(-t / 0.1), 0, 0.8)
    addNoiseBurst(b, sr, rng, { duration: 0.4, amp: 0.6, type: 'lowpass', freq: 600, tau: 0.08, color: 'brown' })
    addGrains(b, sr, rng, { count: 40, start: 0.02, spread: 0.5, grainLength: [0.002, 0.008], freq: [300, 2500], q: 1.2, amp: 0.4, bunch: 1.8 })
    addDenseModes(b, sr, rng, { count: 14, lo: 2200, hi: 7000, decay: 0.12, amp: 0.25, start: 0.02, tilt: 0.4 })
    addDenseModes(b, sr, rng, { count: 8, lo: 2600, hi: 6500, decay: 0.08, amp: 0.12, start: 0.15, tilt: 0.4 })
    return finish(b, sr, 60)
  },
  'weather.skybell'(rng, sr) {
    // A bronze bell: inharmonic church-bell partials, each a beating pair, over a struck clank
    const b = samples(4.5, sr)
    const prime = range(rng, 505, 540)
    const modes: Mode[] = []
    for (const [ratio, amp, decay] of BELL_PARTIALS) {
      const f = prime * ratio
      const beat = 1 + range(rng, 0.0008, 0.002)
      modes.push({ freq: f, amp: amp * 0.6, decay }, { freq: f * beat, amp: amp * 0.4, decay: decay * 0.9 })
    }
    addModes(b, sr, modes, 0, 0.002)
    addDenseModes(b, sr, rng, { count: 18, lo: 1500, hi: 7000, decay: 0.02, amp: 0.35, tilt: 0.5 })
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.3, type: 'highpass', freq: 2500, tau: 0.004 })
    return finish(b, sr, 150)
  },
}
