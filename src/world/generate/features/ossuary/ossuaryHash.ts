/**
 * Seeded integer hashes for the Ossuary's worldgen features: pure functions
 * of world position + salt + seed, so every chunk/sub-chunk rendering a slice
 * of the same structure (and the main-thread dungeon locator) agrees.
 */

/** Deterministic [0,1) hash of a 2D position. */
export function hash2(x: number, z: number, salt: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(z | 0, 668265263) ^
    Math.imul(salt | 0, 1013904223) ^
    Math.imul(seed | 0, 1610612741)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Deterministic [0,1) hash of a 3D position. */
export function hash3(x: number, y: number, z: number, salt: number, seed: number): number {
  return hash2(x, Math.imul(z | 0, 31) ^ Math.imul(y | 0, 2654435761), salt, seed)
}

/**
 * Max reach of biome-border dithering (DITHER_DISTANCE_BASE +
 * DITHER_VARIANCE in ChunkGenerationWorker): structures keep this far from
 * foreign-biome regions so every slice agrees they exist.
 */
export const BIOME_BORDER_MARGIN = 16

/** Biome lookup by world column (worker: FeatureContext.getBiomeNameAt). */
export type BiomeAt = (worldX: number, worldZ: number) => string

/**
 * True if the square footprint of half-size `radius` around (x, z), widened
 * by the dither margin, lies entirely in regions of biome `owner`. Footprints
 * are far smaller than a 512-block biome region, so the square meets at most
 * four regions and probing its corners (plus centre) is exact.
 */
export function isFootprintInBiome(biomeAt: BiomeAt, owner: string, x: number, z: number, radius: number): boolean {
  const r = radius + BIOME_BORDER_MARGIN
  return (
    biomeAt(x, z) === owner &&
    biomeAt(x - r, z - r) === owner &&
    biomeAt(x + r, z - r) === owner &&
    biomeAt(x - r, z + r) === owner &&
    biomeAt(x + r, z + r) === owner
  )
}

/**
 * Visit every grid anchor whose square footprint (half-size `reach`) can
 * touch the column range [minX, maxX] x [minZ, maxZ]. The grid is
 * world-anchored (cells at multiples of gridSize, any sign), each cell holds
 * at most one candidate at a hashed position inset by `inset` from the cell
 * edges, kept with probability `chance`.
 */
export function forEachGridAnchor(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  gridSize: number,
  inset: number,
  chance: number,
  reach: number,
  salt: number,
  seed: number,
  visit: (x: number, z: number, cellX: number, cellZ: number) => void
): void {
  const firstCellX = Math.floor((minX - reach) / gridSize)
  const lastCellX = Math.floor((maxX + reach) / gridSize)
  const firstCellZ = Math.floor((minZ - reach) / gridSize)
  const lastCellZ = Math.floor((maxZ + reach) / gridSize)
  const span = Math.max(1, gridSize - 2 * inset)
  for (let cellX = firstCellX; cellX <= lastCellX; cellX++) {
    for (let cellZ = firstCellZ; cellZ <= lastCellZ; cellZ++) {
      if (hash2(cellX, cellZ, salt, seed) >= chance) continue
      const x = cellX * gridSize + inset + Math.floor(hash2(cellX, cellZ, salt + 1, seed) * span)
      const z = cellZ * gridSize + inset + Math.floor(hash2(cellX, cellZ, salt + 2, seed) * span)
      if (x + reach < minX || x - reach > maxX || z + reach < minZ || z - reach > maxZ) continue
      visit(x, z, cellX, cellZ)
    }
  }
}
