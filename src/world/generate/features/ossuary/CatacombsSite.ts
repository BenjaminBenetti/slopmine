import { BIOME_REGION_SIZE_BLOCKS } from '../../caves/CaveBlend.ts'
import {
  getCachedDungeonLayout,
  getDungeonKit,
  proceduralDungeonPlacement,
  regionDungeonAnchor,
} from '../../dungeons/index.ts'
import { CATACOMBS } from '../../dungeons/kits/ossuary/CatacombsConfig.ts'
import { catacombsPrecinctBox } from '../../dungeons/kits/ossuary/CatacombsKit.ts'

/**
 * True if a structure reaching `reach` blocks (Chebyshev) from (x, z) would
 * intrude on the Catacombs necropolis precinct of this region (its walled
 * yard, gate and approach). Fossils and bone spires leave it clear; above
 * the underground crypts they may stand (the crypts overwrite whatever they
 * cross). Pure: the region anchor and the cached worker layout, computed
 * over the same terrain heights the dungeon feature uses.
 */
export function isNearCatacombsPrecinct(
  x: number,
  z: number,
  reach: number,
  seed: number,
  terrainHeight: (x: number, z: number) => number
): boolean {
  const kit = getDungeonKit(CATACOMBS.kitId)
  if (!kit) return false
  const placement = proceduralDungeonPlacement(CATACOMBS, kit)
  const anchor = regionDungeonAnchor(
    placement,
    Math.floor(x / BIOME_REGION_SIZE_BLOCKS),
    Math.floor(z / BIOME_REGION_SIZE_BLOCKS),
    seed
  )
  if (!anchor) return false
  if (Math.max(Math.abs(x - anchor.x), Math.abs(z - anchor.z)) > placement.footprintRadius + reach) return false
  const layout = getCachedDungeonLayout(kit, anchor.x, anchor.z, seed, CATACOMBS.salt, terrainHeight, CATACOMBS.biome)
  const box = catacombsPrecinctBox(layout)
  return x + reach >= box.x0 && x - reach <= box.x1 && z + reach >= box.z0 && z - reach <= box.z1
}
