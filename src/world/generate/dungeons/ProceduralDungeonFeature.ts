import { Feature, type FeatureContext } from '../features/Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BIOME_REGION_SIZE_BLOCKS } from '../caves/CaveBlend.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import type { DungeonKit } from './DungeonTypes.ts'
import type { SubChunkLike } from './DungeonWriter.ts'
import { getDungeonKit } from './DungeonKitRegistry.ts'
import { kitFootprintRadius } from './LayoutGenerator.ts'
import { getCachedDungeonLayout } from './LayoutCache.ts'
import { rasterizeDungeon } from './DungeonRasterizer.ts'
import { regionDungeonAnchor, type RegionDungeonPlacement } from './RegionPlacement.ts'
import './kits/index.ts'

/**
 * Serializable config of a procedural dungeon type (the worker feature
 * settings AND the main-thread locator input - share one constant).
 */
export interface ProceduralDungeonConfig {
  /** DungeonKitRegistry id. */
  readonly kitId: string
  /** BiomeType hosting it (one candidate per region of this biome). */
  readonly biome: string
  /** Distinct per dungeon type. */
  readonly salt: number
  /** Acceptance probability per region (default 0.85). */
  readonly chance?: number
}

/** Placement parameters for a config (footprint from the kit). */
export function proceduralDungeonPlacement(config: ProceduralDungeonConfig, kit: DungeonKit): RegionDungeonPlacement {
  return { biome: config.biome, salt: config.salt, chance: config.chance, footprintRadius: kitFootprintRadius(kit) }
}

const warnedKits = new Set<string>()

/**
 * Generic procedural dungeon feature: add `new ProceduralDungeonFeature(config)`
 * to a biome's features list. Per sub-chunk: the region's anchor (pure),
 * the layout from the per-worker cache, and rasterization of whatever part
 * of the castle intersects this sub-chunk.
 */
export class ProceduralDungeonFeature extends Feature {
  readonly config: ProceduralDungeonConfig

  constructor(config: ProceduralDungeonConfig) {
    super()
    this.config = config
  }

  async scan(context: FeatureContext): Promise<void> {
    const kit = getDungeonKit(this.config.kitId)
    if (!kit) {
      if (!warnedKits.has(this.config.kitId)) {
        warnedKits.add(this.config.kitId)
        console.warn(`[dungeons] unknown dungeon kit '${this.config.kitId}' (import it in dungeons/kits/index.ts)`)
      }
      return
    }
    const chunk = context.chunk as unknown as SubChunkLike & { coordinate: ISubChunkCoordinate }
    const coord = chunk.coordinate
    const subY = typeof coord.subY === 'number' ? coord.subY : 0
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z
    const minY = subY * SUB_CHUNK_HEIGHT
    const seed = context.config.seed

    const regionX = Math.floor(chunkWorldX / BIOME_REGION_SIZE_BLOCKS)
    const regionZ = Math.floor(chunkWorldZ / BIOME_REGION_SIZE_BLOCKS)
    const placement = proceduralDungeonPlacement(this.config, kit)
    const anchor = regionDungeonAnchor(placement, regionX, regionZ, seed)
    if (!anchor) return

    // Cheap horizontal reject before touching the layout
    const r = placement.footprintRadius
    if (
      chunkWorldX > anchor.x + r ||
      chunkWorldX + CHUNK_SIZE_X - 1 < anchor.x - r ||
      chunkWorldZ > anchor.z + r ||
      chunkWorldZ + CHUNK_SIZE_Z - 1 < anchor.z - r
    ) {
      return
    }
    if (context.getBiomeNameAt && context.getBiomeNameAt(anchor.x, anchor.z) !== this.config.biome) return

    const height = context.getBaseHeightAt
    const layout = getCachedDungeonLayout(kit, anchor.x, anchor.z, seed, this.config.salt, height, this.config.biome)
    rasterizeDungeon(layout, kit, chunk, chunkWorldX, minY, chunkWorldZ, height, SUB_CHUNK_HEIGHT)
  }
}
