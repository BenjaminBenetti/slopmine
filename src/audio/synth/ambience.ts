/**
 * Ambience: seamless background beds (looped noise textures) and the sparse
 * one-shot details that ride on them (drips, lava pops, ice creaks, birds).
 * Pure recipes - see dsp.ts.
 */

import { creak } from './blockSounds.ts'
import { voice } from './sfxRecipes.ts'
import {
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
  type Rng,
} from './dsp.ts'

type Recipe = (rng: Rng, sr: number) => Float32Array

const LOOP_SECONDS = 16
const CROSSFADE_SECONDS = 2

/** Smoothed random walk in 0..1 (gusts, slow swells). */
function slowWalk(rng: Rng, n: number, sr: number, rate: number): Float32Array {
  const out = new Float32Array(n)
  const k = 1 - Math.exp((-2 * Math.PI * rate) / sr)
  let target = rng()
  let y = target
  let next = 0
  for (let i = 0; i < n; i++) {
    if (i >= next) {
      target = rng()
      next = i + Math.floor(sr / rate) * (0.5 + rng())
    }
    y += k * (target - y)
    out[i] = y
  }
  return out
}

/** Render `make(n)` with extra length and crossfade the tail into the head so it loops seamlessly. */
function loop(sr: number, make: (n: number) => Float32Array): Float32Array {
  const n = Math.ceil(LOOP_SECONDS * sr)
  const x = Math.ceil(CROSSFADE_SECONDS * sr)
  const raw = make(n + x)
  const out = raw.slice(0, n)
  for (let i = 0; i < x; i++) {
    const a = i / x
    // Equal-power crossfade from the tail (beyond n) into the head.
    out[i] = raw[i] * Math.sin((a * Math.PI) / 2) + raw[n + i] * Math.cos((a * Math.PI) / 2)
  }
  return normalize(out, 0.9)
}

