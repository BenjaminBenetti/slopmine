import { BlockIds } from '../../BlockIds.ts'
import { FoliageBlock } from '../foliage_shared/FoliageBlock.ts'
import { StickItem } from '../../../../items/materials/stick/StickItem.ts'
import { Wheat1BlockItem } from '../../../../items/blocks/wheat/Wheat1BlockItem.ts'
import { PineconeItem } from '../../../../items/materials/pinecone/PineconeItem.ts'
import { SeaShellBlockItem } from '../../../../items/blocks/sea_shell/SeaShellBlockItem.ts'
import { AloeLeafItem } from '../../../../items/food/aloe_leaf/AloeLeafItem.ts'
import aloeUrl from './assets/aloe.webp'
import ashGrassUrl from './assets/ash_grass.webp'
import barrelCactusUrl from './assets/barrel_cactus.webp'
import beachGrassUrl from './assets/beach_grass.webp'
import beachShellsUrl from './assets/beach_shells.webp'
import bogCottonUrl from './assets/bog_cotton.webp'
import brackenUrl from './assets/bracken.webp'
import brownMushroomsUrl from './assets/brown_mushrooms.webp'
import cindersUrl from './assets/cinders.webp'
import cloverUrl from './assets/clover.webp'
import daisyUrl from './assets/daisy.webp'
import dandelionUrl from './assets/dandelion.webp'
import deadBushUrl from './assets/dead_bush.webp'
import desertMarigoldUrl from './assets/desert_marigold.webp'
import driftwoodUrl from './assets/driftwood.webp'
import dryGrassUrl from './assets/dry_grass.webp'
import elephantEarUrl from './assets/elephant_ear.webp'
import emberLilyUrl from './assets/ember_lily.webp'
import fireweedUrl from './assets/fireweed.webp'
import foxgloveUrl from './assets/foxglove.webp'
import frostedGrassUrl from './assets/frosted_grass.webp'
import heatherUrl from './assets/heather.webp'
import heliconiaUrl from './assets/heliconia.webp'
import horsetailUrl from './assets/horsetail.webp'
import jungleGrassUrl from './assets/jungle_grass.webp'
import lavenderUrl from './assets/lavender.webp'
import leafLitterUrl from './assets/leaf_litter.webp'
import lilyPadUrl from './assets/lily_pad.webp'
import needleLitterUrl from './assets/needle_litter.webp'
import obsidianShardsUrl from './assets/obsidian_shards.webp'
import orchidUrl from './assets/orchid.webp'
import pebblesUrl from './assets/pebbles.webp'
import salalUrl from './assets/salal.webp'
import seaThriftUrl from './assets/sea_thrift.webp'
import sedgeUrl from './assets/sedge.webp'
import shortGrassUrl from './assets/short_grass.webp'
import shortGrassBUrl from './assets/short_grass_b.webp'
import tallGrassUrl from './assets/tall_grass.webp'
import tallGrassBUrl from './assets/tall_grass_b.webp'
import toadstoolUrl from './assets/toadstool.webp'
import tumbleweedUrl from './assets/tumbleweed.webp'
import twigsUrl from './assets/twigs.webp'
import waterLilyUrl from './assets/water_lily.webp'
import wildBushUrl from './assets/wild_bush.webp'
import emberLilyGlowUrl from './assets/ember_lily_glow.webp'
import embersUrl from './assets/embers.webp'
import embersGlowUrl from './assets/embers_glow.webp'
import volcanicRocksUrl from './assets/volcanic_rocks.webp'

const WATER_SOURCES = [BlockIds.WATER, BlockIds.SWAMP_WATER]

/**
 * The Nature Update's wild plants and ground doodads: every grass, flower,
 * bush and doodad of the overworld biomes is a FoliageBlock described here
 * (sprite, size, sway, how far it is drawn, what breaking it gives). They are
 * placed by the biomes' GroundCoverFeature layers and drawn by the batched
 * foliage renderer. Undeclared drops = the plant's own block item
 * (items/nature/registerNatureItems.ts registers one per plant).
 */
