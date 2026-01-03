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

  // Wood Pickaxe
  const woodPickaxe = new WoodPickaxeItem()
  const woodPickaxeRecipe = woodPickaxe.getRecipe()
  if (woodPickaxeRecipe) {
    registry.register(woodPickaxeRecipe)
  }

  // Wood Axe
  const woodAxe = new WoodAxeItem()
  const woodAxeRecipe = woodAxe.getRecipe()
  if (woodAxeRecipe) {
    registry.register(woodAxeRecipe)
  }

  // Wood Shovel
  const woodShovel = new WoodShovelItem()
  const woodShovelRecipe = woodShovel.getRecipe()
  if (woodShovelRecipe) {
    registry.register(woodShovelRecipe)
  }
}