export const AMBIENCE_BEDS: Record<string, Recipe> = {
  'bed.wind'(rng, sr) {
    return loop(sr, (n) => {
      const air = pinkNoise(n, rng)
      biquad(air, sr, 'lowpass', 520, 0.6)
      const gust = slowWalk(rng, n, sr, 0.12)
      const whistle = whiteNoise(n, rng)
      biquad(whistle, sr, 'bandpass', (t) => 520 + 260 * Math.sin(t * 0.37) + 120 * Math.sin(t * 0.91), 5)
      for (let i = 0; i < n; i++) air[i] = air[i] * (0.35 + 0.65 * gust[i]) + whistle[i] * 0.25 * gust[i] * gust[i]
      return air
    })
  },
  'bed.cave'(rng, sr) {
    return loop(sr, (n) => {
      const low = brownNoise(n, rng)
      biquad(low, sr, 'lowpass', 140, 0.7)
      const hollow = pinkNoise(n, rng)
      biquad(hollow, sr, 'bandpass', 260, 3)
      const swell = slowWalk(rng, n, sr, 0.08)
      for (let i = 0; i < n; i++) low[i] = low[i] * 0.8 + hollow[i] * 0.35 * swell[i]
      return low
    })
  },
  'bed.hell'(rng, sr) {
    return loop(sr, (n) => {
      const rumble = brownNoise(n, rng)
      biquad(rumble, sr, 'lowpass', 95, 0.8)
      const roar = pinkNoise(n, rng)
      biquad(roar, sr, 'bandpass', (t) => 170 + 40 * Math.sin(t * 0.3), 2)
      const swell = slowWalk(rng, n, sr, 0.07)
      for (let i = 0; i < n; i++) rumble[i] = rumble[i] * (0.7 + 0.3 * swell[i]) + roar[i] * 0.3 * swell[i]
      return rumble
    })
  },
  'bed.ossuary'(rng, sr) {
    return loop(sr, (n) => {
      const wind = pinkNoise(n, rng)
      biquad(wind, sr, 'bandpass', (t) => 420 + 180 * Math.sin(t * 0.29) + 90 * Math.sin(t * 0.83), 4)
      const low = brownNoise(n, rng)
      biquad(low, sr, 'lowpass', 110, 0.7)
      const gust = slowWalk(rng, n, sr, 0.1)
      for (let i = 0; i < n; i++) wind[i] = wind[i] * (0.3 + 0.7 * gust[i]) + low[i] * 0.5
      return wind
    })
  },
  'bed.embergrove'(rng, sr) {
    return loop(sr, (n) => {
      const air = whiteNoise(n, rng)
      biquad(air, sr, 'highpass', 3800, 0.6)
      biquad(air, sr, 'lowpass', 9000, 0.6)
      const flutter = slowWalk(rng, n, sr, 0.5)
      const hum = brownNoise(n, rng)
      biquad(hum, sr, 'lowpass', 160, 0.7)
      for (let i = 0; i < n; i++) air[i] = air[i] * 0.25 * flutter[i] + hum[i] * 0.7
      return air
    })
  },
  'bed.crystal'(rng, sr) {
    return loop(sr, (n) => {
      const out = new Float32Array(n)
      // A faint glassy chord whose partials beat slowly against each other.
      const partials = [110, 110.35, 165, 220.4, 329.6, 330.2]
      const swell = slowWalk(rng, n, sr, 0.06)
      partials.forEach((f, idx) => {
        let phase = rng() * Math.PI * 2
        const w = (2 * Math.PI * f) / sr
        const amp = idx < 2 ? 0.3 : 0.15
        for (let i = 0; i < n; i++) {
          phase += w
          out[i] += Math.sin(phase) * amp
        }
      })
      const hiss = whiteNoise(n, rng)
      biquad(hiss, sr, 'bandpass', 5000, 1)
      const low = brownNoise(n, rng)
      biquad(low, sr, 'lowpass', 100, 0.7)
      for (let i = 0; i < n; i++) out[i] = out[i] * (0.4 + 0.6 * swell[i]) + hiss[i] * 0.06 + low[i] * 0.5
      return out
    })
  },
  'bed.cocytus'(rng, sr) {
    return loop(sr, (n) => {
      const wind = whiteNoise(n, rng)
      biquad(wind, sr, 'bandpass', (t) => 1100 + 450 * Math.sin(t * 0.41) + 250 * Math.sin(t * 1.13), 6)
      const body = pinkNoise(n, rng)
      biquad(body, sr, 'lowpass', 400, 0.7)
      const gust = slowWalk(rng, n, sr, 0.14)
      for (let i = 0; i < n; i++) wind[i] = wind[i] * 0.6 * gust[i] * gust[i] + body[i] * (0.3 + 0.3 * gust[i])
      return wind
    })
  },
  'bed.underwater'(rng, sr) {
    return loop(sr, (n) => {
      const low = brownNoise(n, rng)
      biquad(low, sr, 'lowpass', 320, 0.7)
      const swell = slowWalk(rng, n, sr, 0.2)
      for (let i = 0; i < n; i++) low[i] *= 0.6 + 0.4 * swell[i]
      return low
    })
  },
}

function finish(buf: Float32Array, sr: number): Float32Array {
  return trimTail(normalize(buf, 0.9), sr)
}

