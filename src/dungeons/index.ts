export {
  registerGuardian,
  getGuardianDefinition,
  getGuardianDefinitionById,
  getGuardianDefinitions,
  DEFAULT_GUARDIAN_ACTIVATION_RADIUS,
  DEFAULT_GUARDIAN_ACTIVATION_HEIGHT,
} from './GuardianRegistry.ts'
export type { GuardianDefinition } from './GuardianRegistry.ts'
export {
  registerDungeonLocator,
  getDungeonLocator,
  getDungeonLocators,
  getDungeonLocatorsForBiome,
  findNearestDungeon,
} from './DungeonLocator.ts'
export type { DungeonLocation, DungeonLocatorDefinition, LocatedDungeon } from './DungeonLocator.ts'
export { guardianSpawners, GuardianSpawnerSystem } from './GuardianSpawnerSystem.ts'
export { setupDungeons } from './setupDungeons.ts'
export type { DungeonSetupDeps, DungeonSystems } from './setupDungeons.ts'
export { DungeonTracker, dungeonKey, DUNGEON_ENTER_RADIUS } from './DungeonTracker.ts'
export { SigilCompass, SIGIL_COMPASS_ITEM_ID, SIGIL_COMPASS_RANGE } from './SigilCompass.ts'
export {
  registerGarrison,
  getGarrisonDefinition,
  getGarrisonDefinitionById,
  weightedGarrisonMembers,
  DEFAULT_GARRISON_MAX_ALIVE,
  DEFAULT_GARRISON_ACTIVATION_RADIUS,
  DEFAULT_GARRISON_ACTIVATION_HEIGHT,
  DEFAULT_GARRISON_RESPAWN_SECONDS,
} from './GarrisonRegistry.ts'
export type { GarrisonDefinition, GarrisonMemberEntry } from './GarrisonRegistry.ts'
export { garrisonSpawners, GarrisonSpawnerSystem } from './GarrisonSpawnerSystem.ts'
export {
  registerProceduralDungeonLocator,
  findNearestProceduralDungeon,
  getProceduralDungeonLayout,
  getBiomeTerrainHeight,
} from './ProceduralDungeonLocator.ts'
export type { ProceduralDungeonLocatorOptions } from './ProceduralDungeonLocator.ts'
