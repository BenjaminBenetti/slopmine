import type { IHarvestableBlock, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { FoliageBlock, type FoliageBlockOptions } from '../foliage_shared/FoliageBlock.ts'
import { RANDOM_TICK_INTERVAL } from '../../../blocktick/RandomBlockTicks.ts'
import { CelestiteShardItem } from '../../../../items/materials/celestite_shard/CelestiteShardItem.ts'
import { SpiderSilkItem } from '../../../../items/materials/spider_silk/SpiderSilkItem.ts'
import { GlowberriesItem } from '../../../../items/food/glowberries/GlowberriesItem.ts'
import { SulfurItem } from '../../../../items/ores/sulfur/SulfurItem.ts'
import { BoneItem } from '../../../../items/materials/bone/BoneItem.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import stalactiteUrl from './assets/stalactite_tip.webp'
import stalagmiteUrl from './assets/stalagmite_tip.webp'
import columnUrl from './assets/dripstone_column.webp'
import clusterUrl from './assets/celestite_cluster.webp'
import clusterGlowUrl from './assets/celestite_cluster_glow.webp'
import budUrl from './assets/celestite_bud.webp'
import budGlowUrl from './assets/celestite_bud_glow.webp'
import hangingCelestiteUrl from './assets/hanging_celestite.webp'
import hangingCelestiteGlowUrl from './assets/hanging_celestite_glow.webp'
import caveFernUrl from './assets/cave_fern.webp'
import glowBloomUrl from './assets/glow_bloom.webp'
import glowBloomGlowUrl from './assets/glow_bloom_glow.webp'
import caveMushroomsUrl from './assets/cave_mushrooms.webp'
import caveMushroomsGlowUrl from './assets/cave_mushrooms_glow.webp'
import puffballsUrl from './assets/puffballs.webp'
import sulfurUrl from './assets/sulfur_cluster.webp'
import sulfurGlowUrl from './assets/sulfur_cluster_glow.webp'
import eggSacUrl from './assets/egg_sac.webp'
import cobwebUrl from './assets/cobweb.webp'
import rootsUrl from './assets/hanging_roots.webp'
import vinesUrl from './assets/cave_vines.webp'
import vinesBerriesUrl from './assets/cave_vines_berries.webp'
import vinesBerriesGlowUrl from './assets/cave_vines_berries_glow.webp'
import glowwormUrl from './assets/glowworm_threads.webp'
import glowwormGlowUrl from './assets/glowworm_threads_glow.webp'
import bonesUrl from './assets/bone_pile.webp'
import snowUrl from './assets/snow_patch.webp'
import pearlsUrl from './assets/cave_pearls.webp'

function many(min: number, max: number, make: () => IItem): IItem[] {
  return Array.from({ length: min + Math.floor(Math.random() * (max - min + 1)) }, make)
}

/** Seconds, on average, for a bare cave vine to fruit again. */
const VINE_FRUIT_SECONDS = 180
/** Seconds, on average, for a vine tip to grow one segment longer. */
const VINE_GROW_SECONDS = 240
/** Longest a vine grows by itself (segments). */
const VINE_MAX_LENGTH = 6

/**
 * Cave vines (with or without glowberries): hang from a ceiling in chains;
 * the berried ones are picked with right-click or E (glowberries, the vine
 * stays), bare ones fruit again and their tips slowly grow downward
 * (random ticks).
 */
export class CaveVinesBlock extends FoliageBlock implements IHarvestableBlock {
  constructor(options: FoliageBlockOptions, private readonly berries: boolean) {
    super(options)
  }

  harvest(world: IWorld, x: bigint, y: bigint, z: bigint): IItem[] | null {
    if (!this.berries) return null
    world.setBlock(x, y, z, BlockIds.CAVE_VINES)
    return many(1, 2, () => new GlowberriesItem())
  }

  onRandomTick(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (this.berries) return
    if (Math.random() < RANDOM_TICK_INTERVAL / VINE_FRUIT_SECONDS) {
      world.setBlock(x, y, z, BlockIds.CAVE_VINES_BERRIES)
      return
    }
    // A tip with room below grows a segment, up to VINE_MAX_LENGTH
    if (Math.random() >= RANDOM_TICK_INTERVAL / VINE_GROW_SECONDS) return
    if (world.getBlock(x, y - 1n, z).properties.id !== BlockIds.AIR) return
    let length = 1
    while (length < VINE_MAX_LENGTH && isVine(world.getBlock(x, y + BigInt(length), z).properties.id)) length++
    if (length < VINE_MAX_LENGTH) world.setBlock(x, y - 1n, z, BlockIds.CAVE_VINES)
  }
}

function isVine(id: number): boolean {
  return id === BlockIds.CAVE_VINES || id === BlockIds.CAVE_VINES_BERRIES
}

const VINES = [BlockIds.CAVE_VINES, BlockIds.CAVE_VINES_BERRIES]

/**
 * The cave biomes' foliage: dripstone (stalactites and stalagmites are a tip
 * under/over column segments, each piece held by the next), celestite
 * crystals, cave plants and fungi, sulfur crystals, the webbed hollows'
 * egg sacs and cobwebs, hanging roots, cave vines and glowworm threads, and
 * flat floor doodads. Placed by the cave dressing (generate/caves/
 * CaveDressing.ts); all drawn by the foliage renderer, glowing ones with
 * glow maps (always on: caves are dark).
 */
export function createCavePlantBlocks(): FoliageBlock[] {
  const still = { sway: 0, jitter: 0, scaleVariation: 0.08 }
  return [
    new FoliageBlock({
      id: BlockIds.STALACTITE, name: 'stalactite', displayName: 'Stalactite', replaceable: false,
      foliage: { sprites: [stalactiteUrl], shape: 'hang', width: 0.75, height: 1, ...still, viewDistance: 96 },
      alsoSupportedBy: [BlockIds.STALACTITE_COLUMN],
    }),
    new FoliageBlock({
      id: BlockIds.STALACTITE_COLUMN, name: 'stalactite_column', displayName: 'Dripstone Column', replaceable: false,
      foliage: { sprites: [columnUrl], shape: 'hang', width: 0.75, height: 1, ...still, viewDistance: 96 },
      alsoSupportedBy: [BlockIds.STALACTITE_COLUMN],
      drops: () => [new PlantBlockItem('dripstone_column', 'Dripstone Column')],
    }),
    new FoliageBlock({
      id: BlockIds.STALAGMITE, name: 'stalagmite', displayName: 'Stalagmite', replaceable: false,
      foliage: { sprites: [stalagmiteUrl], shape: 'cross', width: 0.75, height: 1, ...still, viewDistance: 96 },
      alsoSupportedBy: [BlockIds.DRIPSTONE_COLUMN],
    }),
    new FoliageBlock({
      id: BlockIds.DRIPSTONE_COLUMN, name: 'dripstone_column', displayName: 'Dripstone Column', replaceable: false,
      foliage: { sprites: [columnUrl], shape: 'cross', width: 0.75, height: 1, ...still, viewDistance: 96 },
      alsoSupportedBy: [BlockIds.DRIPSTONE_COLUMN],
    }),
    new FoliageBlock({
      id: BlockIds.CELESTITE_CLUSTER, name: 'celestite_cluster', displayName: 'Celestite Cluster', replaceable: false, lightLevel: 4,
      foliage: { sprites: [clusterUrl], glowSprites: [clusterGlowUrl], glowStrength: 0.9, shape: 'cross', width: 0.85, height: 0.8, ...still, jitter: 0.15, viewDistance: 112 },
      drops: () => many(2, 3, () => new CelestiteShardItem()),
    }),
    new FoliageBlock({
      id: BlockIds.CELESTITE_BUD, name: 'celestite_bud', displayName: 'Celestite Bud', replaceable: false,
      foliage: { sprites: [budUrl], glowSprites: [budGlowUrl], glowStrength: 1.1, shape: 'cross', width: 0.7, height: 0.35, ...still, jitter: 0.25, viewDistance: 80 },
      drops: () => [new CelestiteShardItem()],
    }),
    new FoliageBlock({
      id: BlockIds.HANGING_CELESTITE, name: 'hanging_celestite', displayName: 'Hanging Celestite', replaceable: false, lightLevel: 4,
      foliage: { sprites: [hangingCelestiteUrl], glowSprites: [hangingCelestiteGlowUrl], glowStrength: 0.9, shape: 'hang', width: 0.85, height: 0.7, ...still, jitter: 0.15, viewDistance: 112 },
      drops: () => many(2, 3, () => new CelestiteShardItem()),
    }),
    new FoliageBlock({
      id: BlockIds.CAVE_FERN, name: 'cave_fern', displayName: 'Cave Fern',
      foliage: { sprites: [caveFernUrl], shape: 'cross', width: 0.95, height: 0.7, sway: 0.15, jitter: 0.25, scaleVariation: 0.2, viewDistance: 72 },
    }),
    new FoliageBlock({
      id: BlockIds.GLOW_BLOOM, name: 'glow_bloom', displayName: 'Glow Bloom',
      foliage: { sprites: [glowBloomUrl], glowSprites: [glowBloomGlowUrl], glowStrength: 1.6, shape: 'cross', width: 0.75, height: 0.55, sway: 0.1, jitter: 0.25, scaleVariation: 0.15, viewDistance: 88 },
    }),
    new FoliageBlock({
      id: BlockIds.CAVE_MUSHROOMS, name: 'cave_mushrooms', displayName: 'Cave Mushrooms',
      foliage: { sprites: [caveMushroomsUrl], glowSprites: [caveMushroomsGlowUrl], glowStrength: 1.5, shape: 'cross', width: 0.75, height: 0.45, ...still, jitter: 0.25, scaleVariation: 0.2, viewDistance: 80 },
    }),
    new FoliageBlock({
      id: BlockIds.PUFFBALLS, name: 'puffballs', displayName: 'Puffballs',
      foliage: { sprites: [puffballsUrl], shape: 'cross', width: 0.7, height: 0.4, ...still, jitter: 0.25, scaleVariation: 0.2, viewDistance: 64 },
    }),
    new FoliageBlock({
      id: BlockIds.SULFUR_CLUSTER, name: 'sulfur_cluster', displayName: 'Sulfur Cluster', replaceable: false,
      foliage: { sprites: [sulfurUrl], glowSprites: [sulfurGlowUrl], glowStrength: 0.8, shape: 'cross', width: 0.8, height: 0.6, ...still, jitter: 0.2, viewDistance: 96 },
      drops: () => many(1, 2, () => new SulfurItem()),
    }),
    new FoliageBlock({
      id: BlockIds.EGG_SAC, name: 'egg_sac', displayName: 'Egg Sac', replaceable: false,
      foliage: { sprites: [eggSacUrl], shape: 'cross', width: 0.7, height: 0.55, ...still, jitter: 0.2, viewDistance: 72 },
      drops: () => many(1, 2, () => new SpiderSilkItem()),
    }),
    new FoliageBlock({
      id: BlockIds.COBWEB, name: 'cobweb', displayName: 'Cobweb', freestanding: true,
      foliage: { sprites: [cobwebUrl], shape: 'cross', width: 1.3, height: 1, spriteHeight: 1, ...still, viewDistance: 72 },
      drops: () => many(1, 2, () => new SpiderSilkItem()),
    }),
    new FoliageBlock({
      id: BlockIds.HANGING_ROOTS, name: 'hanging_roots', displayName: 'Hanging Roots',
      foliage: { sprites: [rootsUrl], shape: 'hang', width: 1, height: 0.9, sway: 0.25, jitter: 0.15, scaleVariation: 0.15, viewDistance: 80 },
      alsoSupportedBy: [BlockIds.HANGING_ROOTS],
      drops: () => [],
    }),
    new CaveVinesBlock({
      id: BlockIds.CAVE_VINES, name: 'cave_vines', displayName: 'Cave Vines',
      foliage: { sprites: [vinesUrl], shape: 'hang', width: 0.9, height: 1, sway: 0.3, jitter: 0.1, scaleVariation: 0.05, viewDistance: 88 },
      alsoSupportedBy: VINES,
      drops: () => [],
    }, false),
    new CaveVinesBlock({
      id: BlockIds.CAVE_VINES_BERRIES, name: 'cave_vines_berries', displayName: 'Cave Vines', lightLevel: 7,
      foliage: { sprites: [vinesBerriesUrl], glowSprites: [vinesBerriesGlowUrl], glowStrength: 1.4, shape: 'hang', width: 0.9, height: 1, sway: 0.3, jitter: 0.1, scaleVariation: 0.05, viewDistance: 96 },
      alsoSupportedBy: VINES,
      drops: () => many(1, 2, () => new GlowberriesItem()),
    }, true),
    new FoliageBlock({
      id: BlockIds.GLOWWORM_THREADS, name: 'glowworm_threads', displayName: 'Glowworm Threads',
      foliage: { sprites: [glowwormUrl], glowSprites: [glowwormGlowUrl], glowStrength: 2.2, shape: 'hang', width: 1.1, height: 1, sway: 0.12, jitter: 0.2, scaleVariation: 0.1, viewDistance: 112 },
      alsoSupportedBy: [BlockIds.GLOWWORM_THREADS],
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.CAVE_BONES, name: 'cave_bones', displayName: 'Bones',
      foliage: { sprites: [bonesUrl], shape: 'flat', width: 0.9, height: 0, ...still, jitter: 0.2, viewDistance: 56 },
      drops: () => many(1, 2, () => new BoneItem()),
    }),
    new FoliageBlock({
      id: BlockIds.SNOW_PATCH, name: 'snow_patch', displayName: 'Snow Patch',
      foliage: { sprites: [snowUrl], shape: 'flat', width: 1, height: 0, ...still, jitter: 0.2, viewDistance: 56 },
      drops: () => [],
    }),
    new FoliageBlock({
      id: BlockIds.CAVE_PEARLS, name: 'cave_pearls', displayName: 'Cave Pearls',
      foliage: { sprites: [pearlsUrl], shape: 'flat', width: 0.8, height: 0, ...still, jitter: 0.2, viewDistance: 56 },
      drops: () => [],
    }),
  ]
}

/** Cave plants that drop themselves (each gets a block item). */
export const CAVE_PLANT_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ['stalactite', 'Stalactite'],
  ['stalagmite', 'Stalagmite'],
  ['dripstone_column', 'Dripstone Column'],
  ['cave_fern', 'Cave Fern'],
  ['glow_bloom', 'Glow Bloom'],
  ['cave_mushrooms', 'Cave Mushrooms'],
  ['puffballs', 'Puffballs'],
]