export const AMBIENCE_DETAILS: Record<string, Recipe> = {
  'amb.drip'(rng, sr) {
    const b = samples(0.25, sr)
    const f = range(rng, 1100, 1900)
    addSine(b, sr, (t) => f * (1 + 1.5 * Math.min(1, t / 0.012)), (t) => (t < 0.001 ? t / 0.001 : Math.exp(-(t - 0.001) / 0.014)), 0, 0.1)
    addNoiseBurst(b, sr, rng, { duration: 0.02, amp: 0.15, freq: 3000, q: 1, tau: 0.004 })
    return finish(b, sr)
  },
  'amb.lavapop'(rng, sr) {
    const b = samples(0.5, sr)
    const f = range(rng, 110, 190)
    addSine(b, sr, (t) => f * (1 + 1.4 * Math.min(1, t / 0.05)), (t) => (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.05)), 0, 0.3)
    addGrains(b, sr, rng, { count: 8, start: 0.03, spread: 0.3, grainLength: [0.001, 0.004], freq: [1500, 5000], amp: 0.3, bunch: 1.5 })
    return finish(b, sr)
  },
  'amb.icecreak'(rng, sr) {
    const b = samples(0.9, sr)
    creak(b, sr, rng, 0, range(rng, 0.4, 0.7), range(rng, 18, 30), range(rng, 900, 1400), 0.7)
    addNoiseBurst(b, sr, rng, { start: range(rng, 0.1, 0.4), duration: 0.03, amp: 0.4, freq: 3500, q: 1.5, tau: 0.006 })
    return finish(b, sr)
  },
  'amb.crystalping'(rng, sr) {
    const b = samples(2.2, sr)
    const pitches = [1318.5, 1480, 1760, 1975.5, 2217.5, 2637]
    const f = pitches[Math.floor(rng() * pitches.length)]
    addModes(b, sr, [
      { freq: f, amp: 1, decay: 0.5 },
      { freq: f * 2.01, amp: 0.25, decay: 0.3 },
      { freq: f * 3.02, amp: 0.1, decay: 0.15 },
    ], 0, 0.004)
    return finish(b, sr)
  },
  'amb.bonechime'(rng, sr) {
    const b = samples(0.8, sr)
    for (let i = 0; i < 4; i++) {
      const f0 = range(rng, 900, 1500)
      addModes(b, sr, [{ freq: f0, amp: range(rng, 0.4, 1), decay: 0.04 }, { freq: f0 * 2.4, amp: 0.3, decay: 0.02 }], Math.pow(rng(), 1.2) * 0.5)
    }
    return finish(b, sr)
  },
  'amb.sporepuff'(rng, sr) {
    const b = samples(0.7, sr)
    const n = Math.ceil(0.5 * sr)
    const puff = pinkNoise(n, rng)
    biquad(puff, sr, 'lowpass', 900, 0.7)
    const env = swellEnv(0.06, 0.5, 0.35)
    for (let i = 0; i < n; i++) b[i] += puff[i] * env(i / sr)
    addGrains(b, sr, rng, { count: 6, start: 0.1, spread: 0.4, grainLength: [0.002, 0.005], freq: [4000, 8000], amp: 0.2 })
    return finish(b, sr)
  },
  'amb.bird'(rng, sr) {
    const b = samples(1.0, sr)
    const notes = 2 + Math.floor(rng() * 4)
    const base = range(rng, 2600, 3800)
    let t = 0
    for (let i = 0; i < notes; i++) {
      const len = range(rng, 0.05, 0.11)
      const up = rng() < 0.5
      const f = base * range(rng, 0.85, 1.15)
      const env = swellEnv(len * 0.2, len, len * 0.5)
      addSine(b, sr, (tt) => f * (1 + (up ? 0.35 : -0.25) * (tt / len)) * (1 + 0.04 * Math.sin(tt * 220)), (tt) => env(tt) * 0.8, t, len)
      t += len + range(rng, 0.03, 0.09)
    }
    return finish(b, sr)
  },
  'amb.frog'(rng, sr) {
    const b = samples(0.6, sr)
    const croaks = 1 + Math.floor(rng() * 2)
    for (let i = 0; i < croaks; i++) {
      voice(b, sr, rng, {
        start: i * 0.2,
        length: 0.14,
        f0: () => range(rng, 110, 140),
        formants: [
          [450, 5, 1],
          [1100, 6, 0.4],
          [2400, 8, 0.1],
        ],
        amp: 1,
        rough: 0.8,
        roughRate: 45,
        breath: 0.1,
      })
    }
    return finish(b, sr)
  },
  'amb.distantrumble'(rng, sr) {
    const b = samples(3.0, sr)
    const n = Math.ceil(2.8 * sr)
    const r = brownNoise(n, rng)
    biquad(r, sr, 'lowpass', 120, 0.8)
    const env = swellEnv(0.8, 2.8, 1.6)
    for (let i = 0; i < n; i++) b[i] += r[i] * env(i / sr)
    return finish(b, sr)
  },
}
