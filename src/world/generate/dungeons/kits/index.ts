/**
 * Production dungeon kits. Each kit module calls registerDungeonKit() at
 * load; this file is imported by ProceduralDungeonFeature (every worker) and
 * the main-thread locators, so a kit listed here exists everywhere.
 * Add your kit's import inside your biome's group.
 */

// Hell: Molten Wastes
import './molten/BastionKit.ts'

// Hell: The Ossuary
import './ossuary/CatacombsKit.ts'

// Hell: Ember Grove
import './embergrove/SporeheartHiveKit.ts'

// Hell: Crystal Abyss
import './crystal/PrismSanctumKit.ts'

// Hell: Cocytus
import './cocytus/FrozenCitadelKit.ts'

export {}
