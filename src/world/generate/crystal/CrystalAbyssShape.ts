import type { SimplexNoise } from '../SimplexNoise.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import { evaluateTerrainConfig } from '../terrain/NoiseEvaluator.ts'
import { BIOME_REGION_SIZE_BLOCKS } from '../caves/CaveBlend.ts'

/**
 * Crystal Abyss terrain shape - pure functions shared by the biome's
 * fillChunk, its worker features and the main-thread Prism Sanctum locator,
 * so every consumer agrees on where the floor is.
 *
 * The biome's (blended) base height is shaped into jagged terraces cut by
 * deep chasms. Both effects fade out toward biome-region borders (pure
 * function of world x/z), so a neighbouring biome blends against the plain
 * blended height and the border stays seamless.
 */

/** Base terrain of the Crystal Abyss (absolute Y; layer 0). */
export const CRYSTAL_ABYSS_TERRAIN: TerrainConfig = {
  layers: [
    {
      type: 'fractal',
      octaves: 3,
      persistence: 0.5,
      scale: 0.008,
      weight: 1.0,
    },
    {
      // Sharp ridges add crags on top of the rolling base
      type: 'ridged',
      octaves: 2,
      persistence: 0.5,
      scale: 0.02,
      weight: 0.45,
      offset: -0.25,
      clampMin: 0,
    },
  ],
  baseHeight: 44,
  heightScale: 20,
  combineMode: 'add',
  absoluteHeight: true,
}

/** Height of one terrace step (blocks). */
export const TERRACE_STEP = 6

/** Chasm floors sit around this Y (± a few blocks). */
export const CHASM_FLOOR_Y = 8

/** Blocks from a region border where terraces/chasms start fading in. */
const EDGE_FADE_START = 12
/** Width of the fade (blocks). */
const EDGE_FADE_WIDTH = 60

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Distance (blocks) from (x, z) to the nearest 512-block biome-region border. */
export function regionEdgeDistance(x: number, z: number): number {
  const px = ((x % BIOME_REGION_SIZE_BLOCKS) + BIOME_REGION_SIZE_BLOCKS) % BIOME_REGION_SIZE_BLOCKS
  const pz = ((z % BIOME_REGION_SIZE_BLOCKS) + BIOME_REGION_SIZE_BLOCKS) % BIOME_REGION_SIZE_BLOCKS
  return Math.min(px, BIOME_REGION_SIZE_BLOCKS - px, pz, BIOME_REGION_SIZE_BLOCKS - pz)
}

/**
 * Chasm depth factor at (x, z): 0 = no chasm, 1 = chasm floor. Chasms are
 * warped ridge lines of a low-frequency noise, gated into segments by a mask
 * so they end (tapering) instead of crossing the whole biome.
 */
export function chasmFactor(noise: SimplexNoise, x: number, z: number): number {
  const mask = noise.noise2D(x * 0.0035 + 51.3, z * 0.0035 - 17.9)
  if (mask <= 0.0) return 0
  const wx = noise.noise2D(x * 0.011 + 700.1, z * 0.011 - 33.3) * 28
  const wz = noise.noise2D(x * 0.011 - 211.7, z * 0.011 + 700.9) * 28
  const ridge = Math.abs(noise.noise2D((x + wx) * 0.0045 + 13.1, (z + wz) * 0.0045 + 77.7))
  const halfWidth = 0.05 * smooth(0.0, 0.22, mask)
  if (ridge >= halfWidth) return 0
  const k = 1 - ridge / halfWidth
  // Steep walls, flat floor
  return smooth(0.0, 0.5, k)
}

/**
 * Final floor height (top solid block Y) of the Crystal Abyss at (x, z).
 *
 * @param base The blended terrain height at (x, z) (the worker's getHeight)
 * @param chasms False to ignore chasms (structure siting)
 */
export function abyssFloorHeight(
  noise: SimplexNoise,
  x: number,
  z: number,
  base: number,
  chasms = true
): number {
  const weight = smooth(EDGE_FADE_START, EDGE_FADE_START + EDGE_FADE_WIDTH, regionEdgeDistance(x, z))
  if (weight <= 0) return base

  // Jagged terraces: irregular edges from a small offset noise, flat treads,
  // steep risers.
  const jag = noise.noise2D(x * 0.07 + 311.7, z * 0.07 - 97.3) * 2.5
  const t = (base + jag) / TERRACE_STEP
  const step = Math.floor(t)
  const frac = t - step
  let shaped = (step + smooth(0.62, 1.0, frac)) * TERRACE_STEP

  if (chasms) {
    const c = chasmFactor(noise, x, z)
    if (c > 0) {
      const floor = CHASM_FLOOR_Y + noise.noise2D(x * 0.05 - 5.5, z * 0.05 + 9.1) * 3
      shaped = shaped + (floor - shaped) * c
    }
  }

  return Math.floor(base + (shaped - base) * weight)
}

/**
 * The Crystal Abyss's own (unblended) floor height, without chasms. Used to
 * site structures so the main-thread locator can compute the same value
 * without the worker's biome blend data.
 */
export function abyssUnblendedFloor(noise: SimplexNoise, x: number, z: number): number {
  const base = Math.floor(evaluateTerrainConfig(noise, CRYSTAL_ABYSS_TERRAIN, x, z, 0))
  return abyssFloorHeight(noise, x, z, base, false)
}

/**
 * Deterministic [0, 1) hash of a 2D position (seeded integer avalanche).
 * Used for every placement decision so all chunk slices agree.
 */
export function hash2(seed: number, x: number, z: number, salt: number): number {
  let h = seed ^ Math.imul(x | 0, 73856093) ^ Math.imul(z | 0, 19349663) ^ Math.imul(salt | 0, 83492791)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Deterministic [0, 1) hash of a 3D position. */
export function hash3(seed: number, x: number, y: number, z: number, salt: number): number {
  let h = seed ^ Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 83492791) ^ Math.imul(z | 0, 19349663) ^ Math.imul(salt | 0, 2654435761)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
