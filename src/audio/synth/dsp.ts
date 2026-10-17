/**
 * Pure sample-level DSP for the procedural sound bank.
 *
 * Everything here works on plain Float32Arrays (mono, values around ±1) and
 * has no Web Audio or DOM dependency, so the recipes run in the audio synth
 * worker and in Node for analysis. Randomness always comes from a seeded
 * `Rng`, so a recipe + seed renders the same samples every time.
 */

export type Rng = () => number

/** Mulberry32: small, fast, good enough for audio jitter. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform in [lo, hi). */
export function range(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng()
}

export function samples(seconds: number, sr: number): Float32Array {
  return new Float32Array(Math.max(1, Math.ceil(seconds * sr)))
}

/** A value fixed for the whole sound, or a function of time in seconds. */
export type Param = number | ((t: number) => number)

function paramFn(p: Param): (t: number) => number {
  return typeof p === 'number' ? () => p : p
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

export function whiteNoise(n: number, rng: Rng): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1
  return out
}

/** Pink-ish noise (Paul Kellet's economy filter), roughly unit peak. */
export function pinkNoise(n: number, rng: Rng): Float32Array {
  const out = new Float32Array(n)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
  }
  return out
}

/** Brown (random-walk) noise, roughly unit peak. */
export function brownNoise(n: number, rng: Rng): Float32Array {
  const out = new Float32Array(n)
  let last = 0
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rng() * 2 - 1)) / 1.02
    out[i] = last * 3.5
  }
  return out
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type FilterType = 'lowpass' | 'highpass' | 'bandpass'

/**
 * RBJ biquad, in place. `freq` may vary over time (coefficients are updated
 * every 32 samples). Bandpass is the constant 0 dB peak variant.
 */
export function biquad(
  buf: Float32Array,
  sr: number,
  type: FilterType,
  freq: Param,
  q = 0.707,
): Float32Array {
  const f = paramFn(freq)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let a1 = 0
  let a2 = 0
  const nyquist = sr * 0.49
  for (let i = 0; i < buf.length; i++) {
    if ((i & 31) === 0) {
      const fc = Math.min(nyquist, Math.max(10, f(i / sr)))
      const w0 = (2 * Math.PI * fc) / sr
      const cos = Math.cos(w0)
      const alpha = Math.sin(w0) / (2 * q)
      const a0 = 1 + alpha
      if (type === 'lowpass') {
        b0 = (1 - cos) / 2 / a0
        b1 = (1 - cos) / a0
        b2 = b0
      } else if (type === 'highpass') {
        b0 = (1 + cos) / 2 / a0
        b1 = -(1 + cos) / a0
        b2 = b0
      } else {
        b0 = alpha / a0
        b1 = 0
        b2 = -alpha / a0
      }
      a1 = (-2 * cos) / a0
      a2 = (1 - alpha) / a0
    }
    const x = buf[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    buf[i] = y
  }
  return buf
}

/** One-pole lowpass, in place (gentle tilt, no resonance). */
export function onePole(buf: Float32Array, sr: number, freq: number): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * freq) / sr)
  let y = 0
  for (let i = 0; i < buf.length; i++) {
    y += k * (buf[i] - y)
    buf[i] = y
  }
  return buf
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

/** Multiply in place by env(t seconds). */
export function envelope(buf: Float32Array, sr: number, env: (t: number) => number): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i] *= env(i / sr)
  return buf
}

/** Linear attack, then exponential decay with time constant `tau`. */
export function adEnv(attack: number, tau: number): (t: number) => number {
  return (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / tau))
}

/** Rise over `attack`, hold, then fall over `release` ending at `length` (smooth cosine ramps). */
export function swellEnv(attack: number, length: number, release: number): (t: number) => number {
  return (t) => {
    if (t <= 0 || t >= length) return 0
    if (t < attack) return 0.5 - 0.5 * Math.cos((Math.PI * t) / attack)
    const toEnd = length - t
    if (toEnd < release) return 0.5 - 0.5 * Math.cos((Math.PI * toEnd) / release)
    return 1
  }
}

