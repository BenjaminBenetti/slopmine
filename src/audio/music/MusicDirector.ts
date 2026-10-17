/**
 * Decides when music plays and in which mood - the score is mostly silence.
 *
 * - Surface and Hell: a piece every few minutes (first one ~half a minute in),
 *   long rests between pieces (the mood's `rest`). Crossing into another
 *   family (surface ↔ a Hell biome) fades the current piece out and starts
 *   the new place's music after a short gap.
 * - Inside a castle: the dungeon mood, with shorter rests.
 * - A guardian fight: the boss mood at once, for as long as the fight lasts,
 *   then a rest.
 */

import type { AudioEngine } from '../AudioEngine.ts'
import { RenderPriority } from '../AudioSynthClient.ts'
import type { SoundBank } from '../SoundBank.ts'
import type { InstrumentId } from '../synth/instruments.ts'
import { MOODS, type MoodDef, type MusicMood } from './MusicMoods.ts'
import { loudnessGain, moodSampleKeys, MusicPiece, NOTE_SAMPLE_RATE, type NoteSample, type NoteSource } from './MusicPlayer.ts'

export interface MusicContext {
  /** False while loading or dead: nothing new starts. */
  active: boolean
  layer: 0 | 1
  biome: string
  /** Surface layer, out of sight of the sky. */
  underground: boolean
  inDungeon: boolean
  bossEngaged: boolean
}

type Family = 'surface' | 'dungeon' | 'boss' | `hell:${string}`

const HELL_MOODS: Record<string, MusicMood> = {
  hell: 'molten',
  ossuary: 'ossuary',
  'ember-grove': 'embergrove',
  'crystal-abyss': 'crystal',
  cocytus: 'cocytus',
}

/** Surface mood weights per biome: [meadow, drift, dusk]. */
const SURFACE_WEIGHTS: Record<string, [number, number, number]> = {
  plains: [0.5, 0.35, 0.15],
  'grassy-hills': [0.5, 0.35, 0.15],
  'pine-forest': [0.35, 0.4, 0.25],
  'coastal-rainforest': [0.3, 0.5, 0.2],
  jungle: [0.35, 0.45, 0.2],
  desert: [0.25, 0.35, 0.4],
  swamp: [0.1, 0.3, 0.6],
  volcanic: [0.05, 0.2, 0.75],
}

const FIRST_PIECE_DELAY: [number, number] = [20, 40]

/** Note samples rendered for the moods played so far. */
class NoteSampleCache implements NoteSource {
  private readonly samples = new Map<string, NoteSample>()
  private readonly pending = new Map<string, Promise<void>>()

  constructor(private readonly bank: SoundBank) {}

  get(instrument: InstrumentId, baseMidi: number): NoteSample | null {
    return this.samples.get(`${instrument}:${baseMidi}`) ?? null
  }

  prepare(mood: MoodDef, priority: RenderPriority): Promise<void> {
    return Promise.all(moodSampleKeys(mood).map(([instrument, midi]) => this.load(instrument, midi, priority))).then(() => undefined)
  }

  private load(instrument: InstrumentId, midi: number, priority: RenderPriority): Promise<void> {
    const key = `${instrument}:${midi}`
    if (this.samples.has(key)) return Promise.resolve()
    const existing = this.pending.get(key)
    if (existing) return existing
    const promise = this.bank
      .renderRaw(`note.${instrument}.${midi}`, 0, NOTE_SAMPLE_RATE, priority)
      .then((raw) => {
        this.samples.set(key, { buffer: raw.buffer, gain: loudnessGain(instrument, raw.loudnessDb) })
      })
      .catch((error) => console.warn(`[Audio] note ${key} failed:`, error))
      .finally(() => this.pending.delete(key))
    this.pending.set(key, promise)
    return promise
  }
}

export class MusicDirector {
  private readonly notes: NoteSampleCache
  private current: { piece: MusicPiece; family: Family; mood: MusicMood } | null = null
  private nextStartAt: number | null = null
  private starting = false
  private lastSurfaceMood: MusicMood | null = null
  private seed = Math.floor(Math.random() * 1e9)
  private warmedHell = false

