import type { IRecipe } from '../RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { PlantBlockItem } from '../../items/blocks/plants/PlantBlockItem.ts'
import { BoneItem } from '../../items/materials/bone/BoneItem.ts'
import { BoneMealItem } from '../../items/materials/bone_meal/BoneMealItem.ts'
import { RopeItem } from '../../items/materials/rope/RopeItem.ts'
import { GlassBlockItem } from '../../items/blocks/glass/GlassBlockItem.ts'
import { RoastedPuffballItem } from '../../items/food/roasted_puffball/RoastedPuffballItem.ts'
import { RoastedToadstoolItem } from '../../items/food/roasted_toadstool/RoastedToadstoolItem.ts'
import { MushroomSkewerItem } from '../../items/food/mushroom_skewer/MushroomSkewerItem.ts'
import { ForagerSaladItem } from '../../items/food/forager_salad/ForagerSaladItem.ts'
import { EmberSightPotionItem } from '../../items/potions/ember_sight_potion/EmberSightPotionItem.ts'

/**
 * Everything the wild gives has a use: wild mushrooms cook into food (and a
 * skewer), edible flowers make a salad, any plant composts into bone meal,
 * and the odd finds of caves and beaches (skulls, shells, dripstone, vines,
 * old bottles) turn back into something useful.
 */
export const forageHandRecipes: IRecipe[] = [
  {
    id: 'mushroom_skewer',
    name: 'Mushroom Skewer',
    ingredients: [
      { itemId: 'stick', count: 1 },
      { itemId: 'roasted_puffball', count: 1 },
      { itemId: 'roasted_toadstool', count: 1 },
      { itemId: 'brown_mushrooms_block', count: 1 },
    ],
    createResult: () => new MushroomSkewerItem(),
    resultCount: 1,
  },
  {
    id: 'forager_salad',
    name: "Forager's Salad",
    ingredients: [{ itemId: 'bowl', count: 1 }, { tag: ItemTags.SALAD_GREEN, count: 3 }],
    createResult: () => new ForagerSaladItem(),
    resultCount: 1,
  },
  {
    id: 'compost',
    name: 'Bone Meal (compost)',
    ingredients: [{ tag: ItemTags.COMPOSTABLE, count: 4 }],
    createResult: () => new BoneMealItem(),
    resultCount: 1,
  },
  {
    id: 'bones_from_skull',
    name: 'Bone',
    ingredients: [{ itemId: 'skull_block', count: 1 }],
    createResult: () => new BoneItem(),
    resultCount: 2,
  },
  {
    id: 'bone_meal_from_sea_shell',
    name: 'Bone Meal',
    ingredients: [{ itemId: 'sea_shell_block', count: 1 }],
    createResult: () => new BoneMealItem(),
    resultCount: 2,
  },
  {
    id: 'bone_meal_from_crab_shell',
    name: 'Bone Meal',
    ingredients: [{ itemId: 'crab_shell_block', count: 1 }],
    createResult: () => new BoneMealItem(),
    resultCount: 2,
  },
  {
    id: 'dripstone_from_formations',
    name: 'Dripstone',
    ingredients: [{ tag: ItemTags.DRIPSTONE_FORMATION, count: 4 }],
    createResult: () => new PlantBlockItem('dripstone_block', 'Dripstone'),
    resultCount: 1,
  },
  {
    id: 'rope_from_vines',
    name: 'Rope',
    ingredients: [{ itemId: 'vine_block', count: 3 }],
    createResult: () => new RopeItem(),
    resultCount: 1,
  },
]

/** The forge roasts wild mushrooms and melts old bottles back into glass. */
export const forageSmeltingRecipes: ISmeltingRecipe[] = [
  {
    id: 'roast_puffball',
    name: 'Roasted Puffball',
    inputId: 'puffballs_block',
    createResult: () => new RoastedPuffballItem(),
    resultCount: 1,
    smeltTime: 5,
  },
  {
    id: 'roast_toadstool',
    name: 'Roasted Toadstool',
    inputId: 'toadstool_block',
    createResult: () => new RoastedToadstoolItem(),
    resultCount: 1,
    smeltTime: 5,
  },
  {
    id: 'melt_dusty_bottles',
    name: 'Glass',
    inputId: 'dusty_bottles_block',
    createResult: () => new GlassBlockItem(),
    resultCount: 1,
    smeltTime: 10,
  },
]

/** More routes to ember sight: the dark's glowing plants, like the fungal hollows' cave mushrooms. */
export const forageBrewingRecipes: IBrewingRecipe[] = (
  [
    ['glow_bloom_block', 'glow_bloom'],
    ['glimmercap_block', 'glimmercap'],
    ['lumen_fern_block', 'lumen_fern'],
  ] as const
).map(([itemId, key]) => ({
  id: `brew_ember_sight_potion_${key}`,
  name: 'Ember Sight Potion',
  ingredients: [
    { itemId: 'herb', count: 1 },
    { itemId, count: 2 },
  ],
  createResult: () => new EmberSightPotionItem(),
  resultCount: 1,
  brewTime: 20,
}))
