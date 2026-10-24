import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FLOOR as F, CEILING as C } from '../molten_decor/DecorGeometry.ts'
import { PoiDecorBlock, type PoiDecorSpec } from './PoiDecorBlock.ts'
import { RuneShardItem } from '../../../../items/materials/rune_shard/RuneShardItem.ts'
import { SpiderSilkItem } from '../../../../items/materials/spider_silk/SpiderSilkItem.ts'

const several = <T>(min: number, max: number, make: () => T): T[] =>
  Array.from({ length: min + Math.floor(Math.random() * (max - min + 1)) }, make)

/**
 * The points of interest's decorations, as data: box models in cell space
 * (-0.5..0.5, front facing +Z, turned by the metadata facing), one colour
 * per material index. Each drops itself unless it says otherwise.
 */
const SPECS: readonly PoiDecorSpec[] = [
  {
    // A heap of gold with gems and a goblet
    id: BlockIds.TREASURE_HOARD, name: 'treasure_hoard', displayName: 'Treasure Hoard', textureId: TextureId.TREASURE_HOARD,
    colors: [{ color: 0xb8862a }, { color: 0xf2c94c }, { color: 0xd83a30, glow: true }, { color: 0x4a7fe0, glow: true }, { color: 0x34b866, glow: true }],
    boxes: [
      { w: 0.9, h: 0.12, d: 0.84, x: 0, y: F, z: 0, m: 0 },
      { w: 0.7, h: 0.12, d: 0.64, x: 0.03, y: F + 0.12, z: -0.02, m: 0 },
      { w: 0.46, h: 0.1, d: 0.42, x: -0.04, y: F + 0.24, z: 0.02, m: 1 },
      { w: 0.22, h: 0.08, d: 0.2, x: 0.02, y: F + 0.34, z: 0, m: 1 },
      { w: 0.1, h: 0.1, d: 0.1, x: 0.22, y: F + 0.22, z: -0.16, m: 2, ry: 0.7 },
      { w: 0.09, h: 0.09, d: 0.09, x: -0.28, y: F + 0.12, z: 0.22, m: 3, ry: 0.3 },
      { w: 0.08, h: 0.08, d: 0.08, x: -0.18, y: F + 0.24, z: -0.2, m: 4, ry: 0.5 },
      { w: 0.07, h: 0.14, d: 0.07, x: 0.3, y: F + 0.12, z: 0.2, m: 1 }, // goblet
      { w: 0.14, h: 0.08, d: 0.14, x: 0.3, y: F + 0.26, z: 0.2, m: 1 },
      { w: 0.12, h: 0.03, d: 0.12, x: 0.4, y: F, z: -0.38, m: 1 }, // stray coins
      { w: 0.1, h: 0.03, d: 0.1, x: -0.42, y: F, z: -0.4, m: 1 },
    ],
    hardness: 1, force: 0, tags: [], interaction: [0.04, 0, 0.04, 0.96, 0.42, 0.96],
  },
  {
    // Coin stacks and loose coins on the floor
    id: BlockIds.GOLD_COINS, name: 'gold_coins', displayName: 'Gold Coins', textureId: TextureId.GOLD_COINS,
    colors: [{ color: 0xb8862a }, { color: 0xf2c94c }],
    boxes: [
      { w: 0.13, h: 0.06, d: 0.13, x: -0.2, y: F, z: 0.1, m: 0 },
      { w: 0.12, h: 0.03, d: 0.12, x: -0.2, y: F + 0.06, z: 0.1, m: 1 },
      { w: 0.13, h: 0.09, d: 0.13, x: 0.18, y: F, z: -0.15, m: 0 },
      { w: 0.12, h: 0.03, d: 0.12, x: 0.18, y: F + 0.09, z: -0.15, m: 1 },
      { w: 0.11, h: 0.025, d: 0.11, x: 0.25, y: F, z: 0.28, m: 1, ry: 0.4 },
      { w: 0.11, h: 0.025, d: 0.11, x: -0.32, y: F, z: -0.3, m: 1, ry: 0.9 },
      { w: 0.11, h: 0.025, d: 0.11, x: 0.02, y: F, z: -0.38, m: 0, ry: 0.2 },
      { w: 0.11, h: 0.025, d: 0.11, x: -0.05, y: F, z: 0.36, m: 1, ry: 1.1 },
      { w: 0.11, h: 0.025, d: 0.11, x: 0.38, y: F, z: -0.02, m: 0, ry: 0.6 },
    ],
    hardness: 0.3, force: 0, tags: [], interaction: [0.1, 0, 0.1, 0.9, 0.14, 0.9],
  },
  {
    // A dragon's egg: dark scaled shell with glowing violet flecks
    id: BlockIds.DRAGON_EGG, name: 'dragon_egg', displayName: 'Dragon Egg', textureId: TextureId.DRAGON_EGG,
    colors: [{ color: 0x2b1b38 }, { color: 0x4a2e5e }, { color: 0xc070ff, glow: true }],
    boxes: [
      { w: 0.34, h: 0.08, d: 0.34, x: 0, y: F, z: 0, m: 0 },
      { w: 0.46, h: 0.1, d: 0.46, x: 0, y: F + 0.08, z: 0, m: 0 },
      { w: 0.52, h: 0.16, d: 0.52, x: 0, y: F + 0.18, z: 0, m: 1 },
      { w: 0.5, h: 0.14, d: 0.5, x: 0, y: F + 0.34, z: 0, m: 0 },
      { w: 0.42, h: 0.12, d: 0.42, x: 0, y: F + 0.48, z: 0, m: 1 },
      { w: 0.32, h: 0.1, d: 0.32, x: 0, y: F + 0.6, z: 0, m: 0 },
      { w: 0.18, h: 0.07, d: 0.18, x: 0, y: F + 0.7, z: 0, m: 0 },
      { w: 0.05, h: 0.05, d: 0.05, x: 0.25, y: F + 0.26, z: 0.05, m: 2 },
      { w: 0.05, h: 0.05, d: 0.05, x: -0.24, y: F + 0.38, z: -0.08, m: 2 },
      { w: 0.05, h: 0.05, d: 0.05, x: 0.08, y: F + 0.52, z: 0.2, m: 2 },
      { w: 0.05, h: 0.05, d: 0.05, x: -0.1, y: F + 0.2, z: -0.25, m: 2 },
    ],
    hardness: 1.5, force: 0, tags: [], lightLevel: 4, interaction: [0.22, 0, 0.22, 0.78, 0.78, 0.78],
  },
  {
    id: BlockIds.SKULL, name: 'skull', displayName: 'Skull', textureId: TextureId.SKULL,
    colors: [{ color: 0xd6ceb4 }, { color: 0x2a2420 }, { color: 0xb8ae94 }],
    boxes: [
      { w: 0.4, h: 0.3, d: 0.42, x: 0, y: F + 0.08, z: -0.02, m: 0 },
      { w: 0.34, h: 0.1, d: 0.12, x: 0, y: F + 0.04, z: 0.15, m: 2 },
      { w: 0.3, h: 0.05, d: 0.28, x: 0, y: F, z: 0.05, m: 2 },
      { w: 0.1, h: 0.08, d: 0.02, x: -0.09, y: F + 0.2, z: 0.195, m: 1 },
      { w: 0.1, h: 0.08, d: 0.02, x: 0.09, y: F + 0.2, z: 0.195, m: 1 },
      { w: 0.05, h: 0.06, d: 0.02, x: 0, y: F + 0.12, z: 0.215, m: 1 },
    ],
    hardness: 0.5, force: 0, tags: [], interaction: [0.28, 0, 0.26, 0.72, 0.4, 0.74],
  },
  {
    // A bedroll, its rolled head end toward -Z
    id: BlockIds.BEDROLL, name: 'bedroll', displayName: 'Bedroll', textureId: TextureId.BEDROLL,
    colors: [{ color: 0x8a3a2a }, { color: 0x6e2c20 }, { color: 0xc8b48e }, { color: 0x5a4632 }],
    boxes: [
      { w: 0.62, h: 0.07, d: 0.92, x: 0, y: F, z: 0.02, m: 0 },
      { w: 0.63, h: 0.072, d: 0.06, x: 0, y: F, z: -0.08, m: 1 },
      { w: 0.63, h: 0.072, d: 0.06, x: 0, y: F, z: 0.24, m: 1 },
      { w: 0.64, h: 0.16, d: 0.2, x: 0, y: F, z: -0.36, m: 2 },
      { w: 0.66, h: 0.17, d: 0.04, x: 0, y: F, z: -0.36, m: 3 },
    ],
    hardness: 0.3, force: 0, tags: [], interaction: [0.15, 0, 0.02, 0.85, 0.18, 0.98],
  },
  {
    // A stone pedestal holding a slate tablet of glowing runes
    id: BlockIds.RUNE_PEDESTAL, name: 'rune_pedestal', displayName: 'Rune Pedestal', textureId: TextureId.RUNE_PEDESTAL,
    colors: [{ color: 0x6c716d }, { color: 0x575c59 }, { color: 0x5fe6d4, glow: true }, { color: 0x3a4048 }],
    boxes: [
      { w: 0.72, h: 0.12, d: 0.72, x: 0, y: F, z: 0, m: 1 },
      { w: 0.46, h: 0.62, d: 0.46, x: 0, y: F + 0.12, z: 0, m: 0 },
      { w: 0.7, h: 0.1, d: 0.7, x: 0, y: F + 0.74, z: 0, m: 1 },
      { w: 0.46, h: 0.06, d: 0.36, x: 0, y: F + 0.84, z: 0, m: 3 },
      { w: 0.06, h: 0.012, d: 0.24, x: -0.1, y: F + 0.9, z: 0, m: 2 },
      { w: 0.18, h: 0.012, d: 0.05, x: 0.02, y: F + 0.9, z: -0.06, m: 2, ry: 0.6 },
      { w: 0.05, h: 0.012, d: 0.18, x: 0.13, y: F + 0.9, z: 0.03, m: 2 },
      { w: 0.05, h: 0.3, d: 0.012, x: 0, y: F + 0.24, z: 0.236, m: 2 },
      { w: 0.16, h: 0.04, d: 0.012, x: 0, y: F + 0.44, z: 0.236, m: 2 },
      { w: 0.1, h: 0.04, d: 0.012, x: 0.04, y: F + 0.3, z: 0.236, m: 2, ry: 0 },
    ],
    hardness: 3, force: 1, tags: [BlockTags.ROCK], lightLevel: 7,
    collision: [0.14, 0, 0.14, 0.86, 0.9, 0.86], interaction: [0.14, 0, 0.14, 0.86, 0.92, 0.86],
    drops: () => several(2, 3, () => new RuneShardItem()),
  },
  {
    id: BlockIds.BOOK_PILE, name: 'book_pile', displayName: 'Pile of Books', textureId: TextureId.BOOK_PILE,
    colors: [{ color: 0x6a2e2a }, { color: 0x3f5034 }, { color: 0x3a4658 }, { color: 0x5e4630 }, { color: 0xd8caa0 }],
    boxes: [
      { w: 0.46, h: 0.08, d: 0.34, x: -0.06, y: F, z: -0.06, m: 0, ry: 0.1 },
      { w: 0.42, h: 0.07, d: 0.3, x: -0.04, y: F + 0.08, z: -0.05, m: 1, ry: -0.25 },
      { w: 0.36, h: 0.09, d: 0.28, x: -0.08, y: F + 0.15, z: -0.06, m: 2, ry: 0.35 },
      { w: 0.32, h: 0.06, d: 0.24, x: -0.03, y: F + 0.24, z: -0.06, m: 3, ry: -0.1 },
      { w: 0.38, h: 0.015, d: 0.26, x: 0.24, y: F, z: 0.28, m: 3, ry: 0.5 }, // an open book
      { w: 0.34, h: 0.025, d: 0.22, x: 0.24, y: F + 0.015, z: 0.28, m: 4, ry: 0.5 },
    ],
    hardness: 0.3, force: 0, tags: [], interaction: [0.15, 0, 0.15, 0.85, 0.32, 0.85],
  },
  {
    // A golden idol with emerald eyes
    id: BlockIds.GOLDEN_IDOL, name: 'golden_idol', displayName: 'Golden Idol', textureId: TextureId.GOLDEN_IDOL,
    colors: [{ color: 0xd4a22c }, { color: 0xf2d060 }, { color: 0x2fe07a, glow: true }, { color: 0x8a6418 }],
    boxes: [
      { w: 0.34, h: 0.06, d: 0.34, x: 0, y: F, z: 0, m: 3 },
      { w: 0.22, h: 0.2, d: 0.16, x: 0, y: F + 0.06, z: 0, m: 0 },
      { w: 0.26, h: 0.16, d: 0.18, x: 0, y: F + 0.26, z: 0, m: 0 },
      { w: 0.32, h: 0.06, d: 0.08, x: 0, y: F + 0.32, z: 0.08, m: 1 },
      { w: 0.2, h: 0.16, d: 0.18, x: 0, y: F + 0.42, z: 0, m: 0 },
      { w: 0.26, h: 0.05, d: 0.22, x: 0, y: F + 0.58, z: 0, m: 1 },
      { w: 0.08, h: 0.08, d: 0.08, x: 0, y: F + 0.63, z: 0, m: 1 },
      { w: 0.04, h: 0.03, d: 0.01, x: -0.05, y: F + 0.5, z: 0.093, m: 2 },
      { w: 0.04, h: 0.03, d: 0.01, x: 0.05, y: F + 0.5, z: 0.093, m: 2 },
    ],
    hardness: 1, force: 0, tags: [], interaction: [0.3, 0, 0.3, 0.7, 0.72, 0.7],
  },
  {
    // Something wrapped in spider silk, hanging from the ceiling
    id: BlockIds.SILK_COCOON, name: 'silk_cocoon', displayName: 'Silk Cocoon', textureId: TextureId.SILK_COCOON,
    colors: [{ color: 0xdcd8ce }, { color: 0xb6b2a8 }, { color: 0xe8e6e0 }],
    boxes: [
      { w: 0.03, h: 0.24, d: 0.03, x: 0, y: C - 0.24, z: 0, m: 2 },
      { w: 0.18, h: 0.08, d: 0.18, x: 0, y: C - 0.32, z: 0, m: 1 },
      { w: 0.3, h: 0.42, d: 0.28, x: 0, y: C - 0.74, z: 0, m: 0 },
      { w: 0.34, h: 0.2, d: 0.31, x: 0, y: C - 0.62, z: 0, m: 0 },
      { w: 0.32, h: 0.03, d: 0.3, x: 0, y: C - 0.54, z: 0, m: 1 },
      { w: 0.32, h: 0.03, d: 0.3, x: 0, y: C - 0.42, z: 0, m: 1 },
      { w: 0.2, h: 0.1, d: 0.18, x: 0, y: C - 0.84, z: 0, m: 1 },
    ],
    hardness: 0.4, force: 0, tags: [], interaction: [0.3, 0.14, 0.3, 0.7, 1, 0.7],
    drops: () => several(2, 3, () => new SpiderSilkItem()),
  },
  {
    id: BlockIds.MINERS_LANTERN, name: 'miners_lantern', displayName: "Miner's Lantern", textureId: TextureId.MINERS_LANTERN,
    colors: [{ color: 0x3a3a3c }, { color: 0xffcf70, glow: true }, { color: 0x7a6a50 }],
    boxes: [
      { w: 0.34, h: 0.05, d: 0.34, x: 0, y: F, z: 0, m: 2 },
      { w: 0.22, h: 0.26, d: 0.22, x: 0, y: F + 0.05, z: 0, m: 1 },
      { w: 0.04, h: 0.28, d: 0.04, x: 0.13, y: F + 0.05, z: 0.13, m: 0 },
      { w: 0.04, h: 0.28, d: 0.04, x: -0.13, y: F + 0.05, z: 0.13, m: 0 },
      { w: 0.04, h: 0.28, d: 0.04, x: 0.13, y: F + 0.05, z: -0.13, m: 0 },
      { w: 0.04, h: 0.28, d: 0.04, x: -0.13, y: F + 0.05, z: -0.13, m: 0 },
      { w: 0.3, h: 0.05, d: 0.3, x: 0, y: F + 0.33, z: 0, m: 2 },
      { w: 0.14, h: 0.05, d: 0.14, x: 0, y: F + 0.38, z: 0, m: 0 },
      { w: 0.03, h: 0.08, d: 0.03, x: 0.09, y: F + 0.42, z: 0, m: 0 },
      { w: 0.03, h: 0.08, d: 0.03, x: -0.09, y: F + 0.42, z: 0, m: 0 },
      { w: 0.21, h: 0.03, d: 0.03, x: 0, y: F + 0.5, z: 0, m: 0 },
    ],
    hardness: 0.5, force: 0, tags: [], lightLevel: 12, interaction: [0.3, 0, 0.3, 0.7, 0.54, 0.7],
  },
  {
    id: BlockIds.DUSTY_BOTTLES, name: 'dusty_bottles', displayName: 'Dusty Bottles', textureId: TextureId.DUSTY_BOTTLES,
    colors: [{ color: 0x3f6e4a }, { color: 0x7a2e3a }, { color: 0x3a5a8a }, { color: 0xa07a30 }, { color: 0x8a7a60 }],
    boxes: [
      { w: 0.14, h: 0.2, d: 0.14, x: -0.16, y: F, z: 0.05, m: 0 },
      { w: 0.06, h: 0.08, d: 0.06, x: -0.16, y: F + 0.2, z: 0.05, m: 0 },
      { w: 0.05, h: 0.03, d: 0.05, x: -0.16, y: F + 0.28, z: 0.05, m: 4 },
      { w: 0.18, h: 0.16, d: 0.18, x: 0.12, y: F, z: -0.08, m: 1 },
      { w: 0.06, h: 0.08, d: 0.06, x: 0.12, y: F + 0.16, z: -0.08, m: 1 },
      { w: 0.05, h: 0.03, d: 0.05, x: 0.12, y: F + 0.24, z: -0.08, m: 4 },
      { w: 0.1, h: 0.26, d: 0.1, x: 0.06, y: F, z: 0.2, m: 2 },
      { w: 0.05, h: 0.07, d: 0.05, x: 0.06, y: F + 0.26, z: 0.2, m: 2 },
      { w: 0.05, h: 0.03, d: 0.05, x: 0.06, y: F + 0.33, z: 0.2, m: 4 },
      { w: 0.22, h: 0.1, d: 0.1, x: -0.1, y: F, z: -0.28, m: 3, ry: 0.4 },
    ],
    hardness: 0.3, force: 0, tags: [], interaction: [0.15, 0, 0.1, 0.85, 0.36, 0.9],
  },
  {
    // Iron bars: rods through the middle of the cell (canonical: a wall along X), banded top and bottom; tile seamlessly
    id: BlockIds.IRON_BARS, name: 'iron_bars', displayName: 'Iron Bars', textureId: TextureId.IRON_BARS,
    colors: [{ color: 0x5a5d62 }, { color: 0x45474b }],
    boxes: [
      { w: 0.07, h: 1, d: 0.07, x: -0.375, y: F, z: 0, m: 0 },
      { w: 0.07, h: 1, d: 0.07, x: -0.125, y: F, z: 0, m: 0 },
      { w: 0.07, h: 1, d: 0.07, x: 0.125, y: F, z: 0, m: 0 },
      { w: 0.07, h: 1, d: 0.07, x: 0.375, y: F, z: 0, m: 0 },
      { w: 1, h: 0.07, d: 0.09, x: 0, y: F + 0.16, z: 0, m: 1 },
      { w: 1, h: 0.07, d: 0.09, x: 0, y: F + 0.78, z: 0, m: 1 },
    ],
    hardness: 4, force: 1, tags: [BlockTags.ROCK],
    collision: [0, 0, 0, 1, 1, 1], interaction: [0, 0, 0, 1, 1, 1],
  },
  {
    // A minecart heaped with ore (canonical: long along X)
    id: BlockIds.MINECART, name: 'minecart', displayName: 'Minecart', textureId: TextureId.MINECART,
    colors: [{ color: 0x55575c }, { color: 0x2c2c30 }, { color: 0x6e7076 }, { color: 0x2b2a2a }, { color: 0xc8a07a }, { color: 0xd88a4a }],
    boxes: [
      { w: 0.16, h: 0.16, d: 0.06, x: -0.26, y: F, z: 0.27, m: 1 },
      { w: 0.16, h: 0.16, d: 0.06, x: 0.26, y: F, z: 0.27, m: 1 },
      { w: 0.16, h: 0.16, d: 0.06, x: -0.26, y: F, z: -0.27, m: 1 },
      { w: 0.16, h: 0.16, d: 0.06, x: 0.26, y: F, z: -0.27, m: 1 },
      { w: 0.84, h: 0.06, d: 0.56, x: 0, y: F + 0.1, z: 0, m: 0 },
      { w: 0.84, h: 0.4, d: 0.05, x: 0, y: F + 0.12, z: 0.28, m: 0 },
      { w: 0.84, h: 0.4, d: 0.05, x: 0, y: F + 0.12, z: -0.28, m: 0 },
      { w: 0.05, h: 0.4, d: 0.56, x: 0.42, y: F + 0.12, z: 0, m: 0 },
      { w: 0.05, h: 0.4, d: 0.56, x: -0.42, y: F + 0.12, z: 0, m: 0 },
      { w: 0.88, h: 0.04, d: 0.06, x: 0, y: F + 0.52, z: 0.28, m: 2 },
      { w: 0.88, h: 0.04, d: 0.06, x: 0, y: F + 0.52, z: -0.28, m: 2 },
      { w: 0.76, h: 0.24, d: 0.5, x: 0, y: F + 0.16, z: 0, m: 3 },
      { w: 0.5, h: 0.12, d: 0.34, x: -0.04, y: F + 0.4, z: 0.02, m: 3 },
      { w: 0.12, h: 0.1, d: 0.12, x: 0.16, y: F + 0.42, z: -0.08, m: 4, ry: 0.5 },
      { w: 0.1, h: 0.09, d: 0.1, x: -0.2, y: F + 0.47, z: 0.1, m: 5, ry: 0.3 },
      { w: 0.11, h: 0.08, d: 0.11, x: 0.02, y: F + 0.5, z: 0.04, m: 4, ry: 1.1 },
    ],
    hardness: 2, force: 1, tags: [BlockTags.ROCK],
    collision: [0.06, 0, 0.06, 0.94, 0.56, 0.94], interaction: [0.06, 0, 0.18, 0.94, 0.6, 0.82],
  },
  {
    // A brass telescope on a wooden tripod, looking forward (+Z)
    id: BlockIds.TELESCOPE, name: 'telescope', displayName: 'Telescope', textureId: TextureId.TELESCOPE,
    colors: [{ color: 0xb8873a }, { color: 0xe0b85a }, { color: 0x4a3424 }, { color: 0x1e2a36, glow: true }],
    boxes: [
      { w: 0.05, h: 0.56, d: 0.05, x: 0, y: F, z: -0.2, m: 2 },
      { w: 0.05, h: 0.56, d: 0.05, x: -0.17, y: F, z: 0.1, m: 2 },
      { w: 0.05, h: 0.56, d: 0.05, x: 0.17, y: F, z: 0.1, m: 2 },
      { w: 0.16, h: 0.08, d: 0.16, x: 0, y: F + 0.54, z: 0, m: 2 },
      { w: 0.13, h: 0.13, d: 0.64, x: 0, y: F + 0.62, z: 0.04, m: 0 },
      { w: 0.17, h: 0.17, d: 0.08, x: 0, y: F + 0.6, z: 0.36, m: 1 },
      { w: 0.13, h: 0.13, d: 0.01, x: 0, y: F + 0.62, z: 0.405, m: 3 },
      { w: 0.08, h: 0.08, d: 0.12, x: 0, y: F + 0.645, z: -0.32, m: 1 },
      { w: 0.15, h: 0.03, d: 0.03, x: 0, y: F + 0.74, z: 0.1, m: 1 },
    ],
    hardness: 1, force: 0, tags: [], interaction: [0.25, 0, 0.1, 0.75, 0.8, 0.92],
  },
  {
    // A carved stone bust on a plinth, facing forward (+Z)
    id: BlockIds.STONE_BUST, name: 'stone_bust', displayName: 'Stone Bust', textureId: TextureId.STONE_BUST,
    colors: [{ color: 0xb6b2a8 }, { color: 0x8e8a82 }, { color: 0x6e6b65 }],
    boxes: [
      { w: 0.52, h: 0.08, d: 0.52, x: 0, y: F, z: 0, m: 2 },
      { w: 0.44, h: 0.26, d: 0.44, x: 0, y: F + 0.08, z: 0, m: 1 },
      { w: 0.5, h: 0.16, d: 0.28, x: 0, y: F + 0.34, z: 0, m: 0 },
      { w: 0.13, h: 0.08, d: 0.13, x: 0, y: F + 0.5, z: 0.01, m: 0 },
      { w: 0.26, h: 0.3, d: 0.28, x: 0, y: F + 0.56, z: 0.01, m: 0 },
      { w: 0.28, h: 0.08, d: 0.3, x: 0, y: F + 0.8, z: -0.01, m: 1 },
      { w: 0.05, h: 0.08, d: 0.05, x: 0, y: F + 0.65, z: 0.16, m: 0 },
      { w: 0.04, h: 0.03, d: 0.01, x: -0.06, y: F + 0.72, z: 0.155, m: 2 },
      { w: 0.04, h: 0.03, d: 0.01, x: 0.06, y: F + 0.72, z: 0.155, m: 2 },
    ],
    hardness: 2, force: 1, tags: [BlockTags.ROCK],
    collision: [0.24, 0, 0.24, 0.76, 0.88, 0.76], interaction: [0.24, 0, 0.24, 0.76, 0.9, 0.76],
  },
  {
    // Two wooden tankards, one still foaming
    id: BlockIds.TANKARDS, name: 'tankards', displayName: 'Tankards', textureId: TextureId.TANKARDS,
    colors: [{ color: 0x8a6a44 }, { color: 0x55575c }, { color: 0xeee2c6 }],
    boxes: [
      { w: 0.16, h: 0.22, d: 0.16, x: -0.14, y: F, z: 0.06, m: 0 },
      { w: 0.17, h: 0.03, d: 0.17, x: -0.14, y: F + 0.04, z: 0.06, m: 1 },
      { w: 0.17, h: 0.03, d: 0.17, x: -0.14, y: F + 0.16, z: 0.06, m: 1 },
      { w: 0.15, h: 0.04, d: 0.15, x: -0.14, y: F + 0.22, z: 0.06, m: 2 },
      { w: 0.04, h: 0.12, d: 0.06, x: -0.245, y: F + 0.05, z: 0.06, m: 0 },
      { w: 0.15, h: 0.2, d: 0.15, x: 0.16, y: F, z: -0.1, m: 0 },
      { w: 0.16, h: 0.03, d: 0.16, x: 0.16, y: F + 0.03, z: -0.1, m: 1 },
      { w: 0.16, h: 0.03, d: 0.16, x: 0.16, y: F + 0.14, z: -0.1, m: 1 },
      { w: 0.04, h: 0.11, d: 0.06, x: 0.26, y: F + 0.05, z: -0.1, m: 0 },
    ],
    hardness: 0.3, force: 0, tags: [], interaction: [0.25, 0, 0.25, 0.75, 0.3, 0.75],
  },
]

export function createPoiDecorBlocks(): PoiDecorBlock[] {
  return SPECS.map((spec) => new PoiDecorBlock(spec))
}

/** Block names of the decorations that drop themselves (each gets a block item). */
export const POI_DECOR_ITEMS: ReadonlyArray<readonly [string, string]> = SPECS.filter((s) => !s.drops).map((s) => [s.name, s.displayName])
