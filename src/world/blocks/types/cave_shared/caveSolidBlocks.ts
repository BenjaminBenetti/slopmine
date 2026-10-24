import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { CaveSolidBlock } from './CaveSolidBlock.ts'
import { CelestiteShardItem } from '../../../../items/materials/celestite_shard/CelestiteShardItem.ts'
import dripstoneUrl from '../dripstone_block/assets/dripstone_block.webp'
import calciteUrl from '../calcite/assets/calcite.webp'
import dampSlateUrl from '../damp_slate/assets/damp_slate.webp'
import frostedStoneUrl from '../frosted_stone/assets/frosted_stone.webp'
import celestiteUrl from '../celestite_block/assets/celestite_block.webp'
import celestiteGlowUrl from '../celestite_block/assets/celestite_block_glow.webp'
import myceliumUrl from '../pale_mycelium/assets/pale_mycelium.webp'
import myceliumGlowUrl from '../pale_mycelium/assets/pale_mycelium_glow.webp'
import capUrl from '../pale_mushroom_cap/assets/pale_mushroom_cap.webp'
import capGlowUrl from '../pale_mushroom_cap/assets/pale_mushroom_cap_glow.webp'
import stemUrl from '../pale_mushroom_stem/assets/pale_mushroom_stem.webp'
import stemGlowUrl from '../pale_mushroom_stem/assets/pale_mushroom_stem_glow.webp'
import lampUrl from '../celestite_lamp/assets/celestite_lamp.webp'
import lampGlowUrl from '../celestite_lamp/assets/celestite_lamp_glow.webp'
import oreCrateUrl from '../ore_crate/assets/ore_crate.webp'
import gravelUrl from '../gravel/assets/gravel.webp'
import andesiteUrl from '../andesite/assets/andesite.webp'
import graniteUrl from '../granite/assets/granite.webp'
import { CoalItem } from '../../../../items/ores/coal/CoalItem.ts'
import { IronOreItem } from '../../../../items/ores/iron/IronOreItem.ts'

function shards(min: number, max: number): CelestiteShardItem[] {
  return Array.from({ length: min + Math.floor(Math.random() * (max - min + 1)) }, () => new CelestiteShardItem())
}

/**
 * The cave biomes' greedy blocks: the rock that lines each cave biome
 * (dripstone, calcite, damp slate, frosted stone), its crystal and fungus
 * (celestite, pale mycelium, the giant pale mushroom), the crafted
 * celestite lamp, and the plain caves' gravel, andesite and granite.
 * Glowing ones light their own texels in the dark
 * (EmissiveTextures); only the mushroom cap and the lamp emit block light.
 */
