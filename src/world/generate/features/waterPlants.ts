import { SubmergedPlantFeature } from './SubmergedPlantFeature.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { WATER_SURFACE_Y } from '../water/Hydrology.ts'

/**
 * The sea's plants: kelp forests rising from the shelf (4+ cells of water) to
 * the surface, seagrass meadows on the shallower sand. Only the shelf grows
 * them - a column whose bed lies below the surface's sub-chunk is skipped
 * (SubmergedPlantFeature), so the deep stays bare sand, gravel and clay.
 */
export function seaPlants(): SubmergedPlantFeature {
  return new SubmergedPlantFeature({
    waterLevel: WATER_SURFACE_Y,
    waterBlockId: BlockIds.WATER,
    validBedBlocks: [BlockIds.SAND, BlockIds.GRAVEL, BlockIds.CLAY],
    strands: {
      stalkBlockId: BlockIds.KELP,
      topBlockId: BlockIds.KELP_TOP,
      minDepth: 4,
      surfaceChance: 0.5,
      zoneFrequency: 0.018,
      zoneThreshold: 0.55,
      density: 0.4,
    },
    bedPlant: {
      blockId: BlockIds.SEAGRASS,
      zoneFrequency: 0.04,
      zoneThreshold: 0.42,
      density: 0.3,
    },
  })
}

/**
 * Seagrass in a land biome's lakes and rivers (sparser than at sea), and kelp
 * in its deeper coastal waters when `kelp` is set (the coasts beside the sea).
 */
export function freshwaterPlants(bedBlocks: readonly number[], kelp = false): SubmergedPlantFeature {
  return new SubmergedPlantFeature({
    waterLevel: WATER_SURFACE_Y,
    waterBlockId: BlockIds.WATER,
    validBedBlocks: bedBlocks,
    strands: kelp
      ? {
          stalkBlockId: BlockIds.KELP,
          topBlockId: BlockIds.KELP_TOP,
          minDepth: 6,
          surfaceChance: 0.4,
          zoneFrequency: 0.02,
          zoneThreshold: 0.62,
          density: 0.3,
        }
      : undefined,
    bedPlant: {
      blockId: BlockIds.SEAGRASS,
      zoneFrequency: 0.05,
      zoneThreshold: 0.5,
      density: 0.18,
    },
  })
}
