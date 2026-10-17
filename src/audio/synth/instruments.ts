/**
 * Music instrument notes and room impulse responses. Pure recipes - see
 * dsp.ts. Sustained voices (pads, drones) are live Web Audio oscillators in
 * MusicPlayer.ts; struck/plucked notes are rendered here once per pitch.
 */

import {
  addDenseModes,
  addModes,
  addNoiseBurst,
  addSine,
  biquad,
  createRng,
  normalize,
  range,
  samples,
  trimTail,
  whiteNoise,
  type Mode,
} from './dsp.ts'

export type InstrumentId =
  | 'piano'
  | 'pluck'
  | 'bell'
  | 'guitar'
  | 'harp'
  | 'rhodes'
  | 'vibes'
  | 'musicbox'
  | 'handpan'
  | 'flute'
  | 'drum'
  | 'frame'
  | 'tick'
  | 'rim'
  | 'shaker'

/** Unpitched instruments: one sample, always played at its own pitch. */
export const PERCUSSION: ReadonlySet<InstrumentId> = new Set<InstrumentId>(['drum', 'frame', 'tick', 'rim', 'shaker'])

/** Wind voices: a new note cuts the previous one short, like a player taking a breath. */
export const MONOPHONIC: ReadonlySet<InstrumentId> = new Set<InstrumentId>(['flute'])

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

/** Nylon-string guitar: harmonic partials shaped by the plucking point, a short wooden body. */
function guitar(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 6151)
  const tau = Math.min(2.2, Math.max(0.6, 1.5 * Math.pow(196 / f0, 0.5)))
  const buf = samples(Math.min(4, tau * 3), sr)
  const modes: Mode[] = []
  const limit = Math.min(5000, sr / 2.3)
  for (let n = 1; n <= 24; n++) {
    const f = n * f0 * (1 + 0.00008 * n * n)
    if (f > limit) break
    // Plucked a sixth of the way along: the partials with a node there go quiet.
    const amp = (Math.abs(Math.sin(n * Math.PI * 0.16)) / Math.pow(n, 1.4)) * Math.exp(-f / 3500)
    modes.push({ freq: f, amp, decay: tau / (1 + 0.45 * (n - 1)) })
  }
  addModes(buf, sr, modes, 0, 0.0012)
  addDenseModes(buf, sr, rng, { count: 10, lo: 95, hi: 420, decay: 0.05, amp: 0.04, tilt: 0.4 })
  addNoiseBurst(buf, sr, rng, { duration: 0.012, amp: 0.025, freq: 2500, q: 0.8, tau: 0.002 })
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Concert harp: round and long-ringing, plucked near the middle of the string. */
function harp(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 7307)
  const tau = Math.min(3.2, Math.max(0.8, 2.2 * Math.pow(220 / f0, 0.45)))
  const buf = samples(Math.min(5, tau * 2.6), sr)
  const modes: Mode[] = []
  const limit = Math.min(5000, sr / 2.3)
  for (let n = 1; n <= 10; n++) {
    const f = n * f0
    if (f > limit) break
    const amp = Math.abs(Math.sin(n * Math.PI * 0.32)) / Math.pow(n, 1.8)
    modes.push({ freq: f * (1 + 0.0003 * rng()), amp, decay: tau / (1 + 0.6 * (n - 1)) })
  }
  addModes(buf, sr, modes, 0, 0.0025)
  addNoiseBurst(buf, sr, rng, { duration: 0.008, amp: 0.012, freq: 1800, q: 0.8, tau: 0.0015 })
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Electric piano (tine): a sine carrier with a decaying FM "bark" over a warm body. */
function rhodes(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const tau = Math.min(3.5, Math.max(0.9, 2.6 * Math.pow(261.6 / f0, 0.5)))
  const buf = samples(Math.min(5, tau * 2.4), sr)
  const w = (2 * Math.PI * f0) / sr
  // The bark is brighter on low notes and stays under Nyquist on high ones.
  const bark = Math.min(1.6, Math.max(0.5, 1.6 * Math.pow(261.6 / f0, 0.35)))
  for (let i = 0; i < buf.length; i++) {
    const t = i / sr
    const index = bark * Math.exp(-t / 0.18) + 0.22
    const env = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / tau)
    buf[i] = Math.sin(w * i + index * Math.sin(w * i)) * env
  }
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Vibraphone: bars tuned 1 : 4 : 10, a soft yarn mallet, gentle motor tremolo. */
function vibes(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 3301)
  const tau = Math.min(3.6, Math.max(1.0, 2.8 * Math.pow(440 / f0, 0.4)))
  const buf = samples(Math.min(5.5, tau * 2.2), sr)
  addModes(buf, sr, [
    { freq: f0, amp: 1, decay: tau },
    { freq: f0 * 3.98, amp: 0.12, decay: tau * 0.18 },
    { freq: f0 * 9.8, amp: 0.025, decay: tau * 0.05 },
  ], 0, 0.002)
  addNoiseBurst(buf, sr, rng, { duration: 0.01, amp: 0.02, type: 'lowpass', freq: 1500, tau: 0.002 })
  const phase = rng() * 2 * Math.PI
  for (let i = 0; i < buf.length; i++) {
    const t = i / sr
    buf[i] *= 1 - 0.28 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4.8 * t + phase)) * Math.min(1, t / 0.15)
  }
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Music-box comb: a steel tine (fundamental + the cantilever's 6.27x mode), a tiny pin click. */
function musicbox(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 9173)
  const tau = Math.min(2.4, Math.max(0.7, 1.6 * Math.pow(1046 / f0, 0.5)))
  const buf = samples(Math.min(4, tau * 2.6), sr)
  addModes(buf, sr, [
    { freq: f0, amp: 1, decay: tau },
    // A slightly detuned twin: the slow shimmer of a real comb.
    { freq: f0 * 1.0018, amp: 0.25, decay: tau * 0.8 },
    { freq: f0 * 2.0, amp: 0.05, decay: tau * 0.3 },
    { freq: f0 * 6.27, amp: 0.18, decay: tau * 0.08 },
  ], 0, 0.0008)
  addNoiseBurst(buf, sr, rng, { duration: 0.004, amp: 0.05, freq: 4500, q: 1, tau: 0.0008 })
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Handpan: a soft-struck steel note field - fundamental, octave and compound fifth, slow beating. */
function handpan(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 2731)
  const tau = Math.min(3.4, Math.max(1.0, 2.6 * Math.pow(293.7 / f0, 0.4)))
  const buf = samples(Math.min(5.5, tau * 2.2), sr)
  addModes(buf, sr, [
    { freq: f0, amp: 1, decay: tau },
    { freq: f0 * 1.0012, amp: 0.35, decay: tau },
    { freq: f0 * 2.0, amp: 0.42, decay: tau * 0.6 },
    { freq: f0 * 3.0, amp: 0.2, decay: tau * 0.35 },
  ], 0, 0.006)
  addNoiseBurst(buf, sr, rng, { duration: 0.03, amp: 0.05, type: 'lowpass', freq: 700, tau: 0.008 })
  return trimTail(normalize(buf, 0.9), sr, 0.002)
}

