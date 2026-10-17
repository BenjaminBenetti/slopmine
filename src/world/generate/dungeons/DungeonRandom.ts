/**
 * Deterministic randomness for procedural dungeons: integer hashes of
 * positions (pure, seam-safe) and a small seeded PRNG for layout growth and
 * per-module builders. Everything is a pure function of its inputs, so every
 * worker (and the main thread) computes the same castle.
 */

/** 32-bit integer hash of up to four integers. */
export function hashInts(a: number, b: number, c = 0, d = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1013904223) ^ Math.imul(d | 0, 1610612741)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return h >>> 0
}

/** Deterministic [0, 1) hash of a 3D position + salt. */
export function hash01(x: number, y: number, z: number, salt = 0): number {
  return hashInts(x, Math.imul(y | 0, 31) ^ (z | 0), Math.imul(z | 0, 2654435761) ^ salt, salt) / 4294967296
}

/** Stable 32-bit hash of a string (kit ids, material names). */
export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Seeded PRNG (mulberry32). Same seed, same sequence, in every worker. */
export class DungeonRng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** [0, 1) */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** A random element (undefined for an empty array). */
  pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[Math.floor(this.next() * items.length)]
  }

  /** Fisher-Yates shuffle in place; returns the array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const tmp = items[i]
      items[i] = items[j]
      items[j] = tmp
    }
    return items
  }

  /**
   * Items in a weighted random order (weighted sampling without
   * replacement); items with weight <= 0 are dropped.
   */
  weightedOrder<T>(items: readonly T[], weight: (item: T) => number): T[] {
    const keyed: Array<{ item: T; key: number }> = []
    for (const item of items) {
      const w = weight(item)
      if (!(w > 0)) continue
      // Efraimidis-Spirakis: key = u^(1/w), larger first
      keyed.push({ item, key: Math.pow(Math.max(this.next(), 1e-12), 1 / w) })
    }
    keyed.sort((a, b) => b.key - a.key)
    return keyed.map((entry) => entry.item)
  }
}
