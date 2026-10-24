import type { IRecipe } from '../RecipeRegistry.ts'
import { PlantBlockItem } from '../../items/blocks/plants/PlantBlockItem.ts'
import { DelversCompassItem } from '../../items/magic/delvers_compass/DelversCompassItem.ts'
import { GoldBarItem } from '../../items/bars/gold/GoldBarItem.ts'
import { BoneMealItem } from '../../items/materials/bone_meal/BoneMealItem.ts'
import { ItemTags } from '../../items/tags/index.ts'

const block = (name: string, label: string) => () => new PlantBlockItem(name, label)

/**
 * Underground points of interest: the Delver's Compass and runestone from
 * rune shards, the lost civilisation's masonry and the desert tomb's
 * sandstone for building, barrels, iron bars and the places' furnishings,
 * fossil bone ground into bone meal, and treasure melted back into gold bars.
 */
export const poiHandRecipes: IRecipe[] = [
  {
    id: 'delvers_compass',
    name: "Delver's Compass",
    ingredients: [{ itemId: 'rune_shard', count: 2 }, { itemId: 'iron_bar', count: 1 }, { itemId: 'celestite_shard', count: 1 }],
    createResult: () => new DelversCompassItem(),
    resultCount: 1,
  },
  {
    id: 'runestone',
    name: 'Runestone',
    ingredients: [{ itemId: 'rune_shard', count: 3 }, { itemId: 'stone_block', count: 1 }],
    createResult: block('runestone', 'Runestone'),
    resultCount: 1,
  },
  {
    id: 'ancient_bricks',
    name: 'Ancient Bricks',
    ingredients: [{ itemId: 'stone_block', count: 4 }],
    createResult: block('ancient_bricks', 'Ancient Bricks'),
    resultCount: 4,
  },
  {
    id: 'mossy_ancient_bricks',
    name: 'Mossy Ancient Bricks',
    ingredients: [{ itemId: 'ancient_bricks_block', count: 1 }, { itemId: 'moss_block', count: 1 }],
    createResult: block('mossy_ancient_bricks', 'Mossy Ancient Bricks'),
    resultCount: 1,
  },
  {
    id: 'carved_ancient_bricks',
    name: 'Carved Ancient Bricks',
    ingredients: [{ itemId: 'ancient_bricks_block', count: 2 }],
    createResult: block('carved_ancient_bricks', 'Carved Ancient Bricks'),
    resultCount: 2,
  },
  {
    id: 'ancient_tiles',
    name: 'Ancient Tiles',
    ingredients: [{ itemId: 'ancient_bricks_block', count: 4 }],
    createResult: block('ancient_tiles', 'Ancient Tiles'),
    resultCount: 4,
  },
  {
    // Play feedback: a whole block of heaped coins is worth 4 bars (it was 4 heaps → 1). Nothing crafts heaped gold back.
    id: 'gold_from_heaped_gold',
    name: 'Gold Bar',
    ingredients: [{ itemId: 'heaped_gold_block', count: 1 }],
    createResult: () => new GoldBarItem(),
    resultCount: 4,
  },
  {
    id: 'gold_from_coins',
    name: 'Gold Bar',
    ingredients: [{ itemId: 'gold_coins_block', count: 4 }],
    createResult: () => new GoldBarItem(),
    resultCount: 1,
  },
  {
    // A hoard (gold and gems) is worth at least a block of heaped gold
    id: 'gold_from_hoard',
    name: 'Gold Bar',
    ingredients: [{ itemId: 'treasure_hoard_block', count: 1 }],
    createResult: () => new GoldBarItem(),
    resultCount: 4,
  },
  {
    id: 'gold_from_idol',
    name: 'Gold Bar',
    ingredients: [{ itemId: 'golden_idol_block', count: 1 }],
    createResult: () => new GoldBarItem(),
    resultCount: 3,
  },
  {
    id: 'bone_meal_from_fossil_bone',
    name: 'Bone Meal',
    ingredients: [{ itemId: 'fossil_bone_block', count: 1 }],
    createResult: () => new BoneMealItem(),
    resultCount: 4,
  },
  {
    id: 'barrel',
    name: 'Barrel',
    ingredients: [{ tag: ItemTags.PLANK, count: 6 }, { itemId: 'iron_bar', count: 1 }],
    createResult: block('barrel', 'Barrel'),
    resultCount: 1,
  },
  {
    id: 'iron_bars',
    name: 'Iron Bars',
    ingredients: [{ itemId: 'iron_bar', count: 3 }],
    createResult: block('iron_bars', 'Iron Bars'),
    resultCount: 8,
  },
  {
    id: 'sandstone_bricks',
    name: 'Sandstone Bricks',
    ingredients: [{ itemId: 'sandstone_block', count: 4 }],
    createResult: block('sandstone_bricks', 'Sandstone Bricks'),
    resultCount: 4,
  },
  {
    id: 'carved_sandstone',
    name: 'Carved Sandstone',
    ingredients: [{ itemId: 'sandstone_bricks_block', count: 2 }],
    createResult: block('carved_sandstone', 'Carved Sandstone'),
    resultCount: 2,
  },
  {
    id: 'minecart',
    name: 'Minecart',
    ingredients: [{ itemId: 'iron_bar', count: 3 }, { itemId: 'coal', count: 2 }],
    createResult: block('minecart', 'Minecart'),
    resultCount: 1,
  },
  {
    id: 'telescope',
    name: 'Telescope',
    ingredients: [{ itemId: 'copper_bar', count: 2 }, { itemId: 'glass_block', count: 1 }, { itemId: 'stick', count: 3 }],
    createResult: block('telescope', 'Telescope'),
    resultCount: 1,
  },
  {
    id: 'stone_bust',
    name: 'Stone Bust',
    ingredients: [{ itemId: 'stone_block', count: 3 }],
    createResult: block('stone_bust', 'Stone Bust'),
    resultCount: 1,
  },
  {
    id: 'tankards',
    name: 'Tankards',
    ingredients: [{ tag: ItemTags.PLANK, count: 2 }, { itemId: 'copper_bar', count: 1 }],
    createResult: block('tankards', 'Tankards'),
    resultCount: 2,
  },
]
