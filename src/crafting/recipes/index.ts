import { recipeRegistry } from '../RecipeRegistry.ts'
import { smeltingRegistry } from '../../smelting/index.ts'
import { brewingRegistry } from '../../brewing/index.ts'
import { woodworkingRegistry } from '../../woodworking/index.ts'
import { carpentryWoodworkingRecipes, carpentryHandRecipes } from './CarpentryRecipes.ts'
import { stickRecipes } from './StickRecipes.ts'
import { chestRecipes } from './ChestRecipe.ts'
import { woodToolRecipes } from './WoodToolRecipes.ts'
import { stoneToolRecipes } from './StoneToolRecipes.ts'
import { ironToolRecipes } from './IronToolRecipes.ts'
import { steelToolRecipes } from './SteelToolRecipes.ts'
import { diamondToolRecipes } from './DiamondToolRecipes.ts'
import { torchRecipes } from './TorchRecipe.ts'
import { ladderRecipes } from './LadderRecipe.ts'
import { groundWheatRecipe } from './WheatRecipe.ts'
import { corruptedEssenceRecipe } from './CorruptedEssenceRecipe.ts'
import { ropeRecipes } from './RopeRecipe.ts'
import { bedRecipes } from './BedRecipe.ts'
import { ropeLadderRecipes } from './RopeLadderRecipe.ts'
import { workstationRecipes } from './WorkstationRecipes.ts'
import { smeltingRecipes } from './SmeltingRecipes.ts'
import { brewingRecipes } from './BrewingRecipes.ts'
import { diviningStickRecipes } from './DiviningStickRecipe.ts'
import { mossyStoneRecipes } from './MossyStoneRecipes.ts'
import { pineLogRecipes } from './PineLogRecipes.ts'
import { coastalFernRecipes, coastalFernSmeltingRecipes } from './CoastalFernRecipes.ts'
import { mossSmeltingRecipes } from './MossRecipes.ts'
import { crabSmeltingRecipes } from './CrabRecipes.ts'
import { pineNeedleBrewingRecipes } from './PineNeedleRecipes.ts'
import { seaStarBrewingRecipes } from './SeaStarRecipes.ts'
import { pineconeRecipes } from './PineconeRecipes.ts'
import { resinTapRecipes } from './ResinTapRecipes.ts'
import { morelSmeltingRecipes } from './MorelRecipes.ts'
import { tntRecipes } from './TntRecipe.ts'

// Progression (journal, recipe sinks)
import { progressionHandRecipes, progressionSmeltingRecipes } from './ProgressionRecipes.ts'

// Weapons, tool tiers 6-7 and the Hellforge
import { swordRecipes } from './SwordRecipes.ts'
import { hellforgeStationRecipe, registerHellforgeWeaponRecipes } from '../../hellforge/HellforgeRecipes.ts'

// Armor and Infernal Hearts
import { hellforgeRegistry } from '../../hellforge/HellforgeRegistry.ts'
import { armorHandRecipes, armorHellforgeRecipes } from './ArmorRecipes.ts'

// Alchemy (status effect potions, Return Idol)
import { alchemyBrewingRecipes, alchemyHandRecipes } from './AlchemyRecipes.ts'

// Dungeons (guardian spawners, Sigil Compass)
import { dungeonHandRecipes } from './DungeonRecipes.ts'

// Hell: Molten Wastes
import { moltenHandRecipes, moltenSmeltingRecipes } from './MoltenRecipes.ts'

// Hell: The Ossuary
import { ossuaryHandRecipes } from './OssuaryRecipes.ts'

// Hell: Ember Grove
import { embergroveHandRecipes, embergroveWoodworkingRecipes, embergroveSmeltingRecipes } from './EmbergroveRecipes.ts'

// Hell: Crystal Abyss
import { crystalAbyssRecipes } from './CrystalAbyssRecipes.ts'

// Hell: Cocytus
import { cocytusHandRecipes } from './CocytusRecipes.ts'

// Day and night
import { nightfallHandRecipes, nightfallBrewingRecipes } from './NightfallRecipes.ts'

// Nature
import { natureHandRecipes, natureSmeltingRecipes } from './NatureRecipes.ts'

// Caves and dark places
import { caveHandRecipes, caveBrewingRecipes } from './CaveRecipes.ts'
import { poiHandRecipes } from './PoiRecipes.ts'
import { forageHandRecipes, forageSmeltingRecipes, forageBrewingRecipes } from './ForageRecipes.ts'

// Weather
import { weatherHandRecipes, weatherSmeltingRecipes, weatherBrewingRecipes } from './WeatherRecipes.ts'

/**
 * Register all default recipes.
 * Call this at startup.
 */
