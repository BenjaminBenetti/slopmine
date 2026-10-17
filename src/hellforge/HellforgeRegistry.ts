import { RecipeRegistry } from '../crafting/RecipeRegistry.ts'

/**
 * Recipes crafted at the Hellforge station (infernium and hellbane gear,
 * sigil artifacts). Same shapeless IRecipe shape as hand crafting, kept in
 * its own registry so they never show up in the hand-crafting panel.
 */
export const hellforgeRegistry = new RecipeRegistry()
