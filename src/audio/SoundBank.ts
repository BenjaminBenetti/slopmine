/**
 * Rendered sound buffers and their playback: variant choice, pitch/level
 * jitter, loudness calibration, voice limits, and cheap spatialization
 * (distance gain + capped stereo pan + far low-pass, computed when a sound
 * starts - every positional sound is short).
 */

import type { AudioEngine } from './AudioEngine.ts'
import { RenderPriority, type AudioSynthClient } from './AudioSynthClient.ts'
import type { PlaySoundOptions, SoundHandle, SoundPosition } from './SoundHooks.ts'
import { getSoundDef, type SoundDef } from './SoundLibrary.ts'

/** Effects render at 32 kHz: plenty of bandwidth for these sounds at 2/3 the memory of 48 kHz. */
export const SFX_SAMPLE_RATE = 32000

const MAX_VOICES = 48
const MAX_PAN = 0.75
/** A play request for a sound still rendering is honoured if the render lands this soon. */
const LATE_PLAY_WINDOW = 0.15
const MAX_CALIBRATION_GAIN = 30
/**
 * A calibrated sound peaks at most this far above its loudness target. The
 * loudness weighting discounts deep bass (as ears do at game volumes), so
 * without a ceiling thumps and booms would get gain that eats headroom and
 * pumps the limiter.
 */
const MAX_PEAK_OVER_LOUDNESS_DB = 15

interface LoadedSound {
  readonly def: SoundDef
  readonly buffers: AudioBuffer[]
  readonly gains: number[]
  lastVariant: number
}

interface Voice {
  readonly id: string
  readonly source: AudioBufferSourceNode
  readonly gain: GainNode
  readonly startedAt: number
  done: boolean
}

export interface RawSound {
  buffer: AudioBuffer
  loudnessDb: number
}

export class SoundBank {
  private readonly loaded = new Map<string, LoadedSound>()
  private readonly loading = new Map<string, Promise<LoadedSound | null>>()
  private readonly failed = new Set<string>()
  private readonly lastStart = new Map<string, number>()
  private readonly voices: Voice[] = []
  private readonly listener = { x: 0, y: 0, z: 0, rightX: 1, rightZ: 0 }

  constructor(
    private readonly engine: AudioEngine,
    private readonly client: AudioSynthClient,
  ) {}

