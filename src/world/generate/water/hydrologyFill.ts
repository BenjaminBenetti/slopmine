import { BlockIds } from '../../blocks/BlockIds.ts'
import type { WaterSettings } from '../BiomeGenerator.ts'
import { BIOME_REGION_SIZE_BLOCKS } from '../caves/CaveBlend.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import type { WaterColumnFill } from '../features/WaterFeature.ts'
import { Hydrology, WATER_SURFACE_Y } from './Hydrology.ts'

/** A biome region's water settings: the chunk's own region and its 8 neighbours (absent = same as `primary`). */
interface RegionWater {
  readonly water?: WaterSettings
}
export interface HydrologyFillBiomes {
  readonly primary: RegionWater
  readonly north?: RegionWater
  readonly south?: RegionWater
  readonly east?: RegionWater
  readonly west?: RegionWater
  readonly northeast?: RegionWater
  readonly northwest?: RegionWater
  readonly southeast?: RegionWater
  readonly southwest?: RegionWater
}

/** The sea and every river through a biome without pools of its own. */
const SEA_WATER: WaterSettings = {
  enabled: true, frequency: 1, minDepth: 1, waterLevel: WATER_SURFACE_Y,
  liquidBlock: BlockIds.WATER, sandBlock: BlockIds.SAND, sandDepth: 3, shoreRadius: 0,
}
/** Where a lava river meets water it has cooled to obsidian, from its bed up to the surface. */
const COOLED_LAVA: WaterSettings = { ...SEA_WATER, liquidBlock: BlockIds.OBSIDIAN, sandBlock: undefined }

/** The cooled plug reaches this far in from a region border with water rivers (blocks, + up to PLUG_VARY). */
const PLUG_LENGTH = 4
const PLUG_VARY = 5
/** At the coast: the plug runs up the channel to this continent value (+ up to SEA_PLUG_VARY; ~0.001 per 1.2-2 blocks). */
const SEA_PLUG = 0.004
const SEA_PLUG_VARY = 0.006

/** The liquid Hydrology's rivers run with in a region: its `liquidBlock` without pools of its own, else water. */
function riverLiquid(region: RegionWater): number {
  return region.water && !region.water.enabled ? region.water.liquidBlock : BlockIds.WATER
}

/**
 * The water fill of a surface sub-chunk's primary biome (the worker's
 * Phase 2.5), or null for none:
 * - A biome with pools of its own fills every hollow below its water level
 *   with its liquid - except Hydrology's seas and channels, which are clear
 *   water everywhere (a river runs on through the swamp's murky pools
 *   instead of changing colour at the region's straight edge).
 * - A biome without (desert, volcanic) fills only Hydrology's water: the sea
 *   with water, its rivers and streams - and the lakes they flood around
 *   them where they cross low land (`floodplain`) - with its `liquidBlock`:
 *   lava in the volcanic lands. Where lava would touch water (at the coast,
 *   or across the region border from a biome whose rivers are water) it has
 *   cooled into an obsidian plug a few blocks long, so the two liquids never
 *   meet.
 */
export function hydrologyWaterFill(
  biomes: HydrologyFillBiomes,
  seed: number,
  noise: SimplexNoise
): { settings: WaterSettings; columnFill?: WaterColumnFill } | null {
  const own = biomes.primary.water
  const hydrology = Hydrology.forSeed(seed)
  if (own?.enabled) {
    if (own.liquidBlock === BlockIds.WATER) return { settings: own }
    const clear: WaterSettings = { ...own, liquidBlock: BlockIds.WATER }
    return { settings: own, columnFill: (x, z) => (hydrology.isWaterBody(x, z) ? clear : own) }
  }

  const channelLiquid = own ? own.liquidBlock : BlockIds.WATER
  if (channelLiquid === BlockIds.WATER) {
    return {
      settings: SEA_WATER,
      columnFill: (x, z) => {
        const sample = hydrology.sample(x, z)
        return sample.continent < 0 || sample.inChannel || sample.floodplain ? SEA_WATER : null
      },
    }
  }
  // (on a bed of basalt)
  const channel: WaterSettings = { ...SEA_WATER, liquidBlock: channelLiquid, sandBlock: BlockIds.BASALT, sandDepth: 2 }
  const meetsWater = (region: RegionWater | undefined): boolean => region !== undefined && riverLiquid(region) !== channelLiquid
  const west = meetsWater(biomes.west)
  const east = meetsWater(biomes.east)
  const north = meetsWater(biomes.north)
  const south = meetsWater(biomes.south)
  const northwest = meetsWater(biomes.northwest)
  const northeast = meetsWater(biomes.northeast)
  const southwest = meetsWater(biomes.southwest)
  const southeast = meetsWater(biomes.southeast)
  const anyBorder = west || east || north || south || northwest || northeast || southwest || southeast
  const nearWaterBorder = (x: number, z: number): boolean => {
    const reach = PLUG_LENGTH + PLUG_VARY * (0.5 + 0.5 * noise.noise2D(x * 0.09 + 3.7, z * 0.09 - 8.1))
    const lx = x - Math.floor(x / BIOME_REGION_SIZE_BLOCKS) * BIOME_REGION_SIZE_BLOCKS + 0.5
    const lz = z - Math.floor(z / BIOME_REGION_SIZE_BLOCKS) * BIOME_REGION_SIZE_BLOCKS + 0.5
    const w = lx < reach
    const e = BIOME_REGION_SIZE_BLOCKS - lx < reach
    const n = lz < reach
    const s = BIOME_REGION_SIZE_BLOCKS - lz < reach
    return (west && w) || (east && e) || (north && n) || (south && s) ||
      (northwest && n && w) || (northeast && n && e) || (southwest && s && w) || (southeast && s && e)
  }
  return {
    settings: SEA_WATER,
    columnFill: (x, z) => {
      const sample = hydrology.sample(x, z)
      if (sample.continent < 0) return SEA_WATER
      if (!sample.inChannel && !sample.floodplain) return null
      const seaPlug = SEA_PLUG + SEA_PLUG_VARY * (0.5 + 0.5 * noise.noise2D(x * 0.07 - 21.3, z * 0.07 + 5.9))
      return sample.continent < seaPlug || (anyBorder && nearWaterBorder(x, z)) ? COOLED_LAVA : channel
    },
  }
}
