import { BlockIds } from '../../blocks/BlockIds.ts'
import { GroundCoverFeature, type GroundCoverLayer } from './GroundCoverFeature.ts'

/**
 * The Nature Update's ground cover per overworld biome: one GroundCoverFeature
 * each, appended LAST to the biome's features (after trees and structures, so
 * it only fills the open ground they leave). Layers are tried in order per
 * column - rare finds first (wild crops, bushes, doodads), then flower
 * fields and patches (noise zones), then the grass carpet - and each column
 * gets at most one plant.
 */

const WATER_LEVEL = 238
const SWAMP_WATER_LEVEL = 234

const { GRASS, SAND, PODZOL, SNOWY_GRASS, MOSS, MOSSY_STONE, MUDDY_GRASS, MUD, BASALT, WATER, SWAMP_WATER } = BlockIds

/** Lily pads and water lilies on still water, in drifting rafts. */
function lilyPads(waterBlock: number, surfaceY: number, density: number): GroundCoverLayer {
  return {
    blocks: [BlockIds.LILY_PAD, BlockIds.LILY_PAD, BlockIds.LILY_PAD, BlockIds.WATER_LILY],
    ground: [waterBlock],
    waterSurfaceY: surfaceY,
    density,
    zoneFrequency: 0.045,
    zoneThreshold: 0.55,
    zoneFade: 0.12,
  }
}

/** A rare patch of a ripe wild crop - where a farm's first seeds come from. */
function wildCrop(blocks: readonly number[], ground: readonly number[], zoneThreshold = 0.92): GroundCoverLayer {
  return { blocks, ground, density: 0.22, zoneFrequency: 0.03, zoneThreshold, zoneFade: 0.03 }
}

/** Dune grass, shells and pebbles on the sand along the water. */
function shoreLayers(): GroundCoverLayer[] {
  return [
    { blocks: [BlockIds.BEACH_GRASS], ground: [SAND], density: 0.14, maxAboveWater: 3, zoneFrequency: 0.06, zoneThreshold: 0.45, zoneFade: 0.2 },
    { blocks: [BlockIds.PEBBLES], ground: [SAND], density: 0.02, maxAboveWater: 4 },
  ]
}

// Outside the jungle the land stays open: low grass is a light scatter, and
// knee-to-face height plants (tall grass, bracken, foxgloves, bushes) only
// gather in small, rare patches (noise01 > 0.8 is roughly a tenth of the land).

export function plainsGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 11,
    waterLevel: WATER_LEVEL,
    layers: [
      wildCrop([BlockIds.CARROT_4, BlockIds.CARROT_4, BlockIds.ONION_4], [GRASS]),
      wildCrop([BlockIds.PUMPKIN_4], [GRASS], 0.95),
      lilyPads(WATER, WATER_LEVEL, 0.3),
      ...shoreLayers(),
      { blocks: [BlockIds.WILD_BUSH], ground: [GRASS], density: 0.005 },
      { blocks: [BlockIds.PEBBLES], ground: [GRASS], density: 0.006 },
      { blocks: [BlockIds.TWIGS], ground: [GRASS], density: 0.003 },
      { blocks: [BlockIds.LAVENDER], ground: [GRASS], density: 0.3, zoneFrequency: 0.03, zoneThreshold: 0.84, zoneFade: 0.05 },
      {
        blocks: [BlockIds.DAISY, BlockIds.DAISY, BlockIds.DANDELION, BlockIds.DANDELION, BlockIds.YELLOW_FLOWER, BlockIds.RED_FLOWER, BlockIds.BLUE_FLOWER],
        ground: [GRASS], density: 0.22, zoneFrequency: 0.02, zoneThreshold: 0.7, zoneFade: 0.1,
      },
      { blocks: [BlockIds.DAISY, BlockIds.DANDELION], ground: [GRASS], density: 0.008 },
      { blocks: [BlockIds.CLOVER], ground: [GRASS], density: 0.35, zoneFrequency: 0.05, zoneThreshold: 0.76, zoneFade: 0.06 },
      { blocks: [BlockIds.TALL_GRASS], ground: [GRASS], density: 0.3, zoneFrequency: 0.025, zoneThreshold: 0.8, zoneFade: 0.08 },
      { blocks: [BlockIds.SHORT_GRASS], ground: [GRASS], density: 0.22 },
    ],
  })
}