// ---------------------------------------------------------------------------
// Oscillators and resonators
// ---------------------------------------------------------------------------

/** Add a sine with time-varying frequency/amplitude into `buf`, starting at `start` seconds. */
export function addSine(
  buf: Float32Array,
  sr: number,
  freq: Param,
  amp: Param,
  start = 0,
  duration = Infinity,
): void {
  const f = paramFn(freq)
  const a = paramFn(amp)
  const i0 = Math.max(0, Math.floor(start * sr))
  const i1 = Math.min(buf.length, duration === Infinity ? buf.length : Math.ceil((start + duration) * sr))
  let phase = 0
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / sr
    phase += (2 * Math.PI * f(t)) / sr
    buf[i] += Math.sin(phase) * a(t)
  }
}

/** A damped sinusoid: one vibrating mode of a struck body. */
export interface Mode {
  freq: number
  amp: number
  /** Exponential decay time constant in seconds. */
  decay: number
}

/**
 * Add struck modes (modal synthesis) starting at `start` seconds. Uses a
 * rotating phasor per mode, so long bell tails stay cheap.
 */
export function addModes(buf: Float32Array, sr: number, modes: readonly Mode[], start = 0, attack = 0.0015): void {
  const i0 = Math.max(0, Math.floor(start * sr))
  const attackSamples = Math.max(1, attack * sr)
  for (const mode of modes) {
    if (mode.freq >= sr * 0.48 || mode.amp === 0) continue
    const w = (2 * Math.PI * mode.freq) / sr
    const cosW = Math.cos(w)
    const sinW = Math.sin(w)
    const damp = Math.exp(-1 / (mode.decay * sr))
    let re = 1
    let im = 0
    let amp = mode.amp
    // Stop once the mode is inaudible (-80 dB).
    const end = Math.min(buf.length, i0 + Math.ceil(mode.decay * sr * 9.2))
    for (let i = i0; i < end; i++) {
      const k = i - i0
      const env = k < attackSamples ? k / attackSamples : 1
      buf[i] += im * amp * env
      const nre = re * cosW - im * sinW
      im = re * sinW + im * cosW
      re = nre
      amp *= damp
    }
  }
}

/**
 * Many damped modes at random, log-spread frequencies in [lo, hi]: the body
 * of a struck irregular object (a wooden log, a dented plate, a bone). With
 * enough modes and short decays no single pitch stands out - it reads as a
 * material "knock" rather than a tuned "bing". Higher modes die faster.
 */
export function addDenseModes(
  buf: Float32Array,
  sr: number,
  rng: Rng,
  opts: { count: number; lo: number; hi: number; decay: number; amp: number; start?: number; tilt?: number },
): void {
  const modes: Mode[] = []
  const tilt = opts.tilt ?? 0.5
  for (let i = 0; i < opts.count; i++) {
    const freq = opts.lo * Math.pow(opts.hi / opts.lo, rng())
    const rel = freq / opts.lo
    modes.push({
      freq,
      amp: (opts.amp * (0.35 + 0.65 * rng())) / Math.pow(rel, tilt * 0.5),
      decay: opts.decay * (0.6 + 0.8 * rng()) / Math.pow(rel, tilt),
    })
  }
  addModes(buf, sr, modes, opts.start ?? 0, 0.0006)
}

/** A short noise burst (filtered), added at `start`: the scrape/crack component of an impact. */
export function addNoiseBurst(
  buf: Float32Array,
  sr: number,
  rng: Rng,
  opts: {
    start?: number
    duration: number
    amp: number
    type?: FilterType
    freq?: Param
    q?: number
    attack?: number
    tau?: number
    color?: 'white' | 'pink' | 'brown'
  },
): void {
  const start = opts.start ?? 0
  const n = Math.ceil(opts.duration * sr)
  const noise =
    opts.color === 'pink' ? pinkNoise(n, rng) : opts.color === 'brown' ? brownNoise(n, rng) : whiteNoise(n, rng)
  if (opts.freq !== undefined) biquad(noise, sr, opts.type ?? 'bandpass', opts.freq, opts.q ?? 1)
  const env = adEnv(opts.attack ?? 0.001, opts.tau ?? opts.duration / 4)
  const i0 = Math.floor(start * sr)
  for (let k = 0; k < n && i0 + k < buf.length; k++) {
    if (i0 + k < 0) continue
    buf[i0 + k] += noise[k] * env(k / sr) * opts.amp
  }
}

