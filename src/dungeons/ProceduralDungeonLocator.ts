import { biomeRegistry } from '../world/generate/biomes/BiomeRegistry.ts'
import type { BiomeGenerator } from '../world/generate/BiomeGenerator.ts'
import type { BiomeType, IGenerationConfig } from '../world/generate/GenerationConfig.ts'
import { getDungeonKit } from '../world/generate/dungeons/DungeonKitRegistry.ts'
import { findNearestRegionDungeon, type RegionDungeonAnchor } from '../world/generate/dungeons/RegionPlacement.ts'
import { computeDungeonBaseY } from '../world/generate/dungeons/LayoutGenerator.ts'
import { getCachedDungeonLayout } from '../world/generate/dungeons/LayoutCache.ts'
import type { DungeonLayout } from '../world/generate/dungeons/DungeonTypes.ts'
import {
  proceduralDungeonPlacement,
  type ProceduralDungeonConfig,
} from '../world/generate/dungeons/ProceduralDungeonFeature.ts'
import { registerDungeonLocator, type DungeonLocation } from './DungeonLocator.ts'

/**
 * Main-thread side of procedural dungeons: the exact replica of the worker
 * placement (same config, same kit, same pure math) for the Sigil Compass,
 * `dungeon-entered` and tests. Inside a region's interior the worker's
 * blended terrain height equals the biome generator's own height, so the
 * castle's base Y (and its whole layout) is reproducible here.
 */

/** World config values the workers generate with (saved configs never override them; GenerationConfig defaults). */
const SEA_LEVEL = 240
const TERRAIN_THICKNESS = 100

const generators = new Map<string, BiomeGenerator>()

/**
 * The pure terrain height of `biome` for `seed` (== the worker's blended
 * height inside a region's interior). Null for an unknown biome.
 */
export function getBiomeTerrainHeight(biome: string, seed: number): ((x: number, z: number) => number) | null {
  const key = `${biome}|${seed}`
  let generator = generators.get(key)
  if (!generator) {
    const registration = biomeRegistry.get(biome as BiomeType)
    if (!registration) return null
    const config: IGenerationConfig = { seed, seaLevel: SEA_LEVEL, terrainThickness: TERRAIN_THICKNESS, chunkDistance: 8 }
    generator = registration.createGenerator(config as never)
    generators.set(key, generator)
  }
  const g = generator
  return (x, z) => g.getHeightAt(x, z)
}

/** Nearest accepted anchor of a procedural dungeon type (pure; layer-0/1 biome map). */
export function findNearestProceduralDungeon(
  config: ProceduralDungeonConfig,
  x: number,
  z: number,
  seed: number,
  maxRadius: number,
  layer: 0 | 1 = 0
): RegionDungeonAnchor | null {
  const kit = getDungeonKit(config.kitId)
  if (!kit) return null
  return findNearestRegionDungeon(proceduralDungeonPlacement(config, kit), x, z, seed, maxRadius, (rx, rz) =>
    biomeRegistry.selectBiomeForLayer(rx, rz, seed, layer)
  )
}

/** The full layout of the castle at an anchor (cached; same as the workers build). */
export function getProceduralDungeonLayout(
  config: ProceduralDungeonConfig,
  anchor: { x: number; z: number },
  seed: number
): DungeonLayout | null {
  const kit = getDungeonKit(config.kitId)
  const height = getBiomeTerrainHeight(config.biome, seed)
  if (!kit || !height) return null
  return getCachedDungeonLayout(kit, anchor.x, anchor.z, seed, config.salt, height, config.biome)
}

export interface ProceduralDungeonLocatorOptions {
  /** `dungeon-entered.dungeonId` / compass id ('infernal_bastion', ...). */
  readonly dungeonId: string
  readonly displayName: string
  /** The SAME config object the biome's ProceduralDungeonFeature uses. */
  readonly config: ProceduralDungeonConfig
  /** Biome layer of `config.biome` (default 0, the Hell layer). */
  readonly layer?: 0 | 1
}

/**
 * Register the dungeon locator of a procedural dungeon type: points at the
 * castle's anchor (grid centre), y = its base floor. Cheap: one hash + one
 * biome lookup per region in range, and the base Y (25 terrain samples)
 * cached per anchor.
 */
export function registerProceduralDungeonLocator(options: ProceduralDungeonLocatorOptions): void {
  const { config } = options
  const baseYCache = new Map<string, number>()
  registerDungeonLocator({
    dungeonId: options.dungeonId,
    biome: config.biome,
    displayName: options.displayName,
    findNearest: (x, z, seed, maxRadius): DungeonLocation | null => {
      const anchor = findNearestProceduralDungeon(config, x, z, seed, maxRadius, options.layer ?? 0)
      if (!anchor) return null
      const key = `${anchor.x},${anchor.z},${seed}`
      let y = baseYCache.get(key)
      if (y === undefined) {
        const kit = getDungeonKit(config.kitId)
        const height = getBiomeTerrainHeight(config.biome, seed)
        y = kit && height ? computeDungeonBaseY(kit, anchor.x, anchor.z, height) + 1 : 64
        baseYCache.set(key, y)
      }
      return { x: anchor.x, y, z: anchor.z }
    },
  })
}
