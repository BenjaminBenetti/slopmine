/**
 * Music moods: the harmonic world, tempo, instrumentation and pacing of the
 * generative score for each place in the game. The composer (Composer.ts)
 * writes a fresh piece from a mood every time; the director
 * (MusicDirector.ts) decides which mood plays when - every place has at
 * least two moods with different instruments, so it never settles into one
 * sound.
 *
 * Pitches are MIDI numbers. Progressions are chord roots as scale degrees
 * (0 = tonic), one chord per `beatsPerChord` beats (6 = two bars of 3/4).
 */

import type { InstrumentId } from '../synth/instruments.ts'

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  // Five-note scales: chords stacked on them come out as open fourths and soft triads.
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
} as const

export type PadStyle = 'warm' | 'dark' | 'cold' | 'glass' | 'choir' | 'string' | 'reed' | 'hollow'
export type HarmonyStyle = 'broken' | 'sparse' | 'block' | 'arp' | 'ostinato' | 'alberti' | 'rolled' | 'waltz' | 'pedal'

export type MusicMood =
  | 'meadow'
  | 'drift'
  | 'dusk'
  | 'wander'
  | 'canopy'
  | 'mirage'
  | 'cave'
  | 'deep'
  | 'molten'
  | 'cinder'
  | 'ossuary'
  | 'reliquary'
  | 'embergrove'
  | 'mycelium'
  | 'crystal'
  | 'prism'
  | 'cocytus'
  | 'rime'
  | 'dungeon'
  | 'vigil'
  | 'boss'
  | 'onslaught'

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
  /** Soft drum hits at these beats of every chord span (default instrument: drum). */
  readonly pulse?: { beats: readonly number[]; level: number; instrument?: InstrumentId }
  /** Muted ticks every `every` beats (default instrument: tick). */
  readonly ticks?: { every: number; level: number; instrument?: InstrumentId }
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
      [3, 0, 4, 0],
      [0, 4, 3, 4],
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
      [0, 2, 1, 0],
      [5, 1, 0, 4],
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
      [5, 6, 0, 4],
      [0, 2, 3, 4],
    ],
    lead: { instrument: 'piano', range: [60, 79], density: 0.45, velocity: 0.7 },
    harmony: { instrument: 'piano', style: 'broken', range: [40, 60], velocity: 0.45 },
    pad: { style: 'dark', level: 0.55, center: 55 },
    reverb: 0.42,
    length: [90, 140],
    rest: [70, 160],
  },
  // Surface (plains, hills, forests): a walking folk tune - fingerpicked guitar under an ocarina.
  wander: {
    tonic: 50,
    scale: SCALES.mixolydian,
    bpm: 76,
    beatsPerChord: 8,
    progressions: [
      [0, 6, 3, 0],
      [0, 3, 6, 0],
      [0, 4, 6, 3],
      [3, 0, 6, 4],
    ],
    lead: { instrument: 'flute', range: [62, 81], density: 0.45, velocity: 0.75 },
    harmony: { instrument: 'guitar', style: 'alberti', range: [40, 62], velocity: 0.51 },
    pad: { style: 'warm', level: 0.4, center: 57 },
    reverb: 0.34,
    length: [100, 150],
    rest: [70, 160],
  },
  // Surface (jungle, rainforest): handpan over a marimba ripple and a soft shaker.
  canopy: {
    tonic: 45,
    scale: SCALES.minorPentatonic,
    bpm: 84,
    beatsPerChord: 8,
    progressions: [
      [0, 3, 1, 0],
      [0, 1, 4, 3],
      [4, 3, 0, 0],
      [0, 2, 1, 3],
    ],
    lead: { instrument: 'handpan', range: [57, 76], density: 0.5, velocity: 0.82 },
    harmony: { instrument: 'pluck', style: 'arp', range: [45, 64], velocity: 0.35 },
    pad: { style: 'warm', level: 0.42, center: 55 },
    ticks: { every: 1, level: 0.18, instrument: 'shaker' },
    reverb: 0.4,
    length: [90, 140],
    rest: [70, 160],
  },
  // Surface (desert, volcanic): harp rolls over a reed drone, phrygian dominant - heat shimmer.
  mirage: {
    tonic: 50,
    scale: SCALES.phrygianDominant,
    bpm: 54,
    beatsPerChord: 8,
    progressions: [
      [0, 1, 0, 6],
      [0, 6, 1, 0],
      [0, 3, 1, 0],
      [3, 1, 0, 0],
    ],
    lead: { instrument: 'harp', range: [62, 81], density: 0.45, velocity: 0.72 },
    harmony: { instrument: 'harp', style: 'rolled', range: [43, 62], velocity: 0.47 },
    pad: { style: 'reed', level: 0.44, center: 55 },
    drone: { midi: 38, level: 0.38 },
    reverb: 0.5,
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
      [0, 3, 5, 4],
      [0, 2, 6, 0],
    ],
    lead: { instrument: 'bell', range: [69, 88], density: 0.3, velocity: 0.5 },
    harmony: { instrument: 'piano', style: 'sparse', range: [38, 57], velocity: 0.45 },
    pad: { style: 'dark', level: 0.6, center: 52 },
    drone: { midi: 33, level: 0.35 },
    reverb: 0.55,
    length: [80, 120],
    rest: [60, 140],
  },
  // Surface layer, deep underground: vibraphone drops over a hollow reed, dorian.
  deep: {
    tonic: 43,
    scale: SCALES.dorian,
    bpm: 50,
    beatsPerChord: 8,
    progressions: [
      [0, 3, 0, 4],
      [0, 6, 3, 0],
      [0, 2, 3, 6],
      [0, 4, 3, 0],
    ],
    lead: { instrument: 'vibes', range: [64, 84], density: 0.3, velocity: 0.63 },
    harmony: { instrument: 'rhodes', style: 'sparse', range: [40, 60], velocity: 0.53 },
    pad: { style: 'hollow', level: 0.57, center: 50 },
    drone: { midi: 31, level: 0.42 },
    reverb: 0.6,
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
      [0, 6, 1, 0],
      [0, 2, 1, 0],
    ],
    lead: { instrument: 'piano', range: [52, 72], density: 0.35, velocity: 0.6 },
    harmony: { instrument: 'piano', style: 'block', range: [36, 52], velocity: 0.45 },
    pad: { style: 'dark', level: 0.6, center: 50 },
    drone: { midi: 28, level: 0.45 },
    reverb: 0.5,
    length: [90, 130],
    rest: [50, 120],
  },
  // Molten Wastes: electric piano over a murmuring harp pedal and a distant hand drum.
  cinder: {
    tonic: 38,
    scale: SCALES.phrygianDominant,
    bpm: 56,
    beatsPerChord: 8,
    progressions: [
      [0, 1, 0, 0],
      [0, 6, 1, 0],
      [0, 3, 1, 0],
      [0, 1, 6, 1],
    ],
    lead: { instrument: 'rhodes', range: [55, 74], density: 0.35, velocity: 0.68 },
    harmony: { instrument: 'harp', style: 'pedal', range: [38, 55], velocity: 0.35 },
    pad: { style: 'reed', level: 0.44, center: 50 },
    drone: { midi: 26, level: 0.5 },
    pulse: { beats: [0, 3], level: 0.33, instrument: 'frame' },
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
      [0, 4, 5, 4],
      [5, 3, 4, 0],
    ],
    lead: { instrument: 'bell', range: [69, 86], density: 0.35, velocity: 0.55 },
    harmony: { instrument: 'piano', style: 'broken', range: [43, 62], velocity: 0.38 },
    pad: { style: 'choir', level: 0.55, center: 57 },
    reverb: 0.58,
    length: [90, 130],
    rest: [50, 120],
  },
  // The Ossuary: a music-box waltz over a harp - a lullaby among the bones.
  reliquary: {
    tonic: 52,
    scale: SCALES.harmonicMinor,
    bpm: 66,
    beatsPerChord: 6,
    progressions: [
      [0, 3, 4, 0],
      [0, 5, 3, 4],
      [0, 3, 0, 4],
      [5, 3, 4, 0],
    ],
    lead: { instrument: 'musicbox', range: [72, 91], density: 0.55, velocity: 0.75 },
    harmony: { instrument: 'harp', style: 'waltz', range: [40, 60], velocity: 0.41 },
    pad: { style: 'string', level: 0.48, center: 59 },
    reverb: 0.6,
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
      [0, 2, 3, 0],
      [0, 4, 6, 3],
    ],
    lead: { instrument: 'pluck', range: [62, 81], density: 0.55, velocity: 0.65 },
    harmony: { instrument: 'pluck', style: 'arp', range: [50, 69], velocity: 0.32 },
    pad: { style: 'warm', level: 0.45, center: 55 },
    reverb: 0.45,
    length: [90, 140],
    rest: [50, 120],
  },
  // Ember Grove: an ocarina over rolled handpan and slow strings - spores drifting in the dark.
  mycelium: {
    tonic: 42,
    scale: SCALES.minorPentatonic,
    bpm: 60,
    beatsPerChord: 8,
    progressions: [
      [0, 3, 1, 0],
      [0, 4, 3, 1],
      [1, 0, 3, 0],
      [0, 2, 4, 3],
    ],
    lead: { instrument: 'flute', range: [61, 78], density: 0.4, velocity: 0.73 },
    harmony: { instrument: 'handpan', style: 'rolled', range: [47, 66], velocity: 0.38 },
    pad: { style: 'string', level: 0.42, center: 54 },
    reverb: 0.5,
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
      [0, 2, 1, 0],
      [0, 5, 1, 4],
    ],
    lead: { instrument: 'bell', range: [71, 91], density: 0.45, velocity: 0.5 },
    harmony: { instrument: 'bell', style: 'arp', range: [59, 78], velocity: 0.25 },
    pad: { style: 'glass', level: 0.5, center: 59 },
    reverb: 0.62,
    length: [90, 130],
    rest: [50, 120],
  },
  // Crystal Abyss: vibraphone over harp rolls and a glass pad - light through facets.
  prism: {
    tonic: 49,
    scale: SCALES.majorPentatonic,
    bpm: 52,
    beatsPerChord: 8,
    progressions: [
      [0, 3, 1, 0],
      [0, 4, 3, 2],
      [3, 1, 0, 0],
      [0, 1, 4, 3],
    ],
    lead: { instrument: 'vibes', range: [66, 86], density: 0.4, velocity: 0.5 },
    harmony: { instrument: 'harp', style: 'rolled', range: [54, 73], velocity: 0.3 },
    pad: { style: 'glass', level: 0.45, center: 61 },
    reverb: 0.65,
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
      [0, 2, 6, 5],
      [5, 3, 0, 4],
    ],
    lead: { instrument: 'piano', range: [66, 86], density: 0.35, velocity: 0.55 },
    harmony: { instrument: 'piano', style: 'sparse', range: [42, 61], velocity: 0.38 },
    pad: { style: 'cold', level: 0.55, center: 60 },
    reverb: 0.62,
    length: [90, 130],
    rest: [50, 120],
  },
  // Cocytus: a lone ocarina high over sparse harp and slow strings - wind across the ice.
  rime: {
    tonic: 45,
    scale: SCALES.dorian,
    bpm: 44,
    beatsPerChord: 8,
    progressions: [
      [0, 3, 0, 6],
      [0, 6, 3, 4],
      [0, 2, 3, 0],
      [6, 3, 0, 0],
    ],
    lead: { instrument: 'flute', range: [67, 86], density: 0.32, velocity: 0.65 },
    harmony: { instrument: 'harp', style: 'sparse', range: [43, 62], velocity: 0.44 },
    pad: { style: 'string', level: 0.6, center: 60 },
    reverb: 0.66,
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
      [0, 2, 1, 0],
      [0, 6, 5, 1],
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
  // Inside a castle: a clock in an empty hall - woodblock ticks, low electric piano, a hollow drone.
  vigil: {
    tonic: 45,
    scale: SCALES.harmonicMinor,
    bpm: 54,
    beatsPerChord: 8,
    progressions: [
      [0, 4, 0, 4],
      [0, 5, 4, 0],
      [0, 3, 4, 0],
      [0, 5, 3, 4],
    ],
    lead: { instrument: 'rhodes', range: [52, 70], density: 0.25, velocity: 0.63 },
    harmony: { instrument: 'harp', style: 'sparse', range: [38, 55], velocity: 0.38 },
    pad: { style: 'hollow', level: 0.64, center: 50 },
    drone: { midi: 33, level: 0.49 },
    ticks: { every: 1, level: 0.2, instrument: 'rim' },
    reverb: 0.52,
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
      [0, 4, 5, 4],
      [0, 3, 5, 4],
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
  // A guardian fight: frame drums and a chugging guitar pedal under electric piano, phrygian.
  onslaught: {
    tonic: 45,
    scale: SCALES.phrygian,
    bpm: 112,
    beatsPerChord: 8,
    progressions: [
      [0, 1, 0, 6],
      [0, 6, 5, 1],
      [0, 3, 1, 0],
      [0, 1, 3, 1],
    ],
    lead: { instrument: 'rhodes', range: [60, 77], density: 0.45, velocity: 0.82 },
    harmony: { instrument: 'guitar', style: 'pedal', range: [38, 55], velocity: 0.57 },
    pad: { style: 'reed', level: 0.59, center: 52 },
    pulse: { beats: [0, 0.75, 1.5, 3, 4, 4.75, 5.5, 7], level: 0.59, instrument: 'frame' },
    ticks: { every: 0.5, level: 0.23, instrument: 'shaker' },
    reverb: 0.28,
    length: [Infinity, Infinity],
    rest: [25, 45],
  },
}
