/**
 * Music moods: the harmonic world, tempo, instrumentation and pacing of the
 * generative score for each place in the game. The composer (Composer.ts)
 * writes a fresh piece from a mood every time; the director
 * (MusicDirector.ts) decides which mood plays when.
 *
 * Pitches are MIDI numbers. Progressions are chord roots as scale degrees
 * (0 = tonic), one chord per `beatsPerChord` beats.
 */

import type { InstrumentId } from '../synth/instruments.ts'

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
} as const

export type PadStyle = 'warm' | 'dark' | 'cold' | 'glass' | 'choir'
export type HarmonyStyle = 'broken' | 'sparse' | 'block' | 'arp' | 'ostinato'

export type MusicMood =
  | 'meadow'
  | 'drift'
  | 'dusk'
  | 'cave'
  | 'molten'
  | 'ossuary'
  | 'embergrove'
  | 'crystal'
  | 'cocytus'
  | 'dungeon'
  | 'boss'

export interface MoodDef {
  readonly tonic: number
  readonly scale: readonly number[]
  readonly bpm: number
  readonly beatsPerChord: number
  readonly progressions: readonly (readonly number[])[]
  /** Melody: instrument, MIDI range, how often a span carries melody (0-1), level. */
  readonly lead: { instrument: InstrumentId; range: [number, number]; density: number; velocity: number } | null
  readonly harmony: { instrument: InstrumentId; style: HarmonyStyle; range: [number, number]; velocity: number } | null
  readonly pad: { style: PadStyle; level: number; center: number } | null
  /** Low sustained tonic under everything. */
  readonly drone?: { midi: number; level: number }
  /** Soft drum hits at these beats of every chord span. */
  readonly pulse?: { beats: readonly number[]; level: number }
  /** Muted ticks every `every` beats. */
  readonly ticks?: { every: number; level: number }
  /** Music reverb send (0-1). */
  readonly reverb: number
  /** Piece length range, seconds (Infinity = until the director stops it). */
  readonly length: [number, number]
  /** Silence after a piece, seconds. */
  readonly rest: [number, number]
}

