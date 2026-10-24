import { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Cave biomes: the overworld's underground (the cave band, Y ~146 up to
 * under the surface) is divided into zones, mostly plain caves with a
 * special one now and again, independent of the 512-block surface regions
 * but weighted by the surface biome above.
 *
 * `caveBiomeAt` is a pure function of world X/Z and the seed (plus
 * the surface biome lookup it is handed), so the generation worker (blocks
 * and decorations, caves/CaveDressing.ts) and the main thread (atmosphere,
 * sounds, spawns, journal) always agree on which cave a position is in.
 */
export type CaveBiomeId =
  | 'dripstone_caverns'
  | 'mossy_grotto'
  | 'glowworm_grotto'
  | 'crystal_geode'
  | 'fungal_hollow'
  | 'frozen_cave'
  | 'magma_chamber'
  | 'webbed_hollow'

export const CAVE_BIOME_IDS: readonly CaveBiomeId[] = [
  'dripstone_caverns',
  'mossy_grotto',
  'glowworm_grotto',
  'crystal_geode',
  'fungal_hollow',
  'frozen_cave',
  'magma_chamber',
  'webbed_hollow',
]

export const CAVE_BIOME_DISPLAY_NAMES: Readonly<Record<CaveBiomeId, string>> = {
  dripstone_caverns: 'Dripstone Caverns',
  mossy_grotto: 'Mossy Grotto',
  glowworm_grotto: 'Glowworm Grotto',
  crystal_geode: 'Crystal Geode',
  fungal_hollow: 'Fungal Hollow',
  frozen_cave: 'Frozen Cave',
  magma_chamber: 'Magma Chamber',
  webbed_hollow: 'Webbed Hollow',
}

/**
 * Odds of each cave biome for a special zone under each surface biome
 * (relative weights). A cave biome missing here has weight 0; a missing
 * surface biome uses the plains' odds.
 */
const CAVE_WEIGHTS: Readonly<Record<string, Partial<Record<CaveBiomeId, number>>>> = {
  'plains': { dripstone_caverns: 35, mossy_grotto: 20, crystal_geode: 12, fungal_hollow: 10, webbed_hollow: 13, glowworm_grotto: 5, magma_chamber: 5 },
  'grassy-hills': { dripstone_caverns: 33, mossy_grotto: 15, crystal_geode: 15, fungal_hollow: 8, webbed_hollow: 12, glowworm_grotto: 6, magma_chamber: 5, frozen_cave: 6 },
  'desert': { dripstone_caverns: 45, crystal_geode: 25, webbed_hollow: 20, magma_chamber: 10 },
  'volcanic': { magma_chamber: 75, crystal_geode: 15, dripstone_caverns: 10 },
  'jungle': { mossy_grotto: 40, glowworm_grotto: 25, fungal_hollow: 15, dripstone_caverns: 10, webbed_hollow: 10 },
  'swamp': { glowworm_grotto: 35, fungal_hollow: 35, mossy_grotto: 25, dripstone_caverns: 5 },
  'pine-forest': { frozen_cave: 35, dripstone_caverns: 25, crystal_geode: 15, mossy_grotto: 10, webbed_hollow: 15 },
  'coastal-rainforest': { mossy_grotto: 35, glowworm_grotto: 30, dripstone_caverns: 20, fungal_hollow: 15 },
}

/**
 * A cave biome sample: the special zone a position lies in (null in a plain
 * zone) and how deep inside it (1 inside, falling to 0 at its border).
 */
export interface CaveBiomeSample {
  biome: CaveBiomeId | null
  strength: number
}

/** Zone cell side (blocks): each cell holds one jittered zone centre. */
const CELL = 88
/** Share of zones that are special; the rest are plain caves. */
const SPECIAL_SHARE = 0.25
/** Width of a special zone's rim (blocks), over which its dressing thins into the plain rock. */
const RIM = 12

/** Border wobble (blocks): zones get organic, interlocking edges. */
const WARP = 18
const WARP_FREQUENCY = 0.014

