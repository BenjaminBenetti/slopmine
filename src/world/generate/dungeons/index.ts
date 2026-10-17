/**
 * Procedural dungeon framework (worker-safe). Kits import from here.
 * See DungeonTypes.ts for the model and kits/reference/ReferenceKeepKit.ts
 * for a complete worked example.
 */
export * from './DungeonTypes.ts'
export * from './DungeonBuild.ts'
export { DungeonRng, hash01, hashInts, hashString } from './DungeonRandom.ts'
export { registerDungeonKit, getDungeonKit, getDungeonKits } from './DungeonKitRegistry.ts'
export {
  regionDungeonAnchor,
  regionDungeonAt,
  findNearestRegionDungeon,
  DEFAULT_REGION_DUNGEON_CHANCE,
  type RegionDungeonPlacement,
  type RegionDungeonAnchor,
  type RegionBiomeAt,
} from './RegionPlacement.ts'
export { generateDungeonLayout, kitFootprintRadius, defaultBaseY, computeDungeonBaseY, type LayoutRequest } from './LayoutGenerator.ts'
export { rasterizeDungeon } from './DungeonRasterizer.ts'
export { getCachedDungeonLayout, clearDungeonLayoutCache } from './LayoutCache.ts'
export { defaultFoundationPass, foundationUnderModules, doorwayBox, rotateCellOffset } from './DungeonContexts.ts'
export {
  rotateFacingMeta,
  resolveMaterial,
  intersectBoxes,
  boxesIntersect,
  setDungeonDevWarnings,
  type SubChunkLike,
  type DungeonDrawWarning,
} from './DungeonWriter.ts'
export { ProceduralDungeonFeature, proceduralDungeonPlacement, type ProceduralDungeonConfig } from './ProceduralDungeonFeature.ts'
