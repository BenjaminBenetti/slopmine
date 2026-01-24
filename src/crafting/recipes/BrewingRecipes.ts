import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import { HealthPotion1Item } from '../../items/potions/health_potion_1/HealthPotion1Item.ts'
import { HealthPotion2Item } from '../../items/potions/health_potion_2/HealthPotion2Item.ts'
import { HealthPotion3Item } from '../../items/potions/health_potion_3/HealthPotion3Item.ts'

export const brewHealthPotion1Recipe: IBrewingRecipe = {
  id: 'brew_health_potion_1',
  name: 'Healing Potion I',
  ingredients: [{ itemId: 'herb', count: 1 }],
  createResult: () => new HealthPotion1Item(),
  resultCount: 1,
  brewTime: 10, // 10 seconds
}

export const brewHealthPotion2Recipe: IBrewingRecipe = {
  id: 'brew_health_potion_2',
  name: 'Healing Potion II',
  ingredients: [
    { itemId: 'herb', count: 1 },
    { itemId: 'mushroom_cap_block', count: 1 },
  ],
  createResult: () => new HealthPotion2Item(),
  resultCount: 1,
  brewTime: 15, // 15 seconds
}

export const brewHealthPotion3Recipe: IBrewingRecipe = {
  id: 'brew_health_potion_3',
  name: 'Healing Potion III',
  ingredients: [
    { itemId: 'herb', count: 1 },
    { itemId: 'mushroom_cap_block', count: 1 },
    { itemId: 'corrupted_essence', count: 1 },
  ],
  createResult: () => new HealthPotion3Item(),
  resultCount: 1,
  brewTime: 20, // 20 seconds
}

/** All brewing recipes */
export const brewingRecipes: IBrewingRecipe[] = [
  brewHealthPotion1Recipe,
  brewHealthPotion2Recipe,
  brewHealthPotion3Recipe,
]