/**
 * Granular crumble: `count` tiny filtered noise grains scattered over
 * `spread` seconds with decaying density. The texture of sand, gravel,
 * dirt and breaking stone.
 */
export function addGrains(
  buf: Float32Array,
  sr: number,
  rng: Rng,
  opts: {
    count: number
    start?: number
    spread: number
    grainLength: [number, number]
    freq: [number, number]
    q?: number
    amp: number
    /** Exponent bunching grains toward the start (1 = uniform, 2+ = front-loaded). */
    bunch?: number
    type?: FilterType
  },
): void {
  const start = opts.start ?? 0
  for (let g = 0; g < opts.count; g++) {
    const at = start + Math.pow(rng(), opts.bunch ?? 1.6) * opts.spread
    const len = range(rng, opts.grainLength[0], opts.grainLength[1])
    const freq = range(rng, opts.freq[0], opts.freq[1])
    // Later grains are quieter: the crumble settles.
    const fade = 1 - 0.6 * ((at - start) / Math.max(1e-6, opts.spread))
    addNoiseBurst(buf, sr, rng, {
      start: at,
      duration: len,
      amp: opts.amp * fade * range(rng, 0.35, 1),
      type: opts.type ?? 'bandpass',
      freq,
      q: opts.q ?? 1.4,
      attack: 0.0008,
      tau: len / 3,
    })
  }
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

/** Scale so the peak sample is `peak`. Silent buffers are left alone. */
export function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let max = 0
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]))
  if (max > 1e-9) {
    const k = peak / max
    for (let i = 0; i < buf.length; i++) buf[i] *= k
  }
  return buf
}

/** Short fades at both ends so playback never clicks. */
export function fadeEdges(buf: Float32Array, sr: number, fadeIn = 0.0008, fadeOut = 0.006): Float32Array {
  const nIn = Math.min(buf.length, Math.ceil(fadeIn * sr))
  for (let i = 0; i < nIn; i++) buf[i] *= i / nIn
  const nOut = Math.min(buf.length, Math.ceil(fadeOut * sr))
  for (let i = 0; i < nOut; i++) buf[buf.length - 1 - i] *= i / nOut
  return buf
}

/** Drop the inaudible tail (below `threshold` of peak), keeping a short fade. */
export function trimTail(buf: Float32Array, sr: number, threshold = 0.0015): Float32Array {
  let max = 0
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]))
  const limit = max * threshold
  let end = buf.length
  while (end > 1 && Math.abs(buf[end - 1]) < limit) end--
  end = Math.min(buf.length, end + Math.ceil(0.01 * sr))
  return fadeEdges(buf.slice(0, end), sr, 0.0004, 0.008)
}

/** Soft saturation, in place: rounds transients a little (and adds warmth when driven). */
export function softClip(buf: Float32Array, drive = 1): Float32Array {
  const norm = Math.tanh(drive)
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / norm
  return buf
}

/** Mix `src` into `dst` at `start` seconds, scaled by `gain`. */
export function mixInto(dst: Float32Array, src: Float32Array, sr: number, start = 0, gain = 1): void {
  const i0 = Math.floor(start * sr)
  for (let k = 0; k < src.length && i0 + k < dst.length; k++) {
    if (i0 + k >= 0) dst[i0 + k] += src[k] * gain
  }
}

/** Root-mean-square level of a buffer (analysis/tests). */
export function rms(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / Math.max(1, buf.length))
}
