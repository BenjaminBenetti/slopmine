import { RecipeRegistry } from './RecipeRegistry.ts'
import { WoodPickaxeItem } from './tools/pickaxe/WoodPickaxeItem.ts'
import { WoodAxeItem } from './tools/axe/WoodAxeItem.ts'
import { WoodShovelItem } from './tools/shovel/WoodShovelItem.ts'

/**
 * Register all default item recipes.
 * Call this during game initialization.
 */
export function registerDefaultRecipes(): void {
  const registry = RecipeRegistry.getInstance()

  registry.register(new WoodPickaxeItem().getRecipe()!)
  registry.register(new WoodAxeItem().getRecipe()!)
  registry.register(new WoodShovelItem().getRecipe()!)
}