export function grassyHillsGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 12,
    waterLevel: WATER_LEVEL,
    layers: [
      wildCrop([BlockIds.POTATO_4, BlockIds.POTATO_4, BlockIds.CARROT_4], [GRASS]),
      wildCrop([BlockIds.STRAWBERRY_4], [GRASS], 0.94),
      lilyPads(WATER, WATER_LEVEL, 0.25),
      ...shoreLayers(),
      { blocks: [BlockIds.WILD_BUSH], ground: [GRASS], density: 0.006 },
      { blocks: [BlockIds.PEBBLES], ground: [GRASS], density: 0.012 },
      { blocks: [BlockIds.TOADSTOOL, BlockIds.BROWN_MUSHROOMS], ground: [GRASS], density: 0.003 },
      { blocks: [BlockIds.HEATHER], ground: [GRASS], density: 0.4, zoneFrequency: 0.025, zoneThreshold: 0.75, zoneFade: 0.08, minY: 250 },
      { blocks: [BlockIds.FOXGLOVE], ground: [GRASS], density: 0.25, zoneFrequency: 0.04, zoneThreshold: 0.88, zoneFade: 0.04 },
      { blocks: [BlockIds.BRACKEN], ground: [GRASS], density: 0.25, zoneFrequency: 0.03, zoneThreshold: 0.86, zoneFade: 0.05 },
      {
        blocks: [BlockIds.DAISY, BlockIds.DANDELION, BlockIds.YELLOW_FLOWER, BlockIds.BLUE_FLOWER, BlockIds.LAVENDER],
        ground: [GRASS], density: 0.18, zoneFrequency: 0.022, zoneThreshold: 0.74, zoneFade: 0.1,
      },
      { blocks: [BlockIds.CLOVER], ground: [GRASS], density: 0.35, zoneFrequency: 0.05, zoneThreshold: 0.78, zoneFade: 0.06 },
      { blocks: [BlockIds.TALL_GRASS], ground: [GRASS], density: 0.3, zoneFrequency: 0.022, zoneThreshold: 0.8, zoneFade: 0.08 },
      { blocks: [BlockIds.SHORT_GRASS], ground: [GRASS], density: 0.22 },
    ],
  })
}

export function pineForestGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 13,
    waterLevel: WATER_LEVEL,
    layers: [
      { blocks: [BlockIds.BLUEBERRY_BUSH_RIPE], ground: [GRASS, PODZOL], density: 0.25, zoneFrequency: 0.03, zoneThreshold: 0.8, zoneFade: 0.05 },
      wildCrop([BlockIds.STRAWBERRY_4], [GRASS], 0.93),
      lilyPads(WATER, WATER_LEVEL, 0.2),
      ...shoreLayers(),
      { blocks: [BlockIds.TOADSTOOL], ground: [PODZOL, GRASS], density: 0.01 },
      { blocks: [BlockIds.BROWN_MUSHROOMS], ground: [PODZOL, GRASS], density: 0.014 },
      { blocks: [BlockIds.TWIGS], ground: [PODZOL, GRASS], density: 0.025 },
      { blocks: [BlockIds.NEEDLE_LITTER], ground: [PODZOL], density: 0.3 },
      { blocks: [BlockIds.NEEDLE_LITTER], ground: [GRASS], density: 0.05 },
      { blocks: [BlockIds.BRACKEN], ground: [PODZOL, GRASS], density: 0.3, zoneFrequency: 0.025, zoneThreshold: 0.8, zoneFade: 0.06 },
      { blocks: [BlockIds.FOXGLOVE], ground: [GRASS], density: 0.25, zoneFrequency: 0.04, zoneThreshold: 0.88, zoneFade: 0.04 },
      { blocks: [BlockIds.PEBBLES], ground: [SNOWY_GRASS], density: 0.02 },
      { blocks: [BlockIds.HEATHER], ground: [SNOWY_GRASS], density: 0.3, zoneFrequency: 0.03, zoneThreshold: 0.74, zoneFade: 0.08 },
      { blocks: [BlockIds.FROSTED_GRASS], ground: [SNOWY_GRASS], density: 0.2 },
      { blocks: [BlockIds.TALL_GRASS], ground: [GRASS], density: 0.25, zoneFrequency: 0.025, zoneThreshold: 0.82, zoneFade: 0.06 },
      { blocks: [BlockIds.SHORT_GRASS], ground: [GRASS], density: 0.25 },
      { blocks: [BlockIds.SHORT_GRASS], ground: [PODZOL], density: 0.08 },
    ],
  })
}