/** Ocarina / soft flute: a breathy near-sine "hoo" with late vibrato, fading like a breath let go. */
function flute(midi: number, sr: number): Float32Array {
  const f0 = midiHz(midi)
  const rng = createRng(midi * 5333)
  const buf = samples(2.4, sr)
  const hold = 0.5
  const body = (t: number): number => Math.min(1, t / 0.06) * (t < hold ? 1 : Math.exp(-(t - hold) / 0.35))
  const vibratoPhase = rng() * 2 * Math.PI
  let phase = 0
  for (let i = 0; i < buf.length; i++) {
    const t = i / sr
    const vibrato = 1 + 0.004 * Math.min(1, Math.max(0, (t - 0.25) / 0.4)) * Math.sin(2 * Math.PI * 5 * t + vibratoPhase)
    phase += (2 * Math.PI * f0 * vibrato) / sr
    buf[i] = (Math.sin(phase) + 0.1 * Math.sin(2 * phase) + 0.035 * Math.sin(3 * phase)) * body(t)
  }
  // Breath: noise around the note, a chiff at the start and a little all through.
  const breath = biquad(whiteNoise(buf.length, rng), sr, 'bandpass', Math.min(f0 * 2, 5000), 1.2)
  for (let i = 0; i < buf.length; i++) {
    const t = i / sr
    buf[i] += breath[i] * (0.06 * Math.exp(-t / 0.05) + 0.018 * body(t))
  }
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

/** Frame drum: a soft hand on a skin - membrane modes around 130 Hz and a muted slap. */
function frame(_midi: number, sr: number): Float32Array {
  const rng = createRng(2718)
  const buf = samples(0.9, sr)
  const ratios = [1, 1.59, 2.14, 2.3, 2.65, 2.92]
  const amps = [1, 0.5, 0.35, 0.25, 0.18, 0.12]
  addModes(buf, sr, ratios.map((r, i) => ({ freq: 132 * r, amp: amps[i], decay: 0.28 / (1 + i * 0.6) })), 0, 0.002)
  addNoiseBurst(buf, sr, rng, { duration: 0.05, amp: 0.25, type: 'lowpass', freq: 900, tau: 0.012 })
  return trimTail(normalize(buf, 0.9), sr)
}

/** Woodblock "tok": dense short modes with no pitch to speak of (a clock under the castle vigil). */
function rim(_midi: number, sr: number): Float32Array {
  const rng = createRng(1618)
  const buf = samples(0.15, sr)
  addDenseModes(buf, sr, rng, { count: 14, lo: 700, hi: 2600, decay: 0.03, amp: 1, tilt: 0.6 })
  addNoiseBurst(buf, sr, rng, { duration: 0.01, amp: 0.2, freq: 2000, q: 1, tau: 0.0015 })
  return trimTail(normalize(buf, 0.9), sr)
}

/** Shaker: a soft swish of seeds. */
function shaker(_midi: number, sr: number): Float32Array {
  const rng = createRng(5150)
  const buf = samples(0.12, sr)
  addNoiseBurst(buf, sr, rng, { duration: 0.1, amp: 1, type: 'highpass', freq: 4500, attack: 0.012, tau: 0.025 })
  biquad(buf, sr, 'lowpass', 9000, 0.707)
  return trimTail(normalize(buf, 0.9), sr)
}

const RENDERERS: Record<InstrumentId, (midi: number, sr: number) => Float32Array> = {
  piano,
  pluck,
  bell,
  guitar,
  harp,
  rhodes,
  vibes,
  musicbox,
  handpan,
  flute,
  drum,
  frame,
  tick,
  rim,
  shaker,
}

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