const noises = new Map<number, SimplexNoise>()
function warpNoise(seed: number): SimplexNoise {
  let n = noises.get(seed)
  if (!n) {
    n = new SimplexNoise(seed + 9301)
    noises.set(seed, n)
  }
  return n
}

function hash(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

/** The cave biome of a special zone, from the surface biome over its centre. */
function zoneBiome(cellX: number, cellZ: number, centreX: number, centreZ: number, seed: number, surfaceBiomeAt: (x: number, z: number) => string): CaveBiomeId {
  const weights = CAVE_WEIGHTS[surfaceBiomeAt(centreX, centreZ)] ?? CAVE_WEIGHTS['plains']
  let total = 0
  for (const id of CAVE_BIOME_IDS) total += weights[id] ?? 0
  let roll = hash(cellX, cellZ, seed ^ 0x51ed) * total
  for (const id of CAVE_BIOME_IDS) {
    roll -= weights[id] ?? 0
    if (roll < 0) return id
  }
  return 'dripstone_caverns'
}

/**
 * The cave biome under world column (x, z). The underground is divided into
 * zones (jittered Voronoi cells of 88 blocks with warped borders, each
 * reaching from the surface down to the Hell ceiling); most are plain caves,
 * and one in four is special - so a cave walk is mostly stone, and every now
 * and again it enters a geode or a glowworm grotto. A special zone is full
 * strength inside and thins out over its last RIM blocks to the border.
 * Play feedback: 176-block zones felt like being "in the geode area", and
 * small 3D pockets in half the underground were too mixed up. `surfaceBiomeAt`
 * names the surface (layer 1) biome at a position, which sets each special
 * zone's odds: in the worker the chunk's getBiomeNameAt (3×3 regions around
 * it: zone centres are at most ~1.5 cells away), on the main thread
 * biomeRegistry.selectBiomeForLayer.
 */
export function caveBiomeAt(
  x: number, z: number, seed: number, surfaceBiomeAt: (x: number, z: number) => string,
  out: CaveBiomeSample = { biome: null, strength: 0 },
): CaveBiomeSample {
  const n = warpNoise(seed)
  const wx = x + WARP * n.noise2D(x * WARP_FREQUENCY, z * WARP_FREQUENCY)
  const wz = z + WARP * n.noise2D(x * WARP_FREQUENCY + 71.3, z * WARP_FREQUENCY - 19.7)
  const cx = Math.floor(wx / CELL)
  const cz = Math.floor(wz / CELL)
  // Nearest and second-nearest zone centres
  let d1 = Infinity, d2 = Infinity
  let gx1 = 0, gz1 = 0, px1 = 0, pz1 = 0, px2 = 0, pz2 = 0
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const gx = cx + dx
      const gz = cz + dz
      const px = (gx + 0.15 + 0.7 * hash(gx, gz, seed ^ 0x1a2b)) * CELL
      const pz = (gz + 0.15 + 0.7 * hash(gx, gz, seed ^ 0x3c4d)) * CELL
      const d = (px - wx) * (px - wx) + (pz - wz) * (pz - wz)
      if (d < d1) {
        d2 = d1; px2 = px1; pz2 = pz1
        d1 = d; gx1 = gx; gz1 = gz; px1 = px; pz1 = pz
      } else if (d < d2) {
        d2 = d; px2 = px; pz2 = pz
      }
    }
  }
  if (hash(gx1, gz1, seed ^ 0x5bec) >= SPECIAL_SHARE) {
    out.biome = null
    out.strength = 0
    return out
  }
  // Distance to the border with the neighbouring zone (the bisector of the two centres)
  const border = (d2 - d1) / (2 * Math.hypot(px2 - px1, pz2 - pz1))
  const t = Math.min(1, border / RIM)
  out.strength = t * t * (3 - 2 * t)
  out.biome = zoneBiome(gx1, gz1, px1, pz1, seed, surfaceBiomeAt)
  return out
}