  /** Render sounds in the background (startup set, a creature's voices). */
  preload(ids: readonly string[], priority: RenderPriority = RenderPriority.BACKGROUND): Promise<void> {
    return Promise.all(ids.map((id) => this.ensure(id, priority))).then(() => undefined)
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id)
  }

  /** Render one buffer outside the library (ambience beds, music notes). */
  async renderRaw(recipe: string, seed: number, sampleRate: number, priority: RenderPriority): Promise<RawSound> {
    const result = await this.client.renderRecipe(recipe, seed, sampleRate, priority)
    return { buffer: this.toBuffer(result.channels, sampleRate), loudnessDb: result.loudnessDb }
  }

  toBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
    const buffer = this.engine.context.createBuffer(channels.length, channels[0].length, sampleRate)
    channels.forEach((data, i) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, i))
    return buffer
  }

  setListener(position: SoundPosition, forward: SoundPosition): void {
    this.listener.x = position.x
    this.listener.y = position.y
    this.listener.z = position.z
    // Right = forward × up, in the horizontal plane.
    const len = Math.hypot(forward.x, forward.z)
    if (len > 1e-4) {
      this.listener.rightX = -forward.z / len
      this.listener.rightZ = forward.x / len
    }
  }

  getListenerPosition(): SoundPosition {
    return this.listener
  }

  play(id: string, position: SoundPosition | null, options?: PlaySoundOptions): SoundHandle | null {
    if (!this.engine.isRunning) return null
    const def = getSoundDef(id)
    if (!def) {
      console.warn(`[Audio] unknown sound '${id}'`)
      return null
    }
    const now = this.engine.currentTime
    const last = this.lastStart.get(id)
    if (def.minInterval && last !== undefined && now - last < def.minInterval) return null

    let spatial: { gain: number; pan: number; cutoff: number } | null = null
    if (position) {
      spatial = this.spatialize(def, position)
      if (!spatial) return null
    }

    const sound = this.loaded.get(id)
    if (!sound) {
      if (!this.failed.has(id)) {
        const requested = now
        void this.ensure(id, RenderPriority.URGENT).then((ready) => {
          if (ready && this.engine.currentTime - requested <= LATE_PLAY_WINDOW) this.start(id, ready, spatial, options)
        })
      }
      return null
    }
    return this.start(id, sound, spatial, options)
  }

  private start(
    id: string,
    sound: LoadedSound,
    spatial: { gain: number; pan: number; cutoff: number } | null,
    options: PlaySoundOptions | undefined,
  ): SoundHandle | null {
    const def = sound.def
    const ctx = this.engine.context
    const now = ctx.currentTime
    this.lastStart.set(id, now)

    this.pruneVoices()
    const maxVoices = def.maxVoices ?? 6
    let sameCount = 0
    for (const v of this.voices) if (v.id === id) sameCount++
    if (sameCount >= maxVoices) this.stopVoice(this.voices.find((v) => v.id === id)!, 0.03)
    if (this.voices.length >= MAX_VOICES) this.stopVoice(this.voices[0], 0.03)

    let variant = Math.floor(Math.random() * sound.buffers.length)
    if (sound.buffers.length > 1 && variant === sound.lastVariant) variant = (variant + 1) % sound.buffers.length
    sound.lastVariant = variant

    const source = ctx.createBufferSource()
    source.buffer = sound.buffers[variant]
    const pitchJitter = def.pitch ? (Math.random() * 2 - 1) * def.pitch : 0
    source.playbackRate.value = (options?.pitch ?? 1) * Math.pow(2, pitchJitter / 12)

    const volumeJitterDb = def.volume ? (Math.random() * 2 - 1) * def.volume : 0
    const level = sound.gains[variant] * Math.pow(10, volumeJitterDb / 20) * (options?.volume ?? 1) * (spatial?.gain ?? 1)
    const gain = ctx.createGain()
    gain.gain.value = level

    let tail: AudioNode = gain
    source.connect(gain)
    if (spatial) {
      if (spatial.cutoff < 18000) {
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = spatial.cutoff
        tail.connect(filter)
        tail = filter
      }
      if (Math.abs(spatial.pan) > 0.02 && typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner()
        panner.pan.value = spatial.pan
        tail.connect(panner)
        tail = panner
      }
    }
    tail.connect(this.engine.input(def.bus))

    const voice: Voice = { id, source, gain, startedAt: now, done: false }
    source.onended = () => {
      voice.done = true
      source.disconnect()
      gain.disconnect()
      if (tail !== gain) tail.disconnect()
    }
    source.start(now)
    this.voices.push(voice)
    return { stop: (fade = 0.05) => this.stopVoice(voice, fade) }
  }

  private stopVoice(voice: Voice, fade: number): void {
    if (voice.done) return
    voice.done = true
    const t = this.engine.currentTime
    try {
      voice.gain.gain.cancelScheduledValues(t)
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, t)
      voice.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.005, fade))
      voice.source.stop(t + Math.max(0.005, fade) + 0.01)
    } catch {
      // Already stopped.
    }
  }

  private pruneVoices(): void {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].done) this.voices.splice(i, 1)
  }

  private spatialize(def: SoundDef, p: SoundPosition): { gain: number; pan: number; cutoff: number } | null {
    const dx = p.x - this.listener.x
    const dy = p.y - this.listener.y
    const dz = p.z - this.listener.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const range = def.range ?? 32
    if (distance > range) return null
    const ref = def.ref ?? 4
    // Inverse-distance rolloff, with a fade to silence over the last quarter of the range.
    let gain = distance <= ref ? 1 : ref / (ref + (distance - ref))
    const fadeStart = range * 0.75
    if (distance > fadeStart) gain *= 1 - (distance - fadeStart) / (range - fadeStart)
    const horizontal = Math.hypot(dx, dz)
    const pan = horizontal > 0.5 ? ((dx * this.listener.rightX + dz * this.listener.rightZ) / horizontal) * MAX_PAN * Math.min(1, horizontal / 3) : 0
    const cutoff = distance > 14 ? 18000 * Math.pow(14 / distance, 1.3) : 20000
    return { gain, pan, cutoff }
  }

  private ensure(id: string, priority: RenderPriority): Promise<LoadedSound | null> {
    const loaded = this.loaded.get(id)
    if (loaded) return Promise.resolve(loaded)
    const pending = this.loading.get(id)
    if (pending) return pending
    const def = getSoundDef(id)
    if (!def) return Promise.resolve(null)
    const promise = (async (): Promise<LoadedSound | null> => {
      try {
        const renders = await Promise.all(
          Array.from({ length: def.variants }, (_, i) => this.client.renderRecipe(def.recipe, hashSeed(def.recipe, i), SFX_SAMPLE_RATE, priority)),
        )
        const sound: LoadedSound = {
          def,
          buffers: renders.map((r) => this.toBuffer(r.channels, SFX_SAMPLE_RATE)),
          gains: renders.map((r) => calibrationGain(def.loudness, r.loudnessDb, r.channels[0])),
          lastVariant: -1,
        }
        this.loaded.set(id, sound)
        return sound
      } catch (error) {
        console.warn(`[Audio] failed to render '${id}':`, error)
        this.failed.add(id)
        return null
      } finally {
        this.loading.delete(id)
      }
    })()
    this.loading.set(id, promise)
    return promise
  }
}

function calibrationGain(targetDb: number, measuredDb: number, samples: Float32Array): number {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  const loudnessGain = Math.pow(10, (targetDb - measuredDb) / 20)
  const peakGain = peak > 0 ? Math.pow(10, (targetDb + MAX_PEAK_OVER_LOUDNESS_DB) / 20) / peak : loudnessGain
  return Math.min(MAX_CALIBRATION_GAIN, loudnessGain, peakGain)
}

/** Stable seed per (recipe, variant), so every session renders the same sounds. */
function hashSeed(recipe: string, variant: number): number {
  let h = 2166136261 ^ variant
  for (let i = 0; i < recipe.length; i++) {
    h ^= recipe.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) + variant * 7919
}