export function coastalRainforestGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 14,
    waterLevel: WATER_LEVEL,
    layers: [
      wildCrop([BlockIds.STRAWBERRY_4], [GRASS, MOSS], 0.93),
      lilyPads(WATER, WATER_LEVEL, 0.15),
      { blocks: [BlockIds.DRIFTWOOD], ground: [SAND], density: 0.012, maxAboveWater: 3 },
      { blocks: [BlockIds.BEACH_SHELLS], ground: [SAND], density: 0.04, maxAboveWater: 3 },
      { blocks: [BlockIds.SEA_THRIFT], ground: [SAND, GRASS, MOSS], density: 0.3, maxAboveWater: 6, zoneFrequency: 0.05, zoneThreshold: 0.72, zoneFade: 0.08 },
      ...shoreLayers(),
      { blocks: [BlockIds.SALAL], ground: [GRASS, MOSS], density: 0.025 },
      { blocks: [BlockIds.TOADSTOOL, BlockIds.BROWN_MUSHROOMS, BlockIds.BROWN_MUSHROOMS], ground: [GRASS, MOSS], density: 0.02 },
      { blocks: [BlockIds.TWIGS], ground: [GRASS, MOSS], density: 0.015 },
      { blocks: [BlockIds.LEAF_LITTER], ground: [GRASS, MOSS], density: 0.03 },
      { blocks: [BlockIds.PEBBLES], ground: [MOSSY_STONE, MOSS], density: 0.04 },
      { blocks: [BlockIds.BRACKEN], ground: [GRASS, MOSS], density: 0.25, zoneFrequency: 0.03, zoneThreshold: 0.82, zoneFade: 0.06 },
      { blocks: [BlockIds.CLOVER], ground: [GRASS, MOSS], density: 0.3, zoneFrequency: 0.045, zoneThreshold: 0.7, zoneFade: 0.1 },
      { blocks: [BlockIds.SHORT_GRASS], ground: [GRASS], density: 0.25 },
      { blocks: [BlockIds.SHORT_GRASS], ground: [MOSS], density: 0.12 },
    ],
  })
}

export function jungleGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 15,
    waterLevel: WATER_LEVEL,
    layers: [
      { blocks: [BlockIds.PINEAPPLE_PLANT_RIPE], ground: [GRASS], density: 0.15, zoneFrequency: 0.03, zoneThreshold: 0.92, zoneFade: 0.03 },
      wildCrop([BlockIds.TOMATO_4], [GRASS], 0.93),
      lilyPads(WATER, WATER_LEVEL, 0.35),
      { blocks: [BlockIds.ELEPHANT_EAR], ground: [GRASS], density: 0.04 },
      { blocks: [BlockIds.HELICONIA], ground: [GRASS], density: 0.03 },
      { blocks: [BlockIds.ORCHID], ground: [GRASS], density: 0.35, zoneFrequency: 0.04, zoneThreshold: 0.78, zoneFade: 0.06 },
      { blocks: [BlockIds.ORCHID], ground: [GRASS], density: 0.012 },
      { blocks: [BlockIds.LEAF_LITTER], ground: [GRASS], density: 0.03 },
      { blocks: [BlockIds.BROWN_MUSHROOMS], ground: [GRASS], density: 0.008 },
      { blocks: [BlockIds.JUNGLE_GRASS], ground: [GRASS], density: 0.55 },
    ],
  })
}