  constructor(
    private readonly engine: AudioEngine,
    bank: SoundBank,
  ) {
    this.notes = new NoteSampleCache(bank)
  }

  /** Call a few times per second. */
  update(ctx: MusicContext): void {
    if (!this.engine.isRunning) return
    const now = this.engine.currentTime
    if (this.nextStartAt === null) this.nextStartAt = now + range(FIRST_PIECE_DELAY)
    if (ctx.layer === 0 && !this.warmedHell) {
      // Render the castle and fight samples ahead of time, so a boss fight never starts silent.
      this.warmedHell = true
      void this.notes.prepare(MOODS.dungeon, RenderPriority.BACKGROUND)
      void this.notes.prepare(MOODS.boss, RenderPriority.BACKGROUND)
    }

    const wanted: Family = ctx.bossEngaged ? 'boss' : ctx.inDungeon ? 'dungeon' : ctx.layer === 0 ? `hell:${ctx.biome}` : 'surface'
    const current = this.current

    if (current && current.family !== wanted) {
      if (wanted === 'boss') {
        this.stopCurrent(2.5)
        this.nextStartAt = now
      } else if (current.family === 'boss') {
        this.stopCurrent(5)
        this.nextStartAt = now + range(MOODS.boss.rest)
      } else {
        this.stopCurrent(6)
        this.nextStartAt = now + (wanted === 'dungeon' ? range([4, 8]) : range([10, 18]))
      }
    }

    if (!this.current && !this.starting && (ctx.active || wanted === 'boss') && now >= (this.nextStartAt ?? Infinity)) {
      void this.startPiece(wanted, ctx)
    }
  }

  /** Fade everything out (e.g. on death). */
  silence(fadeSeconds: number, restSeconds: number): void {
    this.stopCurrent(fadeSeconds)
    this.nextStartAt = this.engine.currentTime + restSeconds
  }

  private stopCurrent(fade: number): void {
    this.current?.piece.stop(fade)
    this.current = null
  }

  private async startPiece(family: Family, ctx: MusicContext): Promise<void> {
    this.starting = true
    try {
      const moodId = this.chooseMood(family, ctx)
      const mood = MOODS[moodId]
      await this.notes.prepare(mood, family === 'boss' ? RenderPriority.URGENT : RenderPriority.NORMAL)
      if (this.current) return
      const engine = this.engine
      const lengthSeconds = range(mood.length)
      const piece = new MusicPiece(
        engine.context,
        engine.input('music'),
        this.notes,
        {
          mood,
          seed: this.seed++,
          lengthSeconds,
          onEnded: () => {
            if (this.current?.piece === piece) {
              this.current = null
              this.nextStartAt = this.engine.currentTime + range(mood.rest)
            }
          },
        },
        engine.currentTime + 0.1,
      )
      engine.setMusicReverb(mood.reverb)
      piece.start()
      this.current = { piece, family, mood: moodId }
      if (family === 'surface' && moodId !== 'cave') this.lastSurfaceMood = moodId
    } finally {
      this.starting = false
    }
  }

  private chooseMood(family: Family, ctx: MusicContext): MusicMood {
    if (family === 'boss') return 'boss'
    if (family === 'dungeon') return 'dungeon'
    if (family !== 'surface') return HELL_MOODS[family.slice(5)] ?? 'molten'
    if (ctx.underground) return 'cave'
    const weights = [...(SURFACE_WEIGHTS[ctx.biome] ?? [0.4, 0.4, 0.2])]
    const moods: MusicMood[] = ['meadow', 'drift', 'dusk']
    // Avoid the same surface mood twice in a row.
    const lastIdx = this.lastSurfaceMood ? moods.indexOf(this.lastSurfaceMood) : -1
    if (lastIdx >= 0) weights[lastIdx] *= 0.25
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < moods.length; i++) {
      r -= weights[i]
      if (r <= 0) return moods[i]
    }
    return 'meadow'
  }
}

function range([lo, hi]: readonly [number, number]): number {
  return lo + Math.random() * (hi - lo)
}