export function createWildPlantBlocks(): FoliageBlock[] {
  return [
    new FoliageBlock({
      id: BlockIds.SHORT_GRASS,
      name: 'short_grass',
      displayName: 'Short Grass',
      foliage: { sprites: [shortGrassUrl, shortGrassBUrl], shape: 'cross', width: 1.0, height: 0.5, sway: 1.0, jitter: 0.3, scaleVariation: 0.25, viewDistance: 56 },
      drops: () => (Math.random() < 0.08 ? [new Wheat1BlockItem()] : []),
    }),
    new FoliageBlock({
      id: BlockIds.TALL_GRASS,
      name: 'tall_grass',
      displayName: 'Tall Grass',
      foliage: { sprites: [tallGrassUrl, tallGrassBUrl], shape: 'cross', width: 1.0, height: 1.0, sway: 1.0, jitter: 0.25, scaleVariation: 0.2, viewDistance: 72 },
      drops: () => (Math.random() < 0.12 ? [new Wheat1BlockItem()] : []),
    }),
    new FoliageBlock({
      id: BlockIds.CLOVER,
      name: 'clover',
      displayName: 'Clover',
      foliage: { sprites: [cloverUrl], shape: 'cross', width: 1.0, height: 0.3, sway: 0.4, jitter: 0.3, scaleVariation: 0.2, viewDistance: 48 },
    }),
    new FoliageBlock({
      id: BlockIds.DAISY,
      name: 'daisy',
      displayName: 'Daisy',
      foliage: { sprites: [daisyUrl], shape: 'cross', width: 0.8, height: 0.55, sway: 0.6, jitter: 0.25, scaleVariation: 0.15, viewDistance: 72 },
    }),
    new FoliageBlock({
      id: BlockIds.DANDELION,
      name: 'dandelion',
      displayName: 'Dandelion',
      foliage: { sprites: [dandelionUrl], shape: 'cross', width: 0.8, height: 0.5, sway: 0.6, jitter: 0.25, scaleVariation: 0.15, viewDistance: 72 },
    }),
    new FoliageBlock({
      id: BlockIds.LAVENDER,
      name: 'lavender',
      displayName: 'Lavender',
      foliage: { sprites: [lavenderUrl], shape: 'cross', width: 0.85, height: 0.75, sway: 0.5, jitter: 0.2, scaleVariation: 0.15, viewDistance: 80 },
    }),
    new FoliageBlock({
      id: BlockIds.FOXGLOVE,
      name: 'foxglove',
      displayName: 'Foxglove',
      foliage: { sprites: [foxgloveUrl], shape: 'cross', width: 0.9, height: 1.0, sway: 0.45, jitter: 0.2, scaleVariation: 0.15, viewDistance: 96 },
    }),
    new FoliageBlock({
      id: BlockIds.WILD_BUSH,
      name: 'wild_bush',
      displayName: 'Wild Bush',
      foliage: { sprites: [wildBushUrl], shape: 'cross', width: 1.05, height: 0.9, sway: 0.2, jitter: 0.15, scaleVariation: 0.15, viewDistance: 112 },
    }),
    new FoliageBlock({
      id: BlockIds.HEATHER,
      name: 'heather',
      displayName: 'Heather',
      foliage: { sprites: [heatherUrl], shape: 'cross', width: 1.0, height: 0.45, sway: 0.3, jitter: 0.25, scaleVariation: 0.2, viewDistance: 72 },
    }),
    new FoliageBlock({
      id: BlockIds.BRACKEN,
      name: 'bracken',
      displayName: 'Bracken',
      foliage: { sprites: [brackenUrl], shape: 'cross', width: 1.0, height: 0.9, sway: 0.5, jitter: 0.2, scaleVariation: 0.2, viewDistance: 96 },
    }),
    new FoliageBlock({
      id: BlockIds.TOADSTOOL,
      name: 'toadstool',
      displayName: 'Toadstool',
      foliage: { sprites: [toadstoolUrl], shape: 'cross', width: 0.7, height: 0.45, sway: 0.0, jitter: 0.25, scaleVariation: 0.2, viewDistance: 64 },
    }),
    new FoliageBlock({
      id: BlockIds.BROWN_MUSHROOMS,
      name: 'brown_mushrooms',
      displayName: 'Brown Mushrooms',
      foliage: { sprites: [brownMushroomsUrl], shape: 'cross', width: 0.7, height: 0.4, sway: 0.0, jitter: 0.25, scaleVariation: 0.2, viewDistance: 64 },
    }),
    new FoliageBlock({
      id: BlockIds.DEAD_BUSH,
      name: 'dead_bush',
      displayName: 'Dead Bush',
      foliage: { sprites: [deadBushUrl], shape: 'cross', width: 1.0, height: 0.8, sway: 0.15, jitter: 0.2, scaleVariation: 0.2, viewDistance: 96 },
      drops: () => Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => new StickItem()),
    }),
    new FoliageBlock({
      id: BlockIds.DRY_GRASS,
      name: 'dry_grass',
      displayName: 'Dry Grass',
      foliage: { sprites: [dryGrassUrl], shape: 'cross', width: 1.0, height: 0.5, sway: 0.9, jitter: 0.3, scaleVariation: 0.25, viewDistance: 56 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.BARREL_CACTUS,
      name: 'barrel_cactus',
      displayName: 'Barrel Cactus',
      foliage: { sprites: [barrelCactusUrl], shape: 'cross', width: 0.75, height: 0.55, sway: 0.0, jitter: 0.2, scaleVariation: 0.2, viewDistance: 96 },
    }),
    new FoliageBlock({
      id: BlockIds.DESERT_MARIGOLD,
      name: 'desert_marigold',
      displayName: 'Desert Marigold',
      foliage: { sprites: [desertMarigoldUrl], shape: 'cross', width: 0.8, height: 0.5, sway: 0.5, jitter: 0.25, scaleVariation: 0.15, viewDistance: 72 },
    }),
    new FoliageBlock({
      id: BlockIds.TUMBLEWEED,
      name: 'tumbleweed',
      displayName: 'Tumbleweed',
      foliage: { sprites: [tumbleweedUrl], shape: 'cross', width: 0.9, height: 0.7, sway: 0.1, jitter: 0.2, scaleVariation: 0.2, viewDistance: 96 },
      drops: () => Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => new StickItem()),
    }),
    new FoliageBlock({
      id: BlockIds.ALOE,
      name: 'aloe',
      displayName: 'Aloe',
      foliage: { sprites: [aloeUrl], shape: 'cross', width: 0.85, height: 0.6, sway: 0.1, jitter: 0.2, scaleVariation: 0.15, viewDistance: 80 },
      drops: () => Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => new AloeLeafItem()),
    }),
    new FoliageBlock({
      id: BlockIds.ASH_GRASS,
      name: 'ash_grass',
      displayName: 'Ash Grass',
      foliage: { sprites: [ashGrassUrl], shape: 'cross', width: 1.0, height: 0.45, sway: 0.6, jitter: 0.3, scaleVariation: 0.25, viewDistance: 56 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.FIREWEED,
      name: 'fireweed',
      displayName: 'Fireweed',
      foliage: { sprites: [fireweedUrl], shape: 'cross', width: 0.85, height: 1.0, sway: 0.45, jitter: 0.2, scaleVariation: 0.15, viewDistance: 96 },
    }),
    new FoliageBlock({
      id: BlockIds.EMBER_LILY,
      name: 'ember_lily',
      displayName: 'Ember Lily',
      foliage: { sprites: [emberLilyUrl], shape: 'cross', width: 0.8, height: 0.6, sway: 0.3, jitter: 0.2, scaleVariation: 0.15, viewDistance: 96, glowSprites: [emberLilyGlowUrl], glowStrength: 1.3 },
      lightLevel: 6,
    }),
    new FoliageBlock({
      id: BlockIds.SEDGE,
      name: 'sedge',
      displayName: 'Sedge',
      foliage: { sprites: [sedgeUrl], shape: 'cross', width: 1.0, height: 0.65, sway: 0.8, jitter: 0.3, scaleVariation: 0.2, viewDistance: 64 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.HORSETAIL,
      name: 'horsetail',
      displayName: 'Horsetail',
      foliage: { sprites: [horsetailUrl], shape: 'cross', width: 0.9, height: 0.8, sway: 0.3, jitter: 0.25, scaleVariation: 0.2, viewDistance: 80 },
    }),
    new FoliageBlock({
      id: BlockIds.BOG_COTTON,
      name: 'bog_cotton',
      displayName: 'Bog Cotton',
      foliage: { sprites: [bogCottonUrl], shape: 'cross', width: 0.85, height: 0.65, sway: 0.7, jitter: 0.25, scaleVariation: 0.15, viewDistance: 80 },
    }),
    new FoliageBlock({
      id: BlockIds.JUNGLE_GRASS,
      name: 'jungle_grass',
      displayName: 'Jungle Grass',
      foliage: { sprites: [jungleGrassUrl], shape: 'cross', width: 1.05, height: 0.6, sway: 0.8, jitter: 0.3, scaleVariation: 0.2, viewDistance: 64 },
      drops: () => (Math.random() < 0.08 ? [new Wheat1BlockItem()] : []),
    }),
    new FoliageBlock({
      id: BlockIds.ORCHID,
      name: 'orchid',
      displayName: 'Orchid',
      foliage: { sprites: [orchidUrl], shape: 'cross', width: 0.85, height: 0.6, sway: 0.4, jitter: 0.2, scaleVariation: 0.15, viewDistance: 80 },
    }),
    new FoliageBlock({
      id: BlockIds.HELICONIA,
      name: 'heliconia',
      displayName: 'Heliconia',
      foliage: { sprites: [heliconiaUrl], shape: 'cross', width: 1.0, height: 1.0, sway: 0.3, jitter: 0.15, scaleVariation: 0.15, viewDistance: 112 },
    }),
    new FoliageBlock({
      id: BlockIds.ELEPHANT_EAR,
      name: 'elephant_ear',
      displayName: 'Elephant Ear',
      foliage: { sprites: [elephantEarUrl], shape: 'cross', width: 1.1, height: 1.0, sway: 0.25, jitter: 0.15, scaleVariation: 0.15, viewDistance: 112 },
    }),
    new FoliageBlock({
      id: BlockIds.BEACH_GRASS,
      name: 'beach_grass',
      displayName: 'Beach Grass',
      foliage: { sprites: [beachGrassUrl], shape: 'cross', width: 1.0, height: 0.85, sway: 1.0, jitter: 0.25, scaleVariation: 0.2, viewDistance: 80 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.SEA_THRIFT,
      name: 'sea_thrift',
      displayName: 'Sea Thrift',
      foliage: { sprites: [seaThriftUrl], shape: 'cross', width: 0.8, height: 0.45, sway: 0.5, jitter: 0.25, scaleVariation: 0.15, viewDistance: 72 },
    }),
    new FoliageBlock({
      id: BlockIds.SALAL,
      name: 'salal',
      displayName: 'Salal',
      foliage: { sprites: [salalUrl], shape: 'cross', width: 1.0, height: 0.8, sway: 0.2, jitter: 0.15, scaleVariation: 0.15, viewDistance: 96 },
    }),
    new FoliageBlock({
      id: BlockIds.FROSTED_GRASS,
      name: 'frosted_grass',
      displayName: 'Frosted Grass',
      foliage: { sprites: [frostedGrassUrl], shape: 'cross', width: 1.0, height: 0.5, sway: 0.6, jitter: 0.3, scaleVariation: 0.25, viewDistance: 56 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.LILY_PAD,
      name: 'lily_pad',
      displayName: 'Lily Pad',
      foliage: { sprites: [lilyPadUrl], shape: 'flat', width: 0.95, height: 0, sway: 0, jitter: 0.15, scaleVariation: 0.1, viewDistance: 72 },
      floatsOn: WATER_SOURCES,
    }),
    new FoliageBlock({
      id: BlockIds.WATER_LILY,
      name: 'water_lily',
      displayName: 'Water Lily',
      foliage: { sprites: [waterLilyUrl], shape: 'flat', width: 0.95, height: 0, sway: 0, jitter: 0.15, scaleVariation: 0.1, viewDistance: 80 },
      floatsOn: WATER_SOURCES,
    }),
    new FoliageBlock({
      id: BlockIds.PEBBLES,
      name: 'pebbles',
      displayName: 'Pebbles',
      foliage: { sprites: [pebblesUrl], shape: 'flat', width: 0.9, height: 0, sway: 0, jitter: 0.2, scaleVariation: 0.15, viewDistance: 40 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.TWIGS,
      name: 'twigs',
      displayName: 'Twigs',
      foliage: { sprites: [twigsUrl], shape: 'flat', width: 0.9, height: 0, sway: 0, jitter: 0.2, scaleVariation: 0.15, viewDistance: 40 },
      drops: () => [new StickItem()],
    }),
    new FoliageBlock({
      id: BlockIds.LEAF_LITTER,
      name: 'leaf_litter',
      displayName: 'Leaf Litter',
      foliage: { sprites: [leafLitterUrl], shape: 'flat', width: 1.0, height: 0, sway: 0, jitter: 0.25, scaleVariation: 0.1, viewDistance: 48 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.NEEDLE_LITTER,
      name: 'needle_litter',
      displayName: 'Needle Litter',
      foliage: { sprites: [needleLitterUrl], shape: 'flat', width: 1.0, height: 0, sway: 0, jitter: 0.25, scaleVariation: 0.1, viewDistance: 48 },
      drops: () => (Math.random() < 0.25 ? [new PineconeItem()] : []),
    }),
    new FoliageBlock({
      id: BlockIds.CINDERS,
      name: 'cinders',
      displayName: 'Cinders',
      foliage: { sprites: [cindersUrl], shape: 'flat', width: 0.9, height: 0, sway: 0, jitter: 0.2, scaleVariation: 0.15, viewDistance: 48 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.OBSIDIAN_SHARDS,
      name: 'obsidian_shards',
      displayName: 'Obsidian Shards',
      foliage: { sprites: [obsidianShardsUrl], shape: 'flat', width: 0.8, height: 0, sway: 0, jitter: 0.2, scaleVariation: 0.15, viewDistance: 48 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.BEACH_SHELLS,
      name: 'beach_shells',
      displayName: 'Beach Shells',
      foliage: { sprites: [beachShellsUrl], shape: 'flat', width: 0.9, height: 0, sway: 0, jitter: 0.2, scaleVariation: 0.15, viewDistance: 48 },
      drops: () => [new SeaShellBlockItem()],
    }),
    new FoliageBlock({
      id: BlockIds.DRIFTWOOD,
      name: 'driftwood',
      displayName: 'Driftwood',
      foliage: { sprites: [driftwoodUrl], shape: 'flat', width: 1.0, height: 0, sway: 0, jitter: 0.15, scaleVariation: 0.15, viewDistance: 56 },
      drops: () => [new StickItem(), new StickItem()],
    }),
    new FoliageBlock({
      id: BlockIds.EMBERS,
      name: 'embers',
      displayName: 'Embers',
      foliage: { sprites: [embersUrl], glowSprites: [embersGlowUrl], glowStrength: 1.6, shape: 'flat', width: 0.9, height: 0, sway: 0, jitter: 0.2, scaleVariation: 0.15, viewDistance: 72 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.VOLCANIC_ROCKS,
      name: 'volcanic_rocks',
      displayName: 'Volcanic Rocks',
      foliage: { sprites: [volcanicRocksUrl], shape: 'flat', width: 1.0, height: 0, sway: 0, jitter: 0.2, scaleVariation: 0.15, viewDistance: 56 },
      drops: () => [],
    }),
  ]
}

/** Block names of the wild plants that drop themselves (each has a PlantBlockItem). */
export const WILD_PLANT_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ['clover', 'Clover'],
  ['daisy', 'Daisy'],
  ['dandelion', 'Dandelion'],
  ['lavender', 'Lavender'],
  ['foxglove', 'Foxglove'],
  ['wild_bush', 'Wild Bush'],
  ['heather', 'Heather'],
  ['bracken', 'Bracken'],
  ['toadstool', 'Toadstool'],
  ['brown_mushrooms', 'Brown Mushrooms'],
  ['barrel_cactus', 'Barrel Cactus'],
  ['desert_marigold', 'Desert Marigold'],
  ['fireweed', 'Fireweed'],
  ['ember_lily', 'Ember Lily'],
  ['horsetail', 'Horsetail'],
  ['bog_cotton', 'Bog Cotton'],
  ['orchid', 'Orchid'],
  ['heliconia', 'Heliconia'],
  ['elephant_ear', 'Elephant Ear'],
  ['sea_thrift', 'Sea Thrift'],
  ['salal', 'Salal'],
  ['lily_pad', 'Lily Pad'],
  ['water_lily', 'Water Lily'],
]
