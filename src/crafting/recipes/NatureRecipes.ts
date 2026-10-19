import type { IRecipe, IRecipeIngredient } from '../RecipeRegistry.ts'
import type { IItem } from '../../items/Item.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { WoodHoeItem } from '../../items/tools/hoe/WoodHoeItem.ts'
import { StoneHoeItem } from '../../items/tools/hoe/StoneHoeItem.ts'
import { IronHoeItem } from '../../items/tools/hoe/IronHoeItem.ts'
import { SteelHoeItem } from '../../items/tools/hoe/SteelHoeItem.ts'
import { DiamondHoeItem } from '../../items/tools/hoe/DiamondHoeItem.ts'
import { BowlItem } from '../../items/materials/bowl/BowlItem.ts'
import { TomatoSeedsItem } from '../../items/materials/tomato_seeds/TomatoSeedsItem.ts'
import { StrawberrySeedsItem } from '../../items/materials/strawberry_seeds/StrawberrySeedsItem.ts'
import { PumpkinSeedsItem } from '../../items/materials/pumpkin_seeds/PumpkinSeedsItem.ts'
import { PumpkinPieItem } from '../../items/food/pumpkin_pie/PumpkinPieItem.ts'
import { MushroomStewItem } from '../../items/food/mushroom_stew/MushroomStewItem.ts'
import { VegetableStewItem } from '../../items/food/vegetable_stew/VegetableStewItem.ts'
import { BakedPotatoItem } from '../../items/food/baked_potato/BakedPotatoItem.ts'
import { BlueberrySeedsItem } from '../../items/materials/blueberry_seeds/BlueberrySeedsItem.ts'
import { PricklyPearSeedsItem } from '../../items/materials/prickly_pear_seeds/PricklyPearSeedsItem.ts'
import { PineappleSeedsItem } from '../../items/materials/pineapple_seeds/PineappleSeedsItem.ts'
import { AloeSeedsItem } from '../../items/materials/aloe_seeds/AloeSeedsItem.ts'
import { BerrySeedsItem } from '../../items/materials/berry_seeds/BerrySeedsItem.ts'

function hoe(id: string, name: string, head: IRecipeIngredient, create: () => IItem): IRecipe {
  return { id, name, ingredients: [head, { itemId: 'stick', count: 2 }], createResult: create, resultCount: 1 }
}

/** One food item → `count` seeds (every wild food plant can be replanted). */
function seeds(id: string, name: string, from: string, count: number, create: () => IItem): IRecipe {
  return { id, name, ingredients: [{ itemId: from, count: 1 }], createResult: create, resultCount: count }
}

/** Hoes (any tier tills farmland), the bowl, seeds from produce and farm dishes. */
export const natureHandRecipes: IRecipe[] = [
  hoe('wood_hoe', 'Wood Hoe', { tag: ItemTags.WOOD, count: 2 }, () => new WoodHoeItem()),
  hoe('stone_hoe', 'Stone Hoe', { tag: ItemTags.STONE, count: 2 }, () => new StoneHoeItem()),
  hoe('iron_hoe', 'Iron Hoe', { itemId: 'iron_bar', count: 2 }, () => new IronHoeItem()),
  hoe('steel_hoe', 'Steel Hoe', { itemId: 'steel_bar', count: 2 }, () => new SteelHoeItem()),
  hoe('diamond_hoe', 'Diamond Hoe', { itemId: 'diamond', count: 2 }, () => new DiamondHoeItem()),
  {
    id: 'bowl',
    name: 'Bowl',
    ingredients: [{ tag: ItemTags.WOOD, count: 3 }],
    createResult: () => new BowlItem(),
    resultCount: 4,
  },
  {
    id: 'tomato_seeds',
    name: 'Tomato Seeds',
    ingredients: [{ itemId: 'tomato', count: 1 }],
    createResult: () => new TomatoSeedsItem(),
    resultCount: 3,
  },
  {
    id: 'strawberry_seeds',
    name: 'Strawberry Seeds',
    ingredients: [{ itemId: 'strawberry', count: 1 }],
    createResult: () => new StrawberrySeedsItem(),
    resultCount: 3,
  },
  {
    id: 'pumpkin_seeds',
    name: 'Pumpkin Seeds',
    ingredients: [{ itemId: 'pumpkin', count: 1 }],
    createResult: () => new PumpkinSeedsItem(),
    resultCount: 4,
  },
  seeds('blueberry_seeds', 'Blueberry Seeds', 'blueberries', 2, () => new BlueberrySeedsItem()),
  seeds('prickly_pear_seeds', 'Prickly Pear Seeds', 'prickly_pear_fruit', 2, () => new PricklyPearSeedsItem()),
  seeds('pineapple_seeds', 'Pineapple Seeds', 'pineapple', 2, () => new PineappleSeedsItem()),
  seeds('aloe_seeds', 'Aloe Seeds', 'aloe_leaf', 2, () => new AloeSeedsItem()),
  seeds('berry_seeds', 'Berry Seeds', 'berries', 2, () => new BerrySeedsItem()),
  {
    id: 'pumpkin_pie',
    name: 'Pumpkin Pie',
    ingredients: [{ itemId: 'pumpkin', count: 1 }, { itemId: 'ground_wheat', count: 2 }],
    createResult: () => new PumpkinPieItem(),
    resultCount: 1,
  },
  {
    id: 'mushroom_stew',
    name: 'Mushroom Stew',
    ingredients: [{ itemId: 'bowl', count: 1 }, { itemId: 'brown_mushrooms_block', count: 2 }],
    createResult: () => new MushroomStewItem(),
    resultCount: 1,
  },
  {
    id: 'vegetable_stew',
    name: 'Vegetable Stew',
    ingredients: [
      { itemId: 'bowl', count: 1 },
      { itemId: 'carrot', count: 1 },
      { itemId: 'potato', count: 1 },
      { itemId: 'onion', count: 1 },
    ],
    createResult: () => new VegetableStewItem(),
    resultCount: 1,
  },
]

/** The forge bakes potatoes. */
export const natureSmeltingRecipes: ISmeltingRecipe[] = [
  {
    id: 'bake_potato',
    name: 'Baked Potato',
    inputId: 'potato',
    createResult: () => new BakedPotatoItem(),
    resultCount: 1,
    smeltTime: 8,
  },
]
