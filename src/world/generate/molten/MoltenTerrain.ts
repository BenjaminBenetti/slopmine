import type { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Pure terrain shaping of the Molten Wastes (the `hell` biome), shared by
 * HellGenerator.fillChunk and the biome's worker features so they agree on
 * where the lava rivers run, without generating anything.
 *
 * Everything here is a pure function of world coordinates and the world
 * noise (the same SimplexNoise instance the terrain uses), so every
 * sub-chunk, chunk and worker computes identical answers.
 */

/** Surface of the lava sea (world Y). Lava fills every depression up to it. */
export const MOLTEN_SEA_Y = 46

/** Biome region size in blocks (BiomeRegistry: 16x16 chunks). */
const REGION_SIZE = 512

/**
 * Distance (blocks) from a region border inside which the biome's own
 * terrain shaping (rivers, crusts, rafts) is fully faded out. It covers the
 * border dither band (at most 16 blocks), where a neighbouring biome's fill
 * is mixed into ours block by block.
 */
const EDGE_FADE_START = 18
/** Width (blocks) of the fade from nothing to full strength. */
const EDGE_FADE_WIDTH = 40

/**
 * 0 at a biome-region border (and within EDGE_FADE_START of it), rising
 * smoothly to 1 over EDGE_FADE_WIDTH blocks. Region-local features fade with
 * it so nothing of ours leaks into a neighbouring biome's dithered border.
 */
export function regionEdgeFade(worldX: number, worldZ: number): number {
  const px = ((worldX % REGION_SIZE) + REGION_SIZE) % REGION_SIZE
  const pz = ((worldZ % REGION_SIZE) + REGION_SIZE) % REGION_SIZE
  const d = Math.min(px, REGION_SIZE - 1 - px, pz, REGION_SIZE - 1 - pz)
  const t = (d - EDGE_FADE_START) / EDGE_FADE_WIDTH
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

// River network: zero-crossings of a domain-warped low-frequency noise form
// continuous winding lines; a second, even lower frequency mask removes a
// share of them so the network has gaps and isolated reaches.
const RIVER_SCALE = 0.0032
const RIVER_WARP_SCALE = 0.002
const RIVER_WARP = 40
const RIVER_MASK_SCALE = 0.0011
const RIVER_MASK_MIN = -0.25
const RIVER_BASE_WIDTH = 0.034
const RIVER_WIDTH_VARIATION = 0.018

/**
 * Lava river channel at a column: < 1 inside the channel (0 on its centre
 * line), >= 1 outside. Rivers taper to nothing toward region borders.
 */
export function getRiverChannel(noise: SimplexNoise, worldX: number, worldZ: number): number {
  const fade = regionEdgeFade(worldX, worldZ)
  if (fade <= 0) return Infinity
  const mask = noise.noise2D(worldX * RIVER_MASK_SCALE - 300.5, worldZ * RIVER_MASK_SCALE + 200.25)
  if (mask <= RIVER_MASK_MIN) return Infinity
  const wx = noise.noise2D(worldX * RIVER_WARP_SCALE + 31.7, worldZ * RIVER_WARP_SCALE - 12.1) * RIVER_WARP
  const wz = noise.noise2D(worldX * RIVER_WARP_SCALE - 77.3, worldZ * RIVER_WARP_SCALE + 5.9) * RIVER_WARP
  const n = noise.noise2D((worldX + wx) * RIVER_SCALE + 101.3, (worldZ + wz) * RIVER_SCALE - 55.1)
  // Rivers narrow where the mask fades out and toward region borders
  const maskStrength = Math.min(1, (mask - RIVER_MASK_MIN) / 0.2)
  const width = (RIVER_BASE_WIDTH + RIVER_WIDTH_VARIATION * mask) * fade * maskStrength
  if (width <= 0) return Infinity
  return Math.abs(n) / width
}

/**
 * World Y of the carved lava-river bed at a column of terrain height
 * `height`, or null when the column is not cut by a river. Rivers cut
 * straight-walled canyons through the land down to just below the sea
 * level, and the generator fills them with lava up to MOLTEN_SEA_Y, so they
 * run level with (and drain into) the lava sea.
 */
export function getRiverBedY(noise: SimplexNoise, worldX: number, worldZ: number, height: number): number | null {
  if (height < MOLTEN_SEA_Y - 1) return null // open sea: already lava
  const channel = getRiverChannel(noise, worldX, worldZ)
  if (channel >= 1) return null
  // 1-3 blocks of lava, deepest along the centre line
  return MOLTEN_SEA_Y - 1 - Math.floor(3 * (1 - channel))
}

/** True if a river canyon cuts this column (open air/lava above its bed). */
export function isRiverColumn(noise: SimplexNoise, worldX: number, worldZ: number, height: number): boolean {
  return getRiverBedY(noise, worldX, worldZ, height) !== null
}

/**
 * Obsidian raft on the lava sea above a column of terrain height `height`:
 * 0 = none, 1 = a one-block crust at the sea surface, 2 = two blocks thick.
 * Rafts are cooled crust plates drifting on the deeper sea.
 */
export function getRaftThickness(noise: SimplexNoise, worldX: number, worldZ: number, height: number): number {
  if (height >= MOLTEN_SEA_Y - 2) return 0
  if (regionEdgeFade(worldX, worldZ) < 0.5) return 0
  const raft =
    noise.noise2D(worldX * 0.03 + 13.3, worldZ * 0.03 + 7.7) +
    0.25 * noise.noise2D(worldX * 0.09 - 4.4, worldZ * 0.09 + 8.1)
  if (raft <= 0.55) return 0
  return raft > 0.7 ? 2 : 1
}

/** True if the shore column's top block cools to an obsidian crust. */
export function isShoreCrust(noise: SimplexNoise, worldX: number, worldZ: number, height: number): boolean {
  if (height < MOLTEN_SEA_Y - 1 || height > MOLTEN_SEA_Y + 1) return false
  if (regionEdgeFade(worldX, worldZ) < 0.5) return false
  return noise.noise2D(worldX * 0.08 + 3.1, worldZ * 0.08 - 9.4) > -0.1
}
