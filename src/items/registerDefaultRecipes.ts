import { RecipeRegistry } from './RecipeRegistry.ts'
import { WoodPickaxeItem } from './tools/pickaxe/WoodPickaxeItem.ts'
import { IronPickaxeItem } from './tools/pickaxe/IronPickaxeItem.ts'
import { WoodAxeItem } from './tools/axe/WoodAxeItem.ts'

/**
 * Register all default item recipes.
 * Call this during game initialization.
 */
export function registerDefaultRecipes(): void {
  const registry = RecipeRegistry.getInstance()

  // Wood Pickaxe
  const woodPickaxe = new WoodPickaxeItem()
  const woodPickaxeRecipe = woodPickaxe.getRecipe()
  if (woodPickaxeRecipe) {
    registry.register(woodPickaxeRecipe)
  }

  // Iron Pickaxe
  const ironPickaxe = new IronPickaxeItem()
  const ironPickaxeRecipe = ironPickaxe.getRecipe()
  if (ironPickaxeRecipe) {
    registry.register(ironPickaxeRecipe)
  }

  // Wood Axe
  const woodAxe = new WoodAxeItem()
  const woodAxeRecipe = woodAxe.getRecipe()
  if (woodAxeRecipe) {
    registry.register(woodAxeRecipe)
  }
}
