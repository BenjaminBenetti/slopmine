import { Hydrology, WATER_SURFACE_Y } from '../world/generate/water/Hydrology.ts'

/** Just inland of the beach (continent units: the coastal band is ~0.05 wide, 60-100 blocks): ~15-45 blocks from the water. */
const COAST_MIN = 0.012
const COAST_MAX = 0.03
/** Open sea, not an inlet: this far out from the spot, the continent field is well below the waterline. */
const SEA_PROBE = 150
const SEA_PROBE_CONTINENT = -0.03
/** Rings searched outward from the origin (blocks apart, and how far). */
const RING_STEP = 40
const MAX_RADIUS = 4000

export interface CoastalSpawn {
  readonly x: number
  readonly z: number
  /** Unit direction (world x/z) toward the open sea, to face it. */
  readonly seaX: number
  readonly seaZ: number
}

/**
 * The new world's first sight is the sea (Ben: "I love the coastline... when
 * you start a new world, you spawn on the coast"): the nearest spot to the
 * origin on dry land just inland of a beach - not in a river valley or flood
 * lake - looking out over open sea, in a biome `suitable` accepts. The land
 * near the origin is a continent (Hydrology boosts it), so this is usually
 * its nearest shore, ~1-3 km out. Pure: the same seed always gives the same
 * spot. Null when no coast lies within reach.
 */
export function findCoastalSpawn(
  seed: number,
  suitable: (x: number, z: number) => boolean,
  landHeightAt: (x: number, z: number) => number
): CoastalSpawn | null {
  const hydrology = Hydrology.forSeed(seed)
  for (let ring = 0; ring * RING_STEP <= MAX_RADIUS; ring++) {
    const radius = ring * RING_STEP
    const steps = Math.max(1, Math.round((2 * Math.PI * radius) / RING_STEP))
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2
      const x = Math.round(Math.cos(angle) * radius)
      const z = Math.round(Math.sin(angle) * radius)
      const c = hydrology.continent(x, z)
      if (c < COAST_MIN || c > COAST_MAX) continue
      const sample = hydrology.sample(x, z)
      if (sample.inChannel || sample.floodplain || sample.valleyCap <= WATER_SURFACE_Y + 3) continue
      // Toward the sea: down the continent field
      const gx = hydrology.continent(x + 16, z) - hydrology.continent(x - 16, z)
      const gz = hydrology.continent(x, z + 16) - hydrology.continent(x, z - 16)
      const length = Math.hypot(gx, gz)
      if (length < 1e-9) continue
      const seaX = -gx / length
      const seaZ = -gz / length
      if (hydrology.continent(x + seaX * SEA_PROBE, z + seaZ * SEA_PROBE) > SEA_PROBE_CONTINENT) continue
      if (!suitable(x, z) || landHeightAt(x, z) < WATER_SURFACE_Y + 2) continue
      return { x, z, seaX, seaZ }
    }
  }
  return null
}
