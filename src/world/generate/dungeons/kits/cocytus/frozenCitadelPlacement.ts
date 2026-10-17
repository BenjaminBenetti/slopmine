import { BIOME_REGION_SIZE_BLOCKS } from '../../../caves/CaveBlend.ts'
import { proceduralDungeonPlacement, regionDungeonAnchor } from '../../index.ts'
import { frozenCitadelKit } from './FrozenCitadelKit.ts'
import { FROZEN_CITADEL } from './frozenCitadelConfig.ts'

const placement = proceduralDungeonPlacement(FROZEN_CITADEL, frozenCitadelKit)

/**
 * True if (x, z) lies within `margin` blocks of the footprint (castle, curtain
 * wall, crevasse and approach) of its region's Frozen Citadel candidate. The
 * Cocytus spire and lavafall features use it to keep out of the castles. The
 * biome is not checked: those features only run in Cocytus regions, and a
 * castle never leaves its own region (anchors are inset by the blend band).
 */
export function isNearFrozenCitadel(x: number, z: number, seed: number, margin: number): boolean {
  const anchor = regionDungeonAnchor(
    placement,
    Math.floor(x / BIOME_REGION_SIZE_BLOCKS),
    Math.floor(z / BIOME_REGION_SIZE_BLOCKS),
    seed
  )
  if (!anchor) return false
  const reach = placement.footprintRadius + margin
  return Math.abs(x - anchor.x) <= reach && Math.abs(z - anchor.z) <= reach
}
