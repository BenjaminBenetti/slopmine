/**
 * Decides when music plays and in which mood - the score is mostly silence.
 * Every place has a pool of moods (two or more); a pick avoids the mood that
 * played last in the same place.
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
  /** Night on the overworld: the calmer, darker surface moods are favoured. */
  night: boolean
}

type Family = 'surface' | 'dungeon' | 'boss' | `hell:${string}`

const HELL_MOODS: Record<string, readonly MusicMood[]> = {
  hell: ['molten', 'cinder'],
  ossuary: ['ossuary', 'reliquary'],
  'ember-grove': ['embergrove', 'mycelium'],
  'crystal-abyss': ['crystal', 'prism'],
  cocytus: ['cocytus', 'rime'],
}
const CAVE_MOODS: readonly MusicMood[] = ['cave', 'deep']
const DUNGEON_MOODS: readonly MusicMood[] = ['dungeon', 'vigil']
const BOSS_MOODS: readonly MusicMood[] = ['boss', 'onslaught']

const SURFACE_MOODS: readonly MusicMood[] = ['meadow', 'drift', 'dusk', 'wander', 'canopy', 'mirage']
/** Surface mood weights per biome, in SURFACE_MOODS order. */
const SURFACE_WEIGHTS: Record<string, readonly number[]> = {
  plains: [0.3, 0.18, 0.07, 0.3, 0.07, 0.08],
  'grassy-hills': [0.28, 0.18, 0.08, 0.3, 0.08, 0.08],
  'pine-forest': [0.2, 0.24, 0.14, 0.24, 0.12, 0.06],
  'coastal-rainforest': [0.16, 0.26, 0.1, 0.14, 0.28, 0.06],
  jungle: [0.14, 0.22, 0.1, 0.1, 0.38, 0.06],
  desert: [0.12, 0.14, 0.18, 0.12, 0.06, 0.38],
  swamp: [0.05, 0.15, 0.35, 0.08, 0.17, 0.2],
  volcanic: [0.03, 0.1, 0.42, 0.05, 0.05, 0.35],
}
const DEFAULT_SURFACE_WEIGHTS = [0.22, 0.2, 0.14, 0.2, 0.12, 0.12]
/** At night, multipliers on the surface weights (SURFACE_MOODS order): less meadow and wander, more drift and dusk. */
const NIGHT_SURFACE_SCALE = [0.3, 1.7, 1.9, 0.35, 1.0, 1.0]

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
  /** The last mood picked from each pool (keyed by the pool's first mood). */
  private readonly lastPicks = new Map<MusicMood, MusicMood>()
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
      for (const id of [...DUNGEON_MOODS, ...BOSS_MOODS]) void this.notes.prepare(MOODS[id], RenderPriority.BACKGROUND)
    }

    const wanted: Family = ctx.bossEngaged ? 'boss' : ctx.inDungeon ? 'dungeon' : ctx.layer === 0 ? `hell:${ctx.biome}` : 'surface'
    const current = this.current

    if (current && current.family !== wanted) {
      if (wanted === 'boss') {
        this.stopCurrent(2.5)
        this.nextStartAt = now
      } else if (current.family === 'boss') {
        this.nextStartAt = now + range(MOODS[current.mood].rest)
        this.stopCurrent(5)
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
    } finally {
      this.starting = false
    }
  }

  private chooseMood(family: Family, ctx: MusicContext): MusicMood {
    if (family === 'boss') return this.pick(BOSS_MOODS)
    if (family === 'dungeon') return this.pick(DUNGEON_MOODS)
    if (family !== 'surface') return this.pick(HELL_MOODS[family.slice(5)] ?? HELL_MOODS.hell)
    if (ctx.underground) return this.pick(CAVE_MOODS)
    const weights = SURFACE_WEIGHTS[ctx.biome] ?? DEFAULT_SURFACE_WEIGHTS
    return this.pick(SURFACE_MOODS, ctx.night ? weights.map((w, i) => w * NIGHT_SURFACE_SCALE[i]) : weights)
  }

  /** A weighted pick from a pool; the pool's last pick is four times less likely. */
  private pick(moods: readonly MusicMood[], weights: readonly number[] = moods.map(() => 1)): MusicMood {
    const last = this.lastPicks.get(moods[0])
    const adjusted = moods.map((mood, i) => (mood === last ? weights[i] * 0.25 : weights[i]))
    const total = adjusted.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let chosen = moods[moods.length - 1]
    for (let i = 0; i < moods.length; i++) {
      r -= adjusted[i]
      if (r <= 0) {
        chosen = moods[i]
        break
      }
    }
    this.lastPicks.set(moods[0], chosen)
    return chosen
  }
}

function range([lo, hi]: readonly [number, number]): number {
  return lo + Math.random() * (hi - lo)
}
