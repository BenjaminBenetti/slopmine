/**
 * Deterministic integer-avalanche hash of a world position + salt + seed,
 * mapped to [0, 1). Shared by the Ember Grove features and the Sporeheart
 * Hive locator: everything placed from it is a pure function of world
 * coordinates and the seed, so every chunk and sub-chunk (and the main
 * thread) computes identical structures.
 */
export function emberHash01(x: number, z: number, salt: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(z | 0, 668265263) ^
    Math.imul(salt | 0, 1013904223) ^
    Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Same as emberHash01 with a Y component (per-cell decoration rolls). */
export function emberHash3(x: number, y: number, z: number, salt: number, seed: number): number {
  return emberHash01(x + Math.imul(y | 0, 1442695041), z, salt, seed)
}
