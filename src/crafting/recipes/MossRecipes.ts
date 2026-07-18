import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { DriedMossItem } from '../../items/materials/dried_moss/DriedMossItem.ts'

/**
 * Drying moss in the forge produces dried moss - tinder that can
 * substitute for coal in the torch recipe (like charcoal) and burn
 * as weak furnace fuel.
 */
export const dryMossRecipe: ISmeltingRecipe = {
  id: 'dry_moss',
  name: 'Dried Moss',
  inputId: 'moss_block',
  createResult: () => new DriedMossItem(),
  resultCount: 1,
  smeltTime: 5, // 5 seconds - moss dries quickly
}

/** All moss smelting recipes */
export const mossSmeltingRecipes: ISmeltingRecipe[] = [dryMossRecipe]
