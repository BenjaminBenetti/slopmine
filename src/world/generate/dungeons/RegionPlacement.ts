import { BIOME_REGION_SIZE_BLOCKS, BLEND_DISTANCE } from '../caves/CaveBlend.ts'
import { hashInts } from './DungeonRandom.ts'

/**
 * Region-anchored dungeon placement (pure; shared by the worker feature and
 * the main-thread locator).
 *
 * Each 512×512 biome region has ONE candidate per dungeon type, accepted
 * with probability `chance` (default 0.85); its anchor is jittered inside the
 * region's interior so the whole footprint (+ margin) stays clear of the
 * 96-block biome blend band. There the blended terrain height equals the
 * biome generator's own height, so the castle's base Y is computable
 * identically on the main thread. Two dungeons of one type are never closer
 * than 2 × (BLEND_DISTANCE + footprintRadius + margin) ≈ 320 blocks.
 */
export interface RegionDungeonPlacement {
  /** BiomeType whose regions host the dungeon. */
  readonly biome: string
  /** Distinct per dungeon type (different types never share candidates). */
  readonly salt: number
  /** Acceptance probability per region. Default 0.85. */
  readonly chance?: number
  /** Max distance (blocks) from the anchor to any block the castle writes horizontally. */
  readonly footprintRadius: number
  /** Extra clearance from the blend band. Default 8. */
  readonly margin?: number
}

export interface RegionDungeonAnchor {
  readonly x: number
  readonly z: number
  readonly regionX: number
  readonly regionZ: number
}

/** Default acceptance probability. */
export const DEFAULT_REGION_DUNGEON_CHANCE = 0.85

/**
 * The region's candidate anchor (biome NOT checked), or null when the
 * region rolled no dungeon or the footprint cannot fit its interior.
 */
export function regionDungeonAnchor(
  placement: RegionDungeonPlacement,
  regionX: number,
  regionZ: number,
  seed: number
): RegionDungeonAnchor | null {
  const chance = placement.chance ?? DEFAULT_REGION_DUNGEON_CHANCE
  const h = hashInts(regionX, regionZ, placement.salt, seed)
  if ((h >>> 8) / 16777216 >= chance) return null
  const inset = BLEND_DISTANCE + Math.ceil(placement.footprintRadius) + (placement.margin ?? 8)
  const span = BIOME_REGION_SIZE_BLOCKS - 2 * inset
  if (span < 1) return null
  const jx = hashInts(regionX, regionZ, placement.salt ^ 0x5bd1e995, seed) % span
  const jz = hashInts(regionZ, regionX, placement.salt ^ 0x27d4eb2f, seed) % span
  return {
    x: regionX * BIOME_REGION_SIZE_BLOCKS + inset + jx,
    z: regionZ * BIOME_REGION_SIZE_BLOCKS + inset + jz,
    regionX,
    regionZ,
  }
}

/** Biome of a region (main thread: `biomeRegistry.selectBiomeForLayer(rx, rz, seed, layer)`). */
export type RegionBiomeAt = (regionX: number, regionZ: number) => string

/**
 * The accepted anchor in (regionX, regionZ) if that region's biome hosts
 * the dungeon, else null.
 */
export function regionDungeonAt(
  placement: RegionDungeonPlacement,
  regionX: number,
  regionZ: number,
  seed: number,
  biomeAt: RegionBiomeAt
): RegionDungeonAnchor | null {
  if (biomeAt(regionX, regionZ) !== placement.biome) return null
  return regionDungeonAnchor(placement, regionX, regionZ, seed)
}

/**
 * The nearest accepted anchor to (x, z) within `maxRadius` blocks
 * (horizontal), scanning every region the search circle touches. Pure and
 * cheap (one hash + one biome lookup per region): a 1024-block search
 * visits ≤ 25 regions.
 */
export function findNearestRegionDungeon(
  placement: RegionDungeonPlacement,
  x: number,
  z: number,
  seed: number,
  maxRadius: number,
  biomeAt: RegionBiomeAt
): RegionDungeonAnchor | null {
  const size = BIOME_REGION_SIZE_BLOCKS
  const rx0 = Math.floor((x - maxRadius) / size)
  const rx1 = Math.floor((x + maxRadius) / size)
  const rz0 = Math.floor((z - maxRadius) / size)
  const rz1 = Math.floor((z + maxRadius) / size)
  let best: RegionDungeonAnchor | null = null
  let bestD2 = maxRadius * maxRadius
  for (let rx = rx0; rx <= rx1; rx++) {
    for (let rz = rz0; rz <= rz1; rz++) {
      const anchor = regionDungeonAnchor(placement, rx, rz, seed)
      if (!anchor) continue
      const d2 = (anchor.x - x) * (anchor.x - x) + (anchor.z - z) * (anchor.z - z)
      if (d2 > bestD2) continue
      if (biomeAt(rx, rz) !== placement.biome) continue
      best = anchor
      bestD2 = d2
    }
  }
  return best
}
