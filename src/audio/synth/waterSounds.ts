/**
 * The water's ambience beds (looped, see ambience.ts `loop`): the sea's surf
 * on a shore, a river babbling along, and water lapping at a boat's hull.
 * Pure recipes - see dsp.ts.
 */

import { loop, slowWalk } from './ambience.ts'
import { addNoiseBurst, biquad, brownNoise, pinkNoise, range, whiteNoise, type Rng } from './dsp.ts'

type Recipe = (rng: Rng, sr: number) => Float32Array

export const WATER_BEDS: Record<string, Recipe> = {
  'bed.surf'(rng, sr) {
    // Waves rolling in every 6-9 s: a swelling rumble, the crash, then the hiss of foam drawing back
    return loop(sr, (n) => {
      const body = brownNoise(n, rng)
      biquad(body, sr, 'lowpass', 380, 0.7)
      const wash = pinkNoise(n, rng)
      biquad(wash, sr, 'highpass', 700, 0.6)
      biquad(wash, sr, 'lowpass', 5200, 0.6)
      const env = new Float32Array(n)
      const hiss = new Float32Array(n)
      const seconds = n / sr
      for (let at = range(rng, 0, 2); at < seconds; at += range(rng, 6, 9)) {
        const rise = range(rng, 1.8, 2.6)
        const fall = range(rng, 2.6, 3.6)
        const peak = range(rng, 0.7, 1)
        for (let i = Math.max(0, Math.floor((at - rise) * sr)); i < Math.min(n, Math.ceil((at + fall + 2) * sr)); i++) {
          const t = i / sr - at
          // Swell up to the crash, then a long falling tail
          const e = t < 0 ? Math.pow(1 + t / rise, 2) : Math.exp(-t / (fall * 0.45))
          env[i] = Math.max(env[i], e * peak)
          // The draw-back hiss trails the crash
          if (t > 0.3) hiss[i] = Math.max(hiss[i], Math.exp(-(t - 0.3) / 1.4) * (1 - Math.exp(-(t - 0.3) / 0.25)) * peak)
        }
      }
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = body[i] * (0.25 + 0.75 * env[i]) * 0.9 + wash[i] * (0.08 + 0.6 * hiss[i] + 0.25 * env[i])
      return out
    })
  },
  'bed.stream'(rng, sr) {
    // A river babbling: a bright wash with gurgles bubbling up through it
    return loop(sr, (n) => {
      const wash = pinkNoise(n, rng)
      biquad(wash, sr, 'bandpass', (t) => 1600 + 500 * Math.sin(t * 0.7) + 300 * Math.sin(t * 2.3), 0.8)
      const swell = slowWalk(rng, n, sr, 0.4)
      for (let i = 0; i < n; i++) wash[i] *= 0.4 * (0.7 + 0.3 * swell[i])
      // Gurgles: short resonant bubbles
      const seconds = n / sr
      const count = Math.round(seconds * 26)
      for (let k = 0; k < count; k++) {
        const len = range(rng, 0.02, 0.07)
        const f = range(rng, 380, 1400)
        addNoiseBurst(wash, sr, rng, {
          start: rng() * (seconds - len),
          duration: len,
          amp: range(rng, 0.08, 0.3),
          freq: (t) => f * (1 + 1.6 * t / len),
          q: 9,
          attack: 0.003,
          tau: len / 2.5,
        })
      }
      return wash
    })
  },
  'bed.lapping'(rng, sr) {
    // Little waves slapping the hull, irregular, over a quiet slosh
    return loop(sr, (n) => {
      const slosh = brownNoise(n, rng)
      biquad(slosh, sr, 'lowpass', 520, 0.7)
      const sway = slowWalk(rng, n, sr, 0.5)
      for (let i = 0; i < n; i++) slosh[i] *= 0.35 * (0.6 + 0.4 * sway[i])
      const seconds = n / sr
      for (let at = rng() * 0.5; at < seconds - 0.3; at += range(rng, 0.35, 1.1)) {
        const len = range(rng, 0.08, 0.18)
        addNoiseBurst(slosh, sr, rng, {
          start: at,
          duration: len,
          amp: range(rng, 0.25, 0.6),
          type: 'bandpass',
          freq: range(rng, 500, 1100),
          q: 1.4,
          attack: 0.006,
          tau: len / 3,
          color: 'pink',
        })
      }
      const sparkle = whiteNoise(n, rng)
      biquad(sparkle, sr, 'highpass', 3500, 0.6)
      for (let i = 0; i < n; i++) slosh[i] += sparkle[i] * 0.02 * sway[i]
      return slosh
    })
  },
}
