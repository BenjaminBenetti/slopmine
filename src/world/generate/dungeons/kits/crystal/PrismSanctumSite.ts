import { BIOME_REGION_SIZE_BLOCKS } from '../../../caves/CaveBlend.ts'
import { proceduralDungeonPlacement, regionDungeonAnchor } from '../../index.ts'
import { PRISM_SANCTUM_CONFIG } from './PrismSanctumConfig.ts'
import { prismSanctumKit } from './PrismSanctumKit.ts'

/**
 * Prism Sanctum site test for the Crystal Abyss landmark features (spires,
 * geodes, floating islands): pure, worker-safe. Conservative - it keeps the
 * whole possible footprint of an accepted region's castle (grid + approach +
 * plinth) clear without building the layout; the biome check is skipped
 * because the footprint never leaves its own region's interior.
 */
export function isNearPrismSanctum(seed: number, x: number, z: number, reach: number): boolean {
  const placement = proceduralDungeonPlacement(PRISM_SANCTUM_CONFIG, prismSanctumKit)
  const r = placement.footprintRadius + reach
  const size = BIOME_REGION_SIZE_BLOCKS
  for (let rx = Math.floor((x - r) / size); rx <= Math.floor((x + r) / size); rx++) {
    for (let rz = Math.floor((z - r) / size); rz <= Math.floor((z + r) / size); rz++) {
      const anchor = regionDungeonAnchor(placement, rx, rz, seed)
      if (anchor && Math.abs(anchor.x - x) <= r && Math.abs(anchor.z - z) <= r) return true
    }
  }
  return false
}