export const MOODS: Record<MusicMood, MoodDef> = {
  // Surface: bright, unhurried felt piano.
  meadow: {
    tonic: 50,
    scale: SCALES.major,
    bpm: 66,
    beatsPerChord: 8,
    progressions: [
      [0, 4, 5, 3],
      [0, 5, 3, 4],
      [5, 3, 0, 4],
      [0, 2, 3, 0],
    ],
    lead: { instrument: 'piano', range: [62, 81], density: 0.6, velocity: 0.75 },
    harmony: { instrument: 'piano', style: 'broken', range: [41, 62], velocity: 0.5 },
    pad: { style: 'warm', level: 0.5, center: 57 },
    reverb: 0.38,
    length: [100, 150],
    rest: [70, 160],
  },
  // Surface: dreamy lydian plucks over slow bells.
  drift: {
    tonic: 53,
    scale: SCALES.lydian,
    bpm: 58,
    beatsPerChord: 8,
    progressions: [
      [0, 1, 0, 4],
      [0, 1, 5, 4],
      [3, 1, 0, 0],
    ],
    lead: { instrument: 'pluck', range: [65, 84], density: 0.5, velocity: 0.7 },
    harmony: { instrument: 'bell', style: 'sparse', range: [57, 74], velocity: 0.35 },
    pad: { style: 'warm', level: 0.55, center: 58 },
    reverb: 0.45,
    length: [90, 140],
    rest: [70, 160],
  },
  // Surface (volcanic, swamp, evening-coloured places): wistful aeolian.
  dusk: {
    tonic: 45,
    scale: SCALES.minor,
    bpm: 60,
    beatsPerChord: 8,
    progressions: [
      [0, 5, 2, 6],
      [0, 3, 5, 4],
      [0, 6, 5, 6],
    ],
    lead: { instrument: 'piano', range: [60, 79], density: 0.45, velocity: 0.7 },
    harmony: { instrument: 'piano', style: 'broken', range: [40, 60], velocity: 0.45 },
    pad: { style: 'dark', level: 0.55, center: 55 },
    reverb: 0.42,
    length: [90, 140],
    rest: [70, 160],
  },
  // Surface layer, deep underground: drips of bell over a dark bed.
  cave: {
    tonic: 45,
    scale: SCALES.minor,
    bpm: 52,
    beatsPerChord: 8,
    progressions: [
      [0, 5, 0, 3],
      [0, 6, 5, 4],
    ],
    lead: { instrument: 'bell', range: [69, 88], density: 0.3, velocity: 0.5 },
    harmony: { instrument: 'piano', style: 'sparse', range: [38, 57], velocity: 0.45 },
    pad: { style: 'dark', level: 0.6, center: 52 },
    drone: { midi: 33, level: 0.35 },
    reverb: 0.55,
    length: [80, 120],
    rest: [60, 140],
  },
  // Molten Wastes: low phrygian piano over a smouldering drone.
  molten: {
    tonic: 40,
    scale: SCALES.phrygian,
    bpm: 50,
    beatsPerChord: 8,
    progressions: [
      [0, 1, 0, 6],
      [0, 5, 1, 0],
      [0, 3, 1, 0],
    ],
    lead: { instrument: 'piano', range: [52, 72], density: 0.35, velocity: 0.6 },
    harmony: { instrument: 'piano', style: 'block', range: [36, 52], velocity: 0.45 },
    pad: { style: 'dark', level: 0.6, center: 50 },
    drone: { midi: 28, level: 0.45 },
    reverb: 0.5,
    length: [90, 130],
    rest: [50, 120],
  },
  // The Ossuary: glassy bells and a hollow choir, harmonic minor.
  ossuary: {
    tonic: 50,
    scale: SCALES.harmonicMinor,
    bpm: 48,
    beatsPerChord: 8,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 4, 0],
      [0, 5, 1, 4],
    ],
    lead: { instrument: 'bell', range: [69, 86], density: 0.35, velocity: 0.55 },
    harmony: { instrument: 'piano', style: 'broken', range: [43, 62], velocity: 0.38 },
    pad: { style: 'choir', level: 0.55, center: 57 },
    reverb: 0.58,
    length: [90, 130],
    rest: [50, 120],
  },
  // Ember Grove: organic dorian plucks, warm and curious.
  embergrove: {
    tonic: 43,
    scale: SCALES.dorian,
    bpm: 70,
    beatsPerChord: 8,
    progressions: [
      [0, 3, 0, 6],
      [0, 6, 3, 4],
      [0, 1, 3, 0],
    ],
    lead: { instrument: 'pluck', range: [62, 81], density: 0.55, velocity: 0.65 },
    harmony: { instrument: 'pluck', style: 'arp', range: [50, 69], velocity: 0.32 },
    pad: { style: 'warm', level: 0.45, center: 55 },
    reverb: 0.45,
    length: [90, 140],
    rest: [50, 120],
  },
  // Crystal Abyss: celesta arpeggios, lydian shimmer.
  crystal: {
    tonic: 47,
    scale: SCALES.lydian,
    bpm: 58,
    beatsPerChord: 8,
    progressions: [
      [0, 1, 0, 4],
      [0, 4, 1, 5],
      [5, 1, 0, 0],
    ],
    lead: { instrument: 'bell', range: [71, 91], density: 0.45, velocity: 0.5 },
    harmony: { instrument: 'bell', style: 'arp', range: [59, 78], velocity: 0.25 },
    pad: { style: 'glass', level: 0.5, center: 59 },
    reverb: 0.62,
    length: [90, 130],
    rest: [50, 120],
  },
  // Cocytus: sparse high piano in the cold.
  cocytus: {
    tonic: 42,
    scale: SCALES.minor,
    bpm: 46,
    beatsPerChord: 8,
    progressions: [
      [0, 5, 2, 6],
      [0, 3, 0, 4],
      [5, 6, 0, 0],
    ],
    lead: { instrument: 'piano', range: [66, 86], density: 0.35, velocity: 0.55 },
    harmony: { instrument: 'piano', style: 'sparse', range: [42, 61], velocity: 0.38 },
    pad: { style: 'cold', level: 0.55, center: 60 },
    reverb: 0.62,
    length: [90, 130],
    rest: [50, 120],
  },
  // Inside a castle: low unease, a heartbeat pulse.
  dungeon: {
    tonic: 48,
    scale: SCALES.phrygian,
    bpm: 58,
    beatsPerChord: 8,
    progressions: [
      [0, 1, 0, 1],
      [0, 6, 1, 0],
      [0, 5, 1, 0],
    ],
    lead: { instrument: 'piano', range: [55, 72], density: 0.25, velocity: 0.5 },
    harmony: null,
    pad: { style: 'dark', level: 0.6, center: 52 },
    drone: { midi: 36, level: 0.45 },
    pulse: { beats: [0, 0.75], level: 0.4 },
    reverb: 0.5,
    length: [80, 120],
    rest: [25, 50],
  },
  // A guardian fight: driving but restrained.
  boss: {
    tonic: 50,
    scale: SCALES.harmonicMinor,
    bpm: 100,
    beatsPerChord: 8,
    progressions: [
      [0, 5, 6, 0],
      [0, 3, 4, 0],
      [0, 5, 3, 4],
    ],
    lead: { instrument: 'piano', range: [62, 79], density: 0.4, velocity: 0.6 },
    harmony: { instrument: 'pluck', style: 'ostinato', range: [38, 55], velocity: 0.42 },
    pad: { style: 'dark', level: 0.5, center: 55 },
    pulse: { beats: [0, 1.5, 3, 4, 5.5, 6.5], level: 0.5 },
    ticks: { every: 0.5, level: 0.22 },
    reverb: 0.3,
    length: [Infinity, Infinity],
    rest: [25, 45],
  },
}
