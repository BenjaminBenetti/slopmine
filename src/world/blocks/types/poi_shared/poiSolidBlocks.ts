import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { CaveSolidBlock } from '../cave_shared/CaveSolidBlock.ts'
import { RuneShardItem } from '../../../../items/materials/rune_shard/RuneShardItem.ts'
import ancientBricksUrl from '../ancient_bricks/assets/ancient_bricks.webp'
import mossyAncientBricksUrl from '../mossy_ancient_bricks/assets/mossy_ancient_bricks.webp'
import crackedAncientBricksUrl from '../cracked_ancient_bricks/assets/cracked_ancient_bricks.webp'
import carvedAncientBricksUrl from '../carved_ancient_bricks/assets/carved_ancient_bricks.webp'
import ancientTilesUrl from '../ancient_tiles/assets/ancient_tiles.webp'
import runestoneUrl from '../runestone/assets/runestone.webp'
import runestoneGlowUrl from '../runestone/assets/runestone_glow.webp'
import bookshelfUrl from '../ancient_bookshelf/assets/ancient_bookshelf.webp'
import oakPlanksUrl from '../oak_planks/assets/oak-planks.webp'
import petrifiedWoodUrl from '../petrified_wood/assets/petrified_wood.webp'
import petrifiedWoodTopUrl from '../petrified_wood/assets/petrified_wood_top.webp'
import heapedGoldUrl from '../heaped_gold/assets/heaped_gold.webp'
import fossilBoneUrl from '../fossil_bone/assets/fossil_bone.webp'
import barrelSideUrl from '../barrel/assets/barrel_side.webp'
import barrelTopUrl from '../barrel/assets/barrel_top.webp'
import sandstoneBricksUrl from '../sandstone_bricks/assets/sandstone_bricks.webp'
import carvedSandstoneUrl from '../carved_sandstone/assets/carved_sandstone.webp'
import sandstoneUrl from '../sandstone/assets/sandstone.webp'

function runeShards(min: number, max: number): RuneShardItem[] {
  return Array.from({ length: min + Math.floor(Math.random() * (max - min + 1)) }, () => new RuneShardItem())
}

/**
 * The underground points of interest's greedy blocks: the lost
 * civilisation's masonry (ancient bricks and their mossy, cracked and carved
 * courses, flagstone tiles), its glowing runestone, old bookshelves, the
 * petrified tree's stone wood, the heaped gold of hoards, the fossil bone
 * of skeletons, barrels, and the desert tomb's sandstone masonry.
 */
export function createPoiSolidBlocks(): CaveSolidBlock[] {
  return [
    new CaveSolidBlock({
      id: BlockIds.ANCIENT_BRICKS, name: 'ancient_bricks', displayName: 'Ancient Bricks', textureId: TextureId.ANCIENT_BRICKS,
      texture: ancientBricksUrl, hardness: 2.5, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.MOSSY_ANCIENT_BRICKS, name: 'mossy_ancient_bricks', displayName: 'Mossy Ancient Bricks',
      textureId: TextureId.MOSSY_ANCIENT_BRICKS, texture: mossyAncientBricksUrl, hardness: 2.5, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.CRACKED_ANCIENT_BRICKS, name: 'cracked_ancient_bricks', displayName: 'Cracked Ancient Bricks',
      textureId: TextureId.CRACKED_ANCIENT_BRICKS, texture: crackedAncientBricksUrl, hardness: 2, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.CARVED_ANCIENT_BRICKS, name: 'carved_ancient_bricks', displayName: 'Carved Ancient Bricks',
      textureId: TextureId.CARVED_ANCIENT_BRICKS, texture: carvedAncientBricksUrl, hardness: 2.5, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.ANCIENT_TILES, name: 'ancient_tiles', displayName: 'Ancient Tiles', textureId: TextureId.ANCIENT_TILES,
      texture: ancientTilesUrl, hardness: 2.5, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.RUNESTONE, name: 'runestone', displayName: 'Runestone', textureId: TextureId.RUNESTONE,
      texture: runestoneUrl, glow: { strength: 1.4, threshold: 0, map: runestoneGlowUrl, pulse: { amount: 0.35, grain: 'wave' } },
      hardness: 3, force: 2, tags: [BlockTags.ROCK], lightLevel: 6, drops: () => runeShards(1, 2),
    }),
    new CaveSolidBlock({
      id: BlockIds.ANCIENT_BOOKSHELF, name: 'ancient_bookshelf', displayName: 'Ancient Bookshelf', textureId: TextureId.ANCIENT_BOOKSHELF,
      texture: bookshelfUrl, endTextureId: TextureId.OAK_PLANKS, endTexture: oakPlanksUrl,
      hardness: 1.5, force: 0, tags: [BlockTags.WOOD],
    }),
    new CaveSolidBlock({
      id: BlockIds.PETRIFIED_WOOD, name: 'petrified_wood', displayName: 'Petrified Wood', textureId: TextureId.PETRIFIED_WOOD,
      texture: petrifiedWoodUrl, endTextureId: TextureId.PETRIFIED_WOOD_TOP, endTexture: petrifiedWoodTopUrl,
      hardness: 2.5, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.HEAPED_GOLD, name: 'heaped_gold', displayName: 'Heaped Gold', textureId: TextureId.HEAPED_GOLD,
      texture: heapedGoldUrl, hardness: 1, force: 0, tags: [BlockTags.SOIL],
    }),
    new CaveSolidBlock({
      id: BlockIds.FOSSIL_BONE, name: 'fossil_bone', displayName: 'Fossil Bone', textureId: TextureId.FOSSIL_BONE,
      texture: fossilBoneUrl, hardness: 2, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.BARREL, name: 'barrel', displayName: 'Barrel', textureId: TextureId.BARREL,
      texture: barrelSideUrl, endTextureId: TextureId.BARREL_TOP, endTexture: barrelTopUrl,
      hardness: 1.2, force: 0, tags: [BlockTags.WOOD],
    }),
    new CaveSolidBlock({
      id: BlockIds.SANDSTONE_BRICKS, name: 'sandstone_bricks', displayName: 'Sandstone Bricks', textureId: TextureId.SANDSTONE_BRICKS,
      texture: sandstoneBricksUrl, hardness: 2.5, force: 1, tags: [BlockTags.ROCK],
    }),
    new CaveSolidBlock({
      id: BlockIds.CARVED_SANDSTONE, name: 'carved_sandstone', displayName: 'Carved Sandstone', textureId: TextureId.CARVED_SANDSTONE,
      texture: carvedSandstoneUrl, endTextureId: TextureId.SANDSTONE, endTexture: sandstoneUrl,
      hardness: 2.5, force: 1, tags: [BlockTags.ROCK],
    }),
  ]
}

/** Block names of the points of interest's greedy blocks with a block item (runestone drops shards, but is crafted back). */
export const POI_SOLID_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ['ancient_bricks', 'Ancient Bricks'],
  ['mossy_ancient_bricks', 'Mossy Ancient Bricks'],
  ['cracked_ancient_bricks', 'Cracked Ancient Bricks'],
  ['carved_ancient_bricks', 'Carved Ancient Bricks'],
  ['ancient_tiles', 'Ancient Tiles'],
  ['runestone', 'Runestone'],
  ['ancient_bookshelf', 'Ancient Bookshelf'],
  ['petrified_wood', 'Petrified Wood'],
  ['heaped_gold', 'Heaped Gold'],
  ['fossil_bone', 'Fossil Bone'],
  ['barrel', 'Barrel'],
  ['sandstone_bricks', 'Sandstone Bricks'],
  ['carved_sandstone', 'Carved Sandstone'],
]
