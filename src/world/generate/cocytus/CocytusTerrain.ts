import type { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Shared, pure shape functions of the Cocytus biome (the frozen lake at the
 * bottom of Hell). Used by the biome generator and its worker features so
 * every feature agrees, column by column and chunk by chunk, where the ice
 * surface is. Everything here is a pure function of world coordinates, the
 * world seed and the seeded world noise - safe in workers and main thread.
 */

/** Biome name (BiomeType) of Cocytus. */
export const COCYTUS_BIOME = 'cocytus'

/**
 * Top Y of the frozen lake: black ice fills every column whose terrain lies
 * below it, up to and including this Y. The same level as Hell's lava sea,
 * so the frozen lake continues the molten one across biome borders.
 */
export const LAKE_LEVEL = 46

/** Tallest pressure ridge above the lake surface. */
export const MAX_RIDGE_HEIGHT = 4

/**
 * Deterministic [0,1) hash of integer coordinates, a salt and the seed
 * (integer avalanche mix; seeded so worlds differ).
 */
export function cocytusHash(seed: number, x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(salt | 0, 1013904223) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Pressure ridge height above the lake surface at a lake column (0 = flat
 * ice). Ridges are long jagged lines where the ice sheet buckled: the zero
 * contours of one noise field, kept where a second, low-frequency field says
 * the ice was under pressure (about half of the lines).
 */
export function ridgeHeightAt(noise: SimplexNoise, seed: number, x: number, z: number): number {
  const line = 1 - Math.abs(noise.noise2D(x * 0.017 + 311.7, z * 0.017 - 97.3))
  if (line < 0.9) return 0
  const pressure = noise.noise2D(x * 0.006 - 53.1, z * 0.006 + 181.9)
  if (pressure < -0.05) return 0
  const strength = Math.min(1, (pressure + 0.05) / 0.45)
  const crest = (line - 0.9) / 0.1 // 0 at the ridge flank, 1 on its spine
  const jag = cocytusHash(seed, x, z, 911) * 1.6 - 0.6
  const h = Math.floor(crest * MAX_RIDGE_HEIGHT * strength + jag)
  return Math.max(0, Math.min(MAX_RIDGE_HEIGHT, h))
}

/**
 * Top solid Y of a Cocytus column from its base terrain height: the lake
 * surface plus any pressure ridge over the lake, the terrain on land.
 * (Thin ash-snow drifts and features on top are not included.)
 */
export function cocytusSurfaceY(noise: SimplexNoise, seed: number, x: number, z: number, baseHeight: number): number {
  if (baseHeight >= LAKE_LEVEL) return baseHeight
  return LAKE_LEVEL + ridgeHeightAt(noise, seed, x, z)
}

/** True where a thin ash-snow drift lies on the flat lake ice. */
export function isIceDriftAt(noise: SimplexNoise, x: number, z: number): boolean {
  const n = noise.noise2D(x * 0.031 + 71.3, z * 0.031 + 29.9) * 0.7 + noise.noise2D(x * 0.11 - 5.5, z * 0.11 + 13.1) * 0.3
  return n > 0.42
}
