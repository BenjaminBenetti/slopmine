/**
 * Plays composed pieces on Web Audio: struck notes from rendered instrument
 * samples (one sample every 3 semitones, re-pitched at most a semitone),
 * pads and drones from live oscillators. Each piece has its own gain node
 * (fades) and schedules its spans a little ahead on the audio clock.
 *
 * Works on any BaseAudioContext, so a piece can be rendered offline for
 * level checks.
 */

import { Composer, type NoteEvent, type PadEvent } from './Composer.ts'
import type { MoodDef } from './MusicMoods.ts'
import type { InstrumentId } from '../synth/instruments.ts'

/** Notes render at 24 kHz: these instruments have nothing above ~11 kHz. */
export const NOTE_SAMPLE_RATE = 24000

/** Loudness (dBFS, before the music bus) of a velocity-1 note. */
const INSTRUMENT_LOUDNESS: Record<InstrumentId, number> = {
  piano: -21,
  pluck: -23,
  bell: -25,
  drum: -23,
  tick: -30,
}

/** Linear level of one pad oscillator voice at pad level 1. */
const PAD_VOICE_GAIN = 0.042

const LOOKAHEAD_SECONDS = 1.6
const SCHEDULE_INTERVAL_MS = 250
/** Material due longer ago than this is dropped, never played late. */
const MAX_LATENESS = 0.08

export interface NoteSample {
  buffer: AudioBuffer
  /** Calibration gain bringing the sample to INSTRUMENT_LOUDNESS at velocity 1. */
  gain: number
}

/** Provides rendered note samples (see NoteSampleCache). */
export interface NoteSource {
  get(instrument: InstrumentId, baseMidi: number): NoteSample | null
}

/** The rendered sample pitch serving `midi`. */
export function noteSampleMidi(instrument: InstrumentId, midi: number): number {
  if (instrument === 'drum' || instrument === 'tick') return 0
  return 3 * Math.round(midi / 3)
}

export function loudnessGain(instrument: InstrumentId, measuredDb: number): number {
  return Math.min(30, Math.pow(10, (INSTRUMENT_LOUDNESS[instrument] - measuredDb) / 20))
}

/** Every sample a mood can ask for. */
export function moodSampleKeys(mood: MoodDef): Array<[InstrumentId, number]> {
  const keys = new Map<string, [InstrumentId, number]>()
  const add = (instrument: InstrumentId, lo: number, hi: number): void => {
    for (let m = lo - 1; m <= hi + 13; m++) {
      const base = noteSampleMidi(instrument, m)
      keys.set(`${instrument}:${base}`, [instrument, base])
    }
  }
  if (mood.lead) add(mood.lead.instrument, mood.lead.range[0], mood.lead.range[1])
  if (mood.harmony) add(mood.harmony.instrument, mood.harmony.range[0] - 12, mood.harmony.range[1])
  if (mood.pulse) keys.set('drum:0', ['drum', 0])
  if (mood.ticks) keys.set('tick:0', ['tick', 0])
  return [...keys.values()]
}

export interface PieceOptions {
  mood: MoodDef
  seed: number
  lengthSeconds: number
  /** Called once the piece has played out (not when stopped). */
  onEnded?: () => void
}

export class MusicPiece {
  private readonly composer: Composer
  private readonly gain: GainNode
  private nextSpanTime: number
  private timer: ReturnType<typeof setInterval> | null = null
  private finished = false
  private stopped = false
  private readonly liveNodes = new Set<AudioScheduledSourceNode>()

  constructor(
    private readonly context: BaseAudioContext,
    output: AudioNode,
    private readonly notes: NoteSource,
    private readonly options: PieceOptions,
    startTime: number,
  ) {
    this.composer = new Composer(options.mood, options.seed, options.lengthSeconds)
    this.gain = context.createGain()
    this.gain.gain.setValueAtTime(0, startTime)
    this.gain.gain.linearRampToValueAtTime(1, startTime + 2.5)
    this.gain.connect(output)
    this.nextSpanTime = startTime + 0.05
  }