export function registerDefaultRecipes(): void {
  // Hand crafting recipes
  for (const recipe of woodToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of pineconeRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of resinTapRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of stoneToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of ironToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of steelToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of diamondToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of torchRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of tntRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of ladderRecipes) {
    recipeRegistry.register(recipe)
  }
  recipeRegistry.register(groundWheatRecipe)
  recipeRegistry.register(corruptedEssenceRecipe)
  for (const recipe of ropeRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of bedRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of ropeLadderRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of workstationRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of diviningStickRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of mossyStoneRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of pineLogRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of coastalFernRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of stickRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of chestRecipes) {
    recipeRegistry.register(recipe)
  }

  // Smelting recipes
  for (const recipe of smeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of mossSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of crabSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of coastalFernSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of morelSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }

  // Brewing recipes
  for (const recipe of brewingRecipes) {
    brewingRegistry.register(recipe)
  }
  for (const recipe of pineNeedleBrewingRecipes) {
    brewingRegistry.register(recipe)
  }
  for (const recipe of seaStarBrewingRecipes) {
    brewingRegistry.register(recipe)
  }

  // Carpentry recipes (windows are hand-crafted; the rest run on the woodworking bench)
  for (const recipe of carpentryHandRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of carpentryWoodworkingRecipes) {
    woodworkingRegistry.register(recipe)
  }

  // Progression (journal, recipe sinks)
  for (const recipe of progressionHandRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of progressionSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }

  // Weapons, tool tiers 6-7 and the Hellforge
  for (const recipe of swordRecipes) {
    recipeRegistry.register(recipe)
  }
  recipeRegistry.register(hellforgeStationRecipe)
  registerHellforgeWeaponRecipes()

  // Armor and Infernal Hearts
  for (const recipe of armorHandRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of armorHellforgeRecipes) {
    hellforgeRegistry.register(recipe)
  }

  // Alchemy (status effect potions, Return Idol)
  for (const recipe of alchemyBrewingRecipes) {
    brewingRegistry.register(recipe)
  }
  for (const recipe of alchemyHandRecipes) {
    recipeRegistry.register(recipe)
  }

  // Dungeons (guardian spawners, Sigil Compass)
  for (const recipe of dungeonHandRecipes) {
    recipeRegistry.register(recipe)
  }

  // Hell: Molten Wastes
  for (const recipe of moltenHandRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of moltenSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }

  // Hell: The Ossuary
  for (const recipe of ossuaryHandRecipes) {
    recipeRegistry.register(recipe)
  }

  // Hell: Ember Grove
  for (const recipe of embergroveHandRecipes) recipeRegistry.register(recipe)
  for (const recipe of embergroveWoodworkingRecipes) woodworkingRegistry.register(recipe)
  for (const recipe of embergroveSmeltingRecipes) smeltingRegistry.register(recipe)

  // Hell: Crystal Abyss
  for (const recipe of crystalAbyssRecipes) {
    recipeRegistry.register(recipe)
  }

  // Hell: Cocytus
  for (const recipe of cocytusHandRecipes) {
    recipeRegistry.register(recipe)
  }

  // Day and night
  for (const recipe of nightfallHandRecipes) recipeRegistry.register(recipe)
  for (const recipe of nightfallBrewingRecipes) brewingRegistry.register(recipe)

  // Nature
  for (const recipe of natureHandRecipes) recipeRegistry.register(recipe)
  for (const recipe of natureSmeltingRecipes) smeltingRegistry.register(recipe)

  // Caves and dark places
  for (const recipe of caveHandRecipes) recipeRegistry.register(recipe)
  for (const recipe of caveBrewingRecipes) brewingRegistry.register(recipe)
  for (const recipe of poiHandRecipes) recipeRegistry.register(recipe)

  // Foraging: wild mushroom cooking, salad, compost and odd finds put to use
  for (const recipe of forageHandRecipes) recipeRegistry.register(recipe)
  for (const recipe of forageSmeltingRecipes) smeltingRegistry.register(recipe)
  for (const recipe of forageBrewingRecipes) brewingRegistry.register(recipe)

  // Weather: lightning rods, the Storm Glass and Sky Bell, stardust, weather creatures' drops
  for (const recipe of weatherHandRecipes) recipeRegistry.register(recipe)
  for (const recipe of weatherSmeltingRecipes) smeltingRegistry.register(recipe)
  for (const recipe of weatherBrewingRecipes) brewingRegistry.register(recipe)
}

export { woodToolRecipes } from './WoodToolRecipes.ts'
export { stoneToolRecipes } from './StoneToolRecipes.ts'
export { ironToolRecipes } from './IronToolRecipes.ts'
export { steelToolRecipes } from './SteelToolRecipes.ts'
export { diamondToolRecipes } from './DiamondToolRecipes.ts'
export { torchRecipes } from './TorchRecipe.ts'
