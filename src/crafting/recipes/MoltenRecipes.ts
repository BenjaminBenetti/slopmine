import type { IRecipe } from '../RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { InferniumIngotItem } from '../../items/bars/infernium/InferniumIngotItem.ts'
import { InfernalBrazierBlockItem } from '../../items/blocks/infernal_brazier/InfernalBrazierBlockItem.ts'
import { InfernalBricksBlockItem } from '../../items/blocks/infernal_bricks/InfernalBricksBlockItem.ts'
import { ItemTags } from '../../items/tags/index.ts'

/**
 * Molten Wastes recipes: infernium smelting and the bastion's building
 * blocks for players.
 */

/** Raw infernium -> infernium ingot. Slow: the forge needs a long, hot burn. */
export const smeltRawInferniumRecipe: ISmeltingRecipe = {
  id: 'smelt_raw_infernium',
  name: 'Infernium Ingot',
  inputId: 'raw_infernium',
  createResult: () => new InferniumIngotItem(),
  resultCount: 1,
  smeltTime: 40,
}

export const moltenSmeltingRecipes: ISmeltingRecipe[] = [smeltRawInferniumRecipe]

/** Infernal bricks from hell rock bound with magma cream. */
export const infernalBricksRecipe: IRecipe = {
  id: 'infernal_bricks',
  name: 'Infernal Bricks',
  ingredients: [
    { itemId: 'hell_rock_block', count: 4 },
    { itemId: 'magma_cream', count: 1 },
  ],
  createResult: () => new InfernalBricksBlockItem(),
  resultCount: 4,
}

/** A bastion fire basket: iron bar + coal + magma cream. */
export const infernalBrazierRecipe: IRecipe = {
  id: 'infernal_brazier',
  name: 'Infernal Brazier',
  ingredients: [
    { itemId: 'iron_bar', count: 1 },
    { tag: ItemTags.COAL, count: 1 },
    { itemId: 'magma_cream', count: 1 },
  ],
  createResult: () => new InfernalBrazierBlockItem(),
  resultCount: 1,
}

export const moltenHandRecipes: IRecipe[] = [infernalBricksRecipe, infernalBrazierRecipe]