  /** Start scheduling on a timer (realtime contexts). */
  start(): void {
    this.schedule()
    this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS)
  }

  /** Schedule everything up to `until` at once (offline rendering). */
  scheduleUntil(until: number): void {
    this.schedule(until)
  }

  get isStopped(): boolean {
    return this.stopped
  }

  /** Fade out and release every node. */
  stop(fadeSeconds: number): void {
    if (this.stopped) return
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const t = this.context.currentTime
    const g = this.gain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + Math.max(0.05, fadeSeconds))
    const end = t + Math.max(0.05, fadeSeconds) + 0.05
    for (const node of this.liveNodes) {
      try {
        node.stop(end)
      } catch {
        // Already stopped.
      }
    }
    setTimeout(() => this.gain.disconnect(), (fadeSeconds + 0.5) * 1000)
  }

  private schedule(until = this.context.currentTime + LOOKAHEAD_SECONDS): void {
    if (this.stopped || this.finished) return
    const now = this.context.currentTime
    if (this.nextSpanTime < now - MAX_LATENESS) {
      // The main thread stalled past the lookahead: skip the missed music
      // rather than play several spans at once
      this.nextSpanTime = now + 0.05
    }
    while (this.nextSpanTime < until) {
      const span = this.composer.next()
      if (!span) {
        this.finished = true
        if (this.timer) clearInterval(this.timer)
        this.timer = null
        const tailMs = Math.max(0, this.nextSpanTime + 6 - this.context.currentTime) * 1000
        setTimeout(() => {
          if (!this.stopped) {
            this.stopped = true
            this.gain.disconnect()
            this.options.onEnded?.()
          }
        }, tailMs)
        return
      }
      for (const event of span.events) {
        const at = this.nextSpanTime + event.time
        if (event.kind === 'note') this.playNote(event, at)
        else this.playPad(event, at)
      }
      this.nextSpanTime += span.duration
    }
  }

  private playNote(event: NoteEvent, at: number): void {
    const ctx = this.context
    if (at < ctx.currentTime - MAX_LATENESS) return
    const base = noteSampleMidi(event.instrument, event.midi)
    const sample = this.notes.get(event.instrument, base)
    if (!sample) return
    const source = ctx.createBufferSource()
    source.buffer = sample.buffer
    source.playbackRate.value = Math.pow(2, (event.midi - base) / 12)
    const gain = ctx.createGain()
    gain.gain.value = sample.gain * Math.pow(Math.max(0, event.velocity), 1.5)
    source.connect(gain)
    let tail: AudioNode = gain
    if (event.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner()
      panner.pan.value = event.pan
      gain.connect(panner)
      tail = panner
    }
    tail.connect(this.gain)
    this.track(source, () => {
      source.disconnect()
      gain.disconnect()
      if (tail !== gain) tail.disconnect()
    })
    source.start(Math.max(at, ctx.currentTime))
  }

  private playPad(event: PadEvent, at: number): void {
    const ctx = this.context
    const start = Math.max(at, ctx.currentTime)
    const attack = event.style === 'glass' ? 1.2 : 1.8
    const release = 2.4
    const end = start + event.duration
    const peak = PAD_VOICE_GAIN * event.level

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, start)
    env.gain.setTargetAtTime(peak, start, attack / 3)
    env.gain.setTargetAtTime(0, end, release / 4)
    env.connect(this.gain)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.6
    filter.frequency.value = { warm: 950, dark: 520, cold: 2600, glass: 4000, choir: 2400 }[event.style]
    let head: AudioNode = filter
    if (event.style === 'choir') {
      // Two vowel formants ("ah") over the oscillators.
      const merge = ctx.createGain()
      for (const [freq, q] of [
        [720, 4],
        [1150, 5],
      ] as const) {
        const band = ctx.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = freq
        band.Q.value = q
        filter.connect(band)
        band.connect(merge)
      }
      merge.gain.value = 3.2
      merge.connect(env)
      head = filter
    } else {
      filter.connect(env)
    }

    const stopAt = end + release * 2
    const shapes: Array<[OscillatorType, number, number]> = {
      warm: [['sawtooth', -5, 1], ['sawtooth', 5, 1]],
      dark: [['sawtooth', -4, 1], ['triangle', 3, 1.2]],
      cold: [['triangle', -7, 1], ['triangle', 7, 1]],
      glass: [['sine', -3, 1], ['sine', 1200 + 4, 0.35]],
      choir: [['sawtooth', -6, 1], ['sawtooth', 6, 1]],
    }[event.style] as Array<[OscillatorType, number, number]>
    for (const midi of event.midis) {
      const freq = 440 * Math.pow(2, (midi - 69) / 12)
      for (const [type, cents, level] of shapes) {
        const osc = ctx.createOscillator()
        osc.type = type
        osc.frequency.value = freq
        osc.detune.value = cents
        const voiceGain = ctx.createGain()
        voiceGain.gain.value = level
        osc.connect(voiceGain)
        voiceGain.connect(head)
        this.track(osc, () => {
          osc.disconnect()
          voiceGain.disconnect()
        })
        osc.start(start)
        osc.stop(stopAt)
      }
    }
    setTimeout(() => {
      filter.disconnect()
      env.disconnect()
    }, Math.max(0, stopAt - ctx.currentTime + 0.5) * 1000)
  }

  private track(node: AudioScheduledSourceNode, cleanup: () => void): void {
    this.liveNodes.add(node)
    node.onended = () => {
      this.liveNodes.delete(node)
      cleanup()
    }
  }
}
