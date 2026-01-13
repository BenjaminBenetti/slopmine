import { Feature, type FeatureContext } from './Feature.ts'
import type { WaterSettings } from '../BiomeGenerator.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Describes which edges of a chunk have water that could affect neighbors.
 * Used to trigger re-processing of adjacent chunks.
 */
export interface WaterEdgeEffects {
  /** True if water was placed on the -X edge (localX === 0) */
  hasWaterOnNegX: boolean
  /** True if water was placed on the +X edge (localX === CHUNK_SIZE_X - 1) */
  hasWaterOnPosX: boolean
  /** True if water was placed on the -Z edge (localZ === 0) */
  hasWaterOnNegZ: boolean
  /** True if water was placed on the +Z edge (localZ === CHUNK_SIZE_Z - 1) */
  hasWaterOnPosZ: boolean
}

/**
 * Water feature that fills terrain depressions with water.
 *
 * Algorithm (Depression-Based Fill):
 * 1. For each column (x,z), check if terrain height < waterLevel
 * 2. Fill from terrain+1 up to waterLevel
 * 3. Only fill AIR blocks (don't replace solid blocks or cave air)
 *
 * Water fills ALL depressions below waterLevel, creating continuous
 * pools that naturally span chunk boundaries and reach the edge of
 * depressions like real water.
 */
export class WaterFeature extends Feature {
  readonly settings: WaterSettings

  constructor(settings: WaterSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    await this.scanWithEdgeEffects(context)
  }

  /**
   * Scan and fill water, returning edge effects for neighbor propagation.
   * Fills all depressions where terrain is below waterLevel and depth >= minDepth.
   * No noise gating - water naturally fills connected basins like real water.
   */
  async scanWithEdgeEffects(context: FeatureContext): Promise<WaterEdgeEffects> {
    const edgeEffects: WaterEdgeEffects = {
      hasWaterOnNegX: false,
      hasWaterOnPosX: false,
      hasWaterOnNegZ: false,
      hasWaterOnPosZ: false,
    }

    if (!this.settings.enabled) return edgeEffects

    const { chunk, getBaseHeightAt, frameBudget } = context
    const { liquidBlock, waterLevel } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT

    // Skip if water level is entirely outside this sub-chunk's range
    if (waterLevel < subChunkMinY) return edgeEffects

    frameBudget?.startFrame()

    // Iterate over each column in the chunk
    // Water fills all depressions meeting the depth requirement - no noise gating
    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        // Convert to world coordinates
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Get the BASE terrain height (before caves)
        const terrainHeight = getBaseHeightAt(worldX, worldZ)

        // Skip if terrain is at or above water level
        if (terrainHeight >= waterLevel) continue

        // Fill from terrain+1 up to waterLevel
        const fillStartWorldY = terrainHeight + 1
        const fillEndWorldY = waterLevel

        // Clamp to sub-chunk range
        const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1
        const clampedStartY = Math.max(fillStartWorldY, subChunkMinY)
        const clampedEndY = Math.min(fillEndWorldY, subChunkMaxY)

        // Skip if no valid Y range in this sub-chunk
        if (clampedStartY > clampedEndY) continue

        // Fill water blocks in this column
        let placedWaterInColumn = false
        for (let worldY = clampedStartY; worldY <= clampedEndY; worldY++) {
          const localY = worldY - subChunkMinY

          // Only replace AIR blocks
          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (currentBlock === BlockIds.AIR) {
            chunk.setBlockId(localX, localY, localZ, liquidBlock)
            placedWaterInColumn = true
          }
        }

        // Track edge effects for neighbor propagation
        if (placedWaterInColumn) {
          if (localX === 0) edgeEffects.hasWaterOnNegX = true
          if (localX === CHUNK_SIZE_X - 1) edgeEffects.hasWaterOnPosX = true
          if (localZ === 0) edgeEffects.hasWaterOnNegZ = true
          if (localZ === CHUNK_SIZE_Z - 1) edgeEffects.hasWaterOnPosZ = true
        }
      }
    }

    // Yield after processing (only in main thread context)
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }

    return edgeEffects
  }
}
