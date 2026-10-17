/**
 * The Web Audio graph: one AudioContext, four buses with the user's volumes,
 * an underwater muffle, an environment reverb send for effects, a long hall
 * reverb for music, and a gentle limiter on the master.
 *
 *   sfx voices ──► sfxIn ──► muffle ──┬──────────────► sfx bus ──┐
 *                                     └► envSend ► envReverb ┘    │
 *   ui voices ─────────────────────────────────────► ui bus ─────┤
 *   ambience ──► ambienceMuffle ───────────────────► amb bus ────┼► master ► limiter ► out
 *   music ─────► musicIn ─┬────────────────────────► music bus ──┘
 *                         └► musicSend ► musicReverb ┘
 *
 * The context starts suspended until the first user gesture (browser
 * autoplay rules) and is suspended while the tab is hidden.
 */

import type { AudioSettings, IAudioSettings } from './AudioSettings.ts'

export type AudioBusId = 'sfx' | 'ui' | 'ambience' | 'music'

const OPEN_CUTOFF = 20000
const UNDERWATER_CUTOFF = 550

export class AudioEngine {
  readonly context: AudioContext
  private readonly master: GainNode
  private readonly buses: Record<AudioBusId, GainNode>
  private readonly sfxIn: GainNode
  private readonly muffle: BiquadFilterNode
  private readonly ambienceMuffle: BiquadFilterNode
  private readonly envSend: GainNode
  private readonly envReverb: ConvolverNode
  private readonly musicIn: GainNode
  private readonly musicSend: GainNode
  private readonly musicReverb: ConvolverNode
  private wantsRunning = false
  private disposed = false
  private readonly cleanups: Array<() => void> = []

  /** Null when the browser has no Web Audio. */
  static create(settings: AudioSettings): AudioEngine | null {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      return new AudioEngine(new Ctor({ latencyHint: 'interactive' }), settings)
    } catch (error) {
      console.warn('[Audio] could not create an AudioContext:', error)
      return null
    }
  }

  private constructor(context: AudioContext, settings: AudioSettings) {
    this.context = context
    const ctx = context

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 4
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.25
    limiter.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.connect(limiter)

    const bus = (): GainNode => {
      const g = ctx.createGain()
      g.connect(this.master)
      return g
    }
    this.buses = { sfx: bus(), ui: bus(), ambience: bus(), music: bus() }

    this.muffle = ctx.createBiquadFilter()
    this.muffle.type = 'lowpass'
    this.muffle.frequency.value = OPEN_CUTOFF
    this.muffle.Q.value = 0.5
    this.muffle.connect(this.buses.sfx)
    this.sfxIn = ctx.createGain()
    this.sfxIn.connect(this.muffle)

    this.envSend = ctx.createGain()
    this.envSend.gain.value = 0
    this.envReverb = ctx.createConvolver()
    this.muffle.connect(this.envSend)
    this.envSend.connect(this.envReverb)
    this.envReverb.connect(this.buses.sfx)

    this.ambienceMuffle = ctx.createBiquadFilter()
    this.ambienceMuffle.type = 'lowpass'
    this.ambienceMuffle.frequency.value = OPEN_CUTOFF
    this.ambienceMuffle.Q.value = 0.5
    this.ambienceMuffle.connect(this.buses.ambience)

    this.musicIn = ctx.createGain()
    this.musicIn.connect(this.buses.music)
    this.musicSend = ctx.createGain()
    this.musicSend.gain.value = 0.35
    this.musicReverb = ctx.createConvolver()
    this.musicIn.connect(this.musicSend)
    this.musicSend.connect(this.musicReverb)
    this.musicReverb.connect(this.buses.music)

    this.applyVolumes(settings.snapshot())
    this.cleanups.push(settings.onChange((s) => this.applyVolumes(s)))
    this.installUnlock()
    this.installVisibility()
  }

  get currentTime(): number {
    return this.context.currentTime
  }

  /** True once a gesture unlocked audio and the tab is visible. */
  get isRunning(): boolean {
    return this.context.state === 'running'
  }

  /** Where a voice on `bus` connects. */
  input(bus: AudioBusId): AudioNode {
    switch (bus) {
      case 'sfx':
        return this.sfxIn
      case 'ambience':
        return this.ambienceMuffle
      case 'music':
        return this.musicIn
      case 'ui':
        return this.buses.ui
    }
  }

  /** 0 = clear air, 1 = fully submerged (low-pass on effects and ambience). */
  setMuffled(amount: number): void {
    const a = Math.max(0, Math.min(1, amount))
    const cutoff = OPEN_CUTOFF * Math.pow(UNDERWATER_CUTOFF / OPEN_CUTOFF, a)
    const t = this.context.currentTime
    this.muffle.frequency.setTargetAtTime(cutoff, t, 0.06)
    this.ambienceMuffle.frequency.setTargetAtTime(cutoff, t, 0.06)
  }

  /** Room reverb on effects: 0 = open air, ~0.4 = cavern. */
  setEnvironmentReverb(wet: number): void {
    this.envSend.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), this.context.currentTime, 1.0)
  }

  setMusicReverb(wet: number): void {
    this.musicSend.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), this.context.currentTime, 2.0)
  }

  setImpulseResponses(environment: AudioBuffer, music: AudioBuffer): void {
    this.envReverb.buffer = environment
    this.musicReverb.buffer = music
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const cleanup of this.cleanups) cleanup()
    void this.context.close().catch(() => {})
  }

  private applyVolumes(s: Readonly<IAudioSettings>): void {
    const curve = (v: number): number => Math.pow(Math.max(0, Math.min(100, v)) / 100, 2)
    const t = this.context.currentTime
    this.master.gain.setTargetAtTime(curve(s.master), t, 0.05)
    this.buses.sfx.gain.setTargetAtTime(curve(s.effects), t, 0.05)
    this.buses.ui.gain.setTargetAtTime(curve(s.effects), t, 0.05)
    this.buses.ambience.gain.setTargetAtTime(curve(s.ambience), t, 0.05)
    this.buses.music.gain.setTargetAtTime(curve(s.music), t, 0.05)
  }

  private installUnlock(): void {
    const unlock = (): void => {
      this.wantsRunning = true
      if (document.visibilityState === 'visible' && this.context.state !== 'running') {
        void this.context.resume().catch(() => {})
      }
    }
    const events = ['pointerdown', 'keydown', 'touchend'] as const
    for (const type of events) window.addEventListener(type, unlock, { capture: true, passive: true })
    this.cleanups.push(() => {
      for (const type of events) window.removeEventListener(type, unlock, { capture: true })
    })
  }

  private installVisibility(): void {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        if (this.context.state === 'running') void this.context.suspend().catch(() => {})
      } else if (this.wantsRunning) {
        void this.context.resume().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility))
  }
}
