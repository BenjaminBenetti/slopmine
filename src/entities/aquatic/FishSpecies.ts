/**
 * The water's fish (and jellyfish): plain data, one entry per entity type.
 * FishEntity builds every body from it and swims it in schools; setupWater's
 * spawn provider picks species by biome and by where the water is (the open
 * sea or the rivers, lakes and swamps). Entity type ids are persisted by the
 * journal: never rename one.
 */

/** Markings painted on the flanks. */
export type FishMarks = 'none' | 'spots' | 'stripes' | 'band' | 'lateral'

/** Where in the water column a species keeps. */
export type FishDepth = 'shallow' | 'mid' | 'bottom' | 'deep'

export interface FishColors {
  readonly body: number
  readonly back: number
  readonly belly: number
  readonly fin: number
  /** Markings' colour (`marks`). */
  readonly mark?: number
}

export interface FishSpecies {
  /** Entity type (persisted, matched by milestones). */
  readonly type: string
  readonly displayName: string
  readonly shape: 'fish' | 'jelly'
  /** Body size in pixels (1/16 block): nose to tail root, height, width. */
  readonly length: number
  readonly height: number
  readonly width: number
  /** One palette, or several the spawner picks from (reef fish come in colours). */
  readonly colors: readonly FishColors[]
  readonly marks: FishMarks
  /** Whiskers (catfish), a forked tail, a tall dorsal fin. */
  readonly whiskers?: boolean
  readonly forkedTail?: boolean
  readonly tallFin?: boolean
  /** A soft glow that shows after dark (jellyfish), linear RGB. */
  readonly glow?: number
  /** Cruising speed (blocks/s; darting away is ~2.2x). */
  readonly speed: number
  /** Fish in a school, the spawned one included. */
  readonly school: readonly [number, number]
  readonly maxHealth: number
  /** Item id dropped (raw fish), none for minnows. */
  readonly drop?: string
  readonly depth: FishDepth
  /** Water it lives in: 'water' and/or 'swamp_water' (liquid families). */
  readonly waters: readonly string[]
}

export const FISH_SPECIES: readonly FishSpecies[] = [
  {
    type: 'minnow', displayName: 'Minnow', shape: 'fish',
    length: 4, height: 1.6, width: 1,
    colors: [{ body: 0x9ba99f, back: 0x5c6c5f, belly: 0xdde3d8, fin: 0x7e8e83 }],
    marks: 'lateral', speed: 2.6, school: [5, 9], maxHealth: 2, depth: 'shallow', waters: ['water', 'swamp_water'],
  },
  {
    type: 'trout', displayName: 'Trout', shape: 'fish',
    length: 10, height: 3, width: 2.2,
    colors: [{ body: 0x8f9d6c, back: 0x56613f, belly: 0xebe2c8, fin: 0x7c8a58, mark: 0xd88686 }],
    marks: 'lateral', speed: 2.4, school: [1, 3], maxHealth: 4, drop: 'raw_trout', depth: 'mid', waters: ['water'],
  },
  {
    type: 'salmon', displayName: 'Salmon', shape: 'fish',
    length: 12, height: 3.4, width: 2.4,
    colors: [{ body: 0xb94b3d, back: 0x56664a, belly: 0xe4bcab, fin: 0x8c3b31 }],
    marks: 'none', forkedTail: true, speed: 3.0, school: [2, 4], maxHealth: 5, drop: 'raw_salmon', depth: 'mid', waters: ['water'],
  },
  {
    type: 'catfish', displayName: 'Catfish', shape: 'fish',
    length: 12, height: 2.6, width: 3,
    colors: [{ body: 0x6b5b49, back: 0x3f352b, belly: 0xdacdb2, fin: 0x54483a, mark: 0x4a3f33 }],
    marks: 'spots', whiskers: true, speed: 1.6, school: [1, 2], maxHealth: 6, drop: 'raw_catfish', depth: 'bottom', waters: ['swamp_water', 'water'],
  },
  {
    type: 'cod', displayName: 'Cod', shape: 'fish',
    length: 11, height: 3.2, width: 2.4,
    colors: [{ body: 0xb9a98a, back: 0x7b6f59, belly: 0xefe9dd, fin: 0x9b8d71, mark: 0x8a7a5b }],
    marks: 'spots', speed: 2.2, school: [3, 6], maxHealth: 5, drop: 'raw_cod', depth: 'deep', waters: ['water'],
  },
  {
    type: 'reef_fish', displayName: 'Reef Fish', shape: 'fish',
    length: 6, height: 4, width: 1.6,
    colors: [
      { body: 0xf3c72f, back: 0xe0a91e, belly: 0xfbe68a, fin: 0xffe37c }, // sun tang
      { body: 0xf27b23, back: 0xd8601a, belly: 0xffa868, fin: 0x2a1a12, mark: 0xfafafa }, // clown
      { body: 0x3070e2, back: 0x1b3c8c, belly: 0x7aa6f2, fin: 0xffd43b }, // royal blue
      { body: 0x8a4ad8, back: 0x5c2aa0, belly: 0xf2d24a, fin: 0xb98af0 }, // dusk wrasse
    ],
    marks: 'band', tallFin: true, speed: 2.4, school: [2, 5], maxHealth: 2, drop: 'raw_reef_fish', depth: 'shallow', waters: ['water'],
  },
  {
    type: 'jellyfish', displayName: 'Jellyfish', shape: 'jelly',
    length: 7, height: 5, width: 7,
    colors: [{ body: 0xbad7f2, back: 0xd9ecff, belly: 0x9cc4ea, fin: 0x8fb8e6 }],
    marks: 'none', glow: 0x58c8ff, speed: 0.7, school: [1, 3], maxHealth: 3, drop: 'glow_jelly', depth: 'mid', waters: ['water'],
  },
]

export function getFishSpecies(type: string): FishSpecies | undefined {
  return FISH_SPECIES.find((species) => species.type === type)
}