export function createCaveSolidBlocks(): CaveSolidBlock[] {
  return [
    new CaveSolidBlock({
      id: BlockIds.DRIPSTONE_BLOCK, name: 'dripstone_block', displayName: 'Dripstone', textureId: TextureId.DRIPSTONE_BLOCK,
      texture: dripstoneUrl, hardness: 1.5, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.CALCITE, name: 'calcite', displayName: 'Calcite', textureId: TextureId.CALCITE,
      texture: calciteUrl, hardness: 1.2, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.DAMP_SLATE, name: 'damp_slate', displayName: 'Damp Slate', textureId: TextureId.DAMP_SLATE,
      texture: dampSlateUrl, hardness: 1.8, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.FROSTED_STONE, name: 'frosted_stone', displayName: 'Frosted Stone', textureId: TextureId.FROSTED_STONE,
      texture: frostedStoneUrl, hardness: 1.6, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.CELESTITE_BLOCK, name: 'celestite_block', displayName: 'Celestite', textureId: TextureId.CELESTITE_BLOCK,
      texture: celestiteUrl, glow: { strength: 0.9, threshold: 0, map: celestiteGlowUrl, pulse: { amount: 0.35, grain: 'wave' } },
      hardness: 2, force: 2, tags: [BlockTags.ROCK], drops: () => shards(2, 4),
    }),
    new CaveSolidBlock({
      id: BlockIds.PALE_MYCELIUM, name: 'pale_mycelium', displayName: 'Pale Mycelium', textureId: TextureId.PALE_MYCELIUM,
      texture: myceliumUrl, glow: { strength: 0.6, threshold: 0, map: myceliumGlowUrl, darkOnly: true, pulse: { amount: 0.5, grain: 'speck' } },
      hardness: 0.6, force: 0, tags: [BlockTags.SOIL],
    }),
    new CaveSolidBlock({
      id: BlockIds.PALE_MUSHROOM_STEM, name: 'pale_mushroom_stem', displayName: 'Pale Mushroom Stem', textureId: TextureId.PALE_MUSHROOM_STEM,
      texture: stemUrl, glow: { strength: 1.0, threshold: 0, map: stemGlowUrl, darkOnly: true },
      hardness: 0.8, force: 0, tags: [BlockTags.WOOD], lightLevel: 2,
    }),
    new CaveSolidBlock({
      id: BlockIds.PALE_MUSHROOM_CAP, name: 'pale_mushroom_cap', displayName: 'Pale Mushroom Cap', textureId: TextureId.PALE_MUSHROOM_CAP,
      texture: capUrl, glow: { strength: 1.3, threshold: 0, map: capGlowUrl, darkOnly: true, pulse: { amount: 0.5, grain: 'wave' } },
      hardness: 0.5, force: 0, tags: [BlockTags.WOOD], lightLevel: 12,
    }),
    new CaveSolidBlock({
      id: BlockIds.CELESTITE_LAMP, name: 'celestite_lamp', displayName: 'Celestite Lamp', textureId: TextureId.CELESTITE_LAMP,
      texture: lampUrl, glow: { strength: 2.2, threshold: 0, map: lampGlowUrl },
      hardness: 1, force: 0, tags: [], lightLevel: 15,
    }),
    new CaveSolidBlock({
      id: BlockIds.ORE_CRATE, name: 'ore_crate', displayName: 'Ore Crate', textureId: TextureId.ORE_CRATE,
      texture: oreCrateUrl, hardness: 1, force: 0, tags: [BlockTags.WOOD],
      drops: () => [
        ...Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => new CoalItem()),
        ...Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => new IronOreItem()),
      ],
    }),
    // Plain caves: gravel floors, andesite and granite blobs through the rock
    new CaveSolidBlock({
      id: BlockIds.GRAVEL, name: 'gravel', displayName: 'Gravel', textureId: TextureId.GRAVEL,
      texture: gravelUrl, hardness: 0.6, force: 0, tags: [BlockTags.SOIL],
    }),
    new CaveSolidBlock({
      id: BlockIds.ANDESITE, name: 'andesite', displayName: 'Andesite', textureId: TextureId.ANDESITE,
      texture: andesiteUrl, hardness: 2, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.GRANITE, name: 'granite', displayName: 'Granite', textureId: TextureId.GRANITE,
      texture: graniteUrl, hardness: 2, force: 1, tags: [BlockTags.ROCK],
    }),
  ]
}

/**
 * Block names of the cave blocks with a block item: those that drop
 * themselves, and celestite (it drops shards, but is crafted back - without
 * an item a crafted block was lost on save).
 */
export const CAVE_SOLID_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ['dripstone_block', 'Dripstone'],
  ['celestite_block', 'Celestite'],
  ['calcite', 'Calcite'],
  ['damp_slate', 'Damp Slate'],
  ['frosted_stone', 'Frosted Stone'],
  ['pale_mycelium', 'Pale Mycelium'],
  ['pale_mushroom_stem', 'Pale Mushroom Stem'],
  ['pale_mushroom_cap', 'Pale Mushroom Cap'],
  ['celestite_lamp', 'Celestite Lamp'],
  ['gravel', 'Gravel'],
  ['andesite', 'Andesite'],
  ['granite', 'Granite'],
]
