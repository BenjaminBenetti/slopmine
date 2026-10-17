import { BIOME_REGION_SIZE_BLOCKS } from '../../caves/CaveBlend.ts'
import { regionDungeonAnchor } from '../../dungeons/RegionPlacement.ts'
import { getCachedDungeonLayout } from '../../dungeons/LayoutCache.ts'
import { proceduralDungeonPlacement } from '../../dungeons/ProceduralDungeonFeature.ts'
import { SPOREHEART_HIVE } from '../../dungeons/kits/embergrove/hiveConstants.ts'
import {
  sporeheartHiveFootprint,
  sporeheartHiveKit,
  type HiveFootprint,
} from '../../dungeons/kits/embergrove/SporeheartHiveKit.ts'

/**
 * Where the Sporeheart Hives stand, for features that must keep clear of
 * them (giant fungi): the same anchor, biome check and layout as the
 * ProceduralDungeonFeature (the layout comes from the per-worker cache, so
 * this costs nothing once the hive's sub-chunks are being generated).
 */

/** Max horizontal reach of a hive's mound, buttresses and approach from its anchor. */
const HIVE_REACH = 128

export function findHiveFootprintsNear(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  seed: number,
  getBiomeNameAt: ((x: number, z: number) => string) | undefined,
  getBaseHeightAt: (x: number, z: number) => number
): HiveFootprint[] {
  const placement = proceduralDungeonPlacement(SPOREHEART_HIVE, sporeheartHiveKit)
  const result: HiveFootprint[] = []
  const rx0 = Math.floor((minX - HIVE_REACH) / BIOME_REGION_SIZE_BLOCKS)
  const rx1 = Math.floor((maxX + HIVE_REACH) / BIOME_REGION_SIZE_BLOCKS)
  const rz0 = Math.floor((minZ - HIVE_REACH) / BIOME_REGION_SIZE_BLOCKS)
  const rz1 = Math.floor((maxZ + HIVE_REACH) / BIOME_REGION_SIZE_BLOCKS)
  for (let rx = rx0; rx <= rx1; rx++) {
    for (let rz = rz0; rz <= rz1; rz++) {
      const anchor = regionDungeonAnchor(placement, rx, rz, seed)
      if (!anchor) continue
      if (anchor.x + HIVE_REACH < minX || anchor.x - HIVE_REACH > maxX) continue
      if (anchor.z + HIVE_REACH < minZ || anchor.z - HIVE_REACH > maxZ) continue
      if (getBiomeNameAt && getBiomeNameAt(anchor.x, anchor.z) !== SPOREHEART_HIVE.biome) continue
      const layout = getCachedDungeonLayout(
        sporeheartHiveKit,
        anchor.x,
        anchor.z,
        seed,
        SPOREHEART_HIVE.salt,
        getBaseHeightAt,
        SPOREHEART_HIVE.biome
      )
      result.push(sporeheartHiveFootprint(layout, getBaseHeightAt))
    }
  }
  return result
}

/** Is (x, z) within `margin` blocks of a hive's mound (and buttresses) or its approach? */
export function isInHiveClearing(f: HiveFootprint, x: number, z: number, margin: number): boolean {
  const u = Math.abs(x - f.cx) / (f.rx + margin)
  const v = Math.abs(z - f.cz) / (f.rz + margin)
  if (Math.pow(u, 2.4) + Math.pow(v, 2.4) < 1) return true
  // The approach corridor (3 wide each side) plus the margin
  const along = (x - f.gateX) * f.dirX + (z - f.gateZ) * f.dirZ
  const t = Math.max(0, Math.min(f.approach + 4, along))
  const px = f.gateX + f.dirX * t
  const pz = f.gateZ + f.dirZ * t
  return Math.hypot(x - px, z - pz) < margin + 3
}
