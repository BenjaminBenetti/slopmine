import type { IRecipe } from '../RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { ItemTags } from '../../items/tags/ItemTags.ts'
import { SailboatItem } from '../../items/water/sailboat/SailboatItem.ts'
import { CanoeItem } from '../../items/water/canoe/CanoeItem.ts'
import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import { FishFoodItem, FISH_COOKING } from '../../items/water/fish/FishFoodItem.ts'
import { WaterBreathingPotionItem } from '../../items/potions/water_breathing_potion/WaterBreathingPotionItem.ts'

/** The sailboat: a planked hull, a mast and boom, a hemp sail and its rope. The canoe: planks and a paddle. */
export const waterHandRecipes: IRecipe[] = [
  {
    id: 'sailboat',
    name: 'Sailboat',
    ingredients: [
      { tag: ItemTags.PLANK, count: 6 },
      { itemId: 'stick', count: 2 },
      { itemId: 'hemp_fiber', count: 4 },
      { itemId: 'rope', count: 1 },
    ],
    createResult: () => new SailboatItem(),
    resultCount: 1,
  },
  {
    id: 'canoe',
    name: 'Canoe',
    ingredients: [
      { tag: ItemTags.PLANK, count: 5 },
      { itemId: 'stick', count: 1 },
    ],
    createResult: () => new CanoeItem(),
    resultCount: 1,
  },
]

/** Every raw fish cooks in the forge. */
export const waterSmeltingRecipes: ISmeltingRecipe[] = FISH_COOKING.map(([rawId, cookedId]) => {
  const cooked = new FishFoodItem(cookedId)
  return {
    id: `cook_${rawId}`,
    name: cooked.displayName,
    inputId: rawId,
    createResult: () => new FishFoodItem(cookedId),
    resultCount: 1,
    smeltTime: 5,
  }
})

/** A jellyfish's glow jelly, brewed with a herb, lets the player breathe under water. */
export const waterBrewingRecipes: IBrewingRecipe[] = [
  {
    id: 'brew_water_breathing_potion',
    name: 'Water Breathing Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'glow_jelly', count: 1 },
    ],
    createResult: () => new WaterBreathingPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
]