export function swampGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 16,
    waterLevel: SWAMP_WATER_LEVEL,
    layers: [
      lilyPads(SWAMP_WATER, SWAMP_WATER_LEVEL, 0.3),
      { blocks: [BlockIds.BOG_COTTON], ground: [MUD, MUDDY_GRASS], density: 0.3, zoneFrequency: 0.04, zoneThreshold: 0.75, zoneFade: 0.08 },
      { blocks: [BlockIds.HORSETAIL], ground: [MUD, MUDDY_GRASS], density: 0.3, zoneFrequency: 0.035, zoneThreshold: 0.8, zoneFade: 0.06 },
      { blocks: [BlockIds.BROWN_MUSHROOMS, BlockIds.TOADSTOOL], ground: [MUDDY_GRASS], density: 0.01 },
      { blocks: [BlockIds.TWIGS], ground: [MUDDY_GRASS, MUD], density: 0.01 },
      { blocks: [BlockIds.SEDGE], ground: [MUDDY_GRASS], density: 0.22 },
      { blocks: [BlockIds.SEDGE], ground: [MUD], density: 0.08 },
    ],
  })
}

/** Half the scatter of the other biomes: the desert should feel empty. */
export function desertGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 17,
    waterLevel: WATER_LEVEL,
    layers: [
      { blocks: [BlockIds.PRICKLY_PEAR_RIPE], ground: [SAND], density: 0.002 },
      { blocks: [BlockIds.ALOE], ground: [SAND], density: 0.0025 },
      { blocks: [BlockIds.BARREL_CACTUS], ground: [SAND], density: 0.004 },
      { blocks: [BlockIds.TUMBLEWEED], ground: [SAND], density: 0.0015 },
      { blocks: [BlockIds.DESERT_MARIGOLD], ground: [SAND], density: 0.15, zoneFrequency: 0.025, zoneThreshold: 0.82, zoneFade: 0.06 },
      { blocks: [BlockIds.DEAD_BUSH], ground: [SAND], density: 0.009 },
      { blocks: [BlockIds.PEBBLES], ground: [SAND], density: 0.008 },
      { blocks: [BlockIds.DRY_GRASS], ground: [SAND], density: 0.12, zoneFrequency: 0.02, zoneThreshold: 0.6, zoneFade: 0.2 },
      { blocks: [BlockIds.DRY_GRASS], ground: [SAND], density: 0.01 },
    ],
  })
}

/**
 * Volcanic: barely anything grows - rocks, smouldering embers, cinders and
 * obsidian on the basalt, and here and there a glowing ember lily.
 */
export function volcanicGroundCover(): GroundCoverFeature {
  return new GroundCoverFeature({
    salt: 18,
    waterLevel: WATER_LEVEL,
    layers: [
      { blocks: [BlockIds.EMBER_LILY], ground: [BASALT], density: 0.006 },
      { blocks: [BlockIds.FIREWEED], ground: [BASALT], density: 0.0015 },
      { blocks: [BlockIds.EMBERS], ground: [BASALT], density: 0.02 },
      { blocks: [BlockIds.OBSIDIAN_SHARDS], ground: [BASALT], density: 0.012 },
      { blocks: [BlockIds.VOLCANIC_ROCKS], ground: [BASALT], density: 0.05 },
      { blocks: [BlockIds.CINDERS], ground: [BASALT], density: 0.06 },
    ],
  })
}
