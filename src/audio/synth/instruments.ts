/**
 * Music instrument notes and room impulse responses. Pure recipes - see
 * dsp.ts. Sustained voices (pads, drones) are live Web Audio oscillators in
 * MusicSynth.ts; struck/plucked notes are rendered here once per pitch.
 */

import { addModes, addNoiseBurst, addSine, createRng, normalize, range, samples, trimTail, type Mode } from './dsp.ts'

export type InstrumentId = 'piano' | 'pluck' | 'bell' | 'drum' | 'tick'

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

/** Soft felt piano: stretched partials, double-decay string pairs, muted hammer. */
function piano(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 7919)
  const baseTau = Math.min(4.5, Math.max(0.7, 2.4 * Math.pow(261.6 / f0, 0.55)))
  const length = Math.min(5.5, baseTau * 2.2)
  const buf = samples(length, sr)
  const modes: Mode[] = []
  const inharm = 0.00032
  const limit = Math.min(4500, sr / 2.3)
  for (let n = 1; n <= 16; n++) {
    const f = n * f0 * Math.sqrt(1 + inharm * n * n)
    if (f > limit) break
    // Felt hammer: upper partials fall away quickly in level and in time.
    const amp = Math.pow(n, -1.35) * Math.exp(-f / 2600)
    const tau = baseTau / (1 + 0.3 * (n - 1))
    const detune = 0.00035 * (1 + rng())
    modes.push({ freq: f * (1 - detune), amp: amp * 0.55, decay: tau * 0.28 })
    modes.push({ freq: f * (1 + detune), amp: amp * 0.45, decay: tau })
  }
  addModes(buf, sr, modes, 0, 0.004)
  addNoiseBurst(buf, sr, rng, { duration: 0.02, amp: 0.025, type: 'lowpass', freq: 1400, tau: 0.004 })
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Marimba/kalimba-like pluck: woody fundamental, quick bright overtones. */
function pluck(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 104729)
  const tau = Math.min(1.4, Math.max(0.35, 0.9 * Math.pow(440 / f0, 0.35)))
  const buf = samples(Math.min(3.5, tau * 4), sr)
  addModes(buf, sr, [
    { freq: f0, amp: 1, decay: tau },
    { freq: f0 * 2.0, amp: 0.08, decay: tau * 0.4 },
    { freq: f0 * 3.95, amp: 0.22, decay: tau * 0.14 },
    { freq: f0 * 9.2, amp: 0.06, decay: tau * 0.05 },
  ], 0, 0.002)
  addNoiseBurst(buf, sr, rng, { duration: 0.01, amp: 0.03, freq: 2200, q: 1, tau: 0.002 })
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Celesta / glass bell: long-ringing near-harmonic partials. */
function bell(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const tau = Math.min(2.6, Math.max(0.8, 1.8 * Math.pow(880 / f0, 0.4)))
  const buf = samples(Math.min(5.5, tau * 3.5), sr)
  addModes(buf, sr, [
    { freq: f0, amp: 1, decay: tau },
    { freq: f0 * 2.0, amp: 0.3, decay: tau * 0.55 },
    { freq: f0 * 3.0, amp: 0.12, decay: tau * 0.35 },
    { freq: f0 * 4.16, amp: 0.08, decay: tau * 0.22 },
    { freq: f0 * 5.43, amp: 0.04, decay: tau * 0.12 },
  ], 0, 0.003)
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Soft low drum (boss/dungeon pulse): felt-mallet taiko, no sharp attack. */
function drum(_midi: number, sr: number): Float32Array {
  const rng = createRng(31337)
  const buf = samples(1.2, sr)
  addSine(buf, sr, (t) => 52 + 26 * Math.exp(-t / 0.035), (t) => (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.32)), 0, 1.2)
  addSine(buf, sr, (t) => 104 + 30 * Math.exp(-t / 0.03), (t) => 0.25 * Math.exp(-t / 0.12), 0, 0.6)
  addNoiseBurst(buf, sr, rng, { duration: 0.12, amp: 0.25, type: 'lowpass', freq: 380, tau: 0.03 })
  return trimTail(normalize(buf, 0.9), sr)
}

/** Muted tick (rhythm texture under boss music). */
function tick(_midi: number, sr: number): Float32Array {
  const rng = createRng(4242)
  const buf = samples(0.12, sr)
  addNoiseBurst(buf, sr, rng, { duration: 0.06, amp: 1, freq: range(rng, 3500, 4200), q: 1.4, tau: 0.012 })
  return trimTail(normalize(buf, 0.9), sr)
}

const RENDERERS: Record<InstrumentId, (midi: number, sr: number) => Float32Array> = { piano, pluck, bell, drum, tick }

export function renderInstrumentNote(instrument: InstrumentId, midi: number, sr: number): Float32Array {
  return RENDERERS[instrument](midi, sr)
}

/**
 * Stereo room impulse response: pre-delay, sparse early reflections, then a
 * dense exponentially decaying tail that darkens over time (air absorption).
 */
export function renderImpulseResponse(sr: number, seconds: number, brightness: number, seed: number): [Float32Array, Float32Array] {
  const rng = createRng(seed)
  const n = Math.ceil(seconds * sr)
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)]
  const preDelay = Math.floor(0.012 * sr)
  const tau = seconds / 6.9
  for (const ch of out) {
    // Early reflections.
    for (let r = 0; r < 8; r++) {
      const at = preDelay + Math.floor(range(rng, 0.004, 0.07) * sr)
      if (at < n) ch[at] += range(rng, 0.2, 0.5) * (rng() < 0.5 ? -1 : 1)
    }
    // Tail: noise through a one-pole lowpass whose cutoff falls over time.
    let y = 0
    for (let i = preDelay; i < n; i++) {
      const t = (i - preDelay) / sr
      const cutoff = brightness * (0.25 + 0.75 * Math.exp(-t / (seconds * 0.35)))
      const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sr)
      y += k * (rng() * 2 - 1 - y)
      const fadeIn = Math.min(1, t / 0.02)
      ch[i] += y * Math.exp(-t / tau) * fadeIn * 0.8
    }
  }
  return out
}
