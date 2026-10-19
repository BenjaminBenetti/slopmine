import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/** Patches of a plant: zone noise groups them, `density` thins them inside a zone. */
export interface SubmergedPlantPatches {
  /** Large-scale noise frequency of the plant's zones */
  readonly zoneFrequency: number
  /** Zone noise threshold (0-1, lower = more of the pools grow it) */
  readonly zoneThreshold: number
  /** Per-column chance within a zone (0-1) */
  readonly density: number
}

/** Kelp-like strands: stalk segments from the bed up, ending in a top block. */
export interface SubmergedStrandSettings extends SubmergedPlantPatches {
  readonly stalkBlockId: number
  readonly topBlockId: number
  /** Least water depth (cells) a strand grows in */
  readonly minDepth: number
  /** Share of strands that reach the topmost water cell (the rest stop lower) */
  readonly surfaceChance: number
}

/** A one-cell plant on the bed, never in the topmost water cell. */
export interface SubmergedBedPlantSettings extends SubmergedPlantPatches {
  readonly blockId: number
}

/**
 * Settings for plants growing in a biome's pools (blocks with `submergedIn`:
 * their cell stays a source of the water to everything else).
 */
export interface SubmergedPlantFeatureSettings {
  /** The biome's water level: the Y of the topmost water cell */
  readonly waterLevel: number
  /** The water source block the plants stand in */
  readonly waterBlockId: number
  /** Pool beds a plant roots in */
  readonly validBedBlocks: readonly number[]
  readonly strands?: SubmergedStrandSettings
  readonly bedPlant?: SubmergedBedPlantSettings
}

/**
 * Water plants on the beds of a biome's pools (the swamp's glowkelp and
 * lanternweed): runs after the water fill, walks each column down from the
 * water level to its bed and replaces water cells with the plant. Strands
 * win over bed plants where both zones meet. A column whose bed lies below
 * this sub-chunk is skipped (every write stays in the sub-chunk, so the
 * result doesn't depend on generation order).
 */
export class SubmergedPlantFeature extends Feature {
  readonly settings: SubmergedPlantFeatureSettings

  constructor(settings: SubmergedPlantFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, noise } = context
    const { waterLevel, waterBlockId, validBedBlocks, strands, bedPlant } = this.settings
    const coord = chunk.coordinate
    const subY = typeof (coord as ISubChunkCoordinate).subY === 'number' ? (coord as ISubChunkCoordinate).subY : 0
    const minY = subY * SUB_CHUNK_HEIGHT
    const surfaceLocalY = waterLevel - minY
    if (surfaceLocalY < 1 || surfaceLocalY >= SUB_CHUNK_HEIGHT) return

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        if (chunk.getBlockId(localX, surfaceLocalY, localZ) !== waterBlockId) continue
        // Open water: the surface cell must be the top of the pool
        if (surfaceLocalY + 1 < SUB_CHUNK_HEIGHT && chunk.getBlockId(localX, surfaceLocalY + 1, localZ) !== 0) continue

        let bedLocalY = surfaceLocalY - 1
        while (bedLocalY >= 0 && chunk.getBlockId(localX, bedLocalY, localZ) === waterBlockId) bedLocalY--
        if (bedLocalY < 0 || !validBedBlocks.includes(chunk.getBlockId(localX, bedLocalY, localZ))) continue
        const depth = surfaceLocalY - bedLocalY

        const world = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(world.x)
        const worldZ = Number(world.z)

        if (strands && depth >= strands.minDepth && this.inPatch(strands, noise, worldX, worldZ, 1000)) {
          const length = hash(worldX, worldZ, 3) < strands.surfaceChance
            ? depth
            : 1 + Math.floor(hash(worldX, worldZ, 4) * (depth - 1))
          for (let i = 1; i < length; i++) chunk.setBlockId(localX, bedLocalY + i, localZ, strands.stalkBlockId)
          chunk.setBlockId(localX, bedLocalY + length, localZ, strands.topBlockId)
          continue
        }
        if (bedPlant && depth >= 2 && this.inPatch(bedPlant, noise, worldX, worldZ, 3000)) {
          chunk.setBlockId(localX, bedLocalY + 1, localZ, bedPlant.blockId)
        }
      }
    }
  }

  private inPatch(patches: SubmergedPlantPatches, noise: FeatureContext['noise'], x: number, z: number, salt: number): boolean {
    const zone = (noise.noise2D((x + salt) * patches.zoneFrequency, (z - salt) * patches.zoneFrequency) + 1) * 0.5
    return zone >= patches.zoneThreshold && hash(x, z, salt) < patches.density
  }
}

/** Deterministic 0-1 hash of a column (plus a salt per decision). */
function hash(x: number, z: number, salt: number): number {
  const n = Math.sin(x * 41.5261 + z * 23.6179 + salt * 7.1373) * 74183.2431
  return n - Math.floor(n)
}
