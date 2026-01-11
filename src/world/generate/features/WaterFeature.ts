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
 * Algorithm (Depression-Based Fill with Noise Regions):
 * 1. Use low-frequency noise to define water regions (pools vs dry areas)
 * 2. For each column (x,z), check if it's in a water region
 * 3. Check if the depression is deep enough (minDepth requirement)
 * 4. If terrain height < water level, fill from terrain+1 up to water level
 * 5. Only fill AIR blocks (don't replace solid blocks or cave air)
 *
 * This creates natural-looking pools with smooth boundaries rather than
 * random per-block fragmentation.
 */
export class WaterFeature extends Feature {
  readonly settings: WaterSettings

  constructor(settings: WaterSettings) {
    super()
    this.settings = settings
  }

  /**
   * Check if a grid cell qualifies for water based on noise and minDepth.
   */
  private cellHasWater(
    gridX: number,
    gridZ: number,
    gridSize: number,
    waterLevel: number,
    minDepth: number,
    noiseThreshold: number,
    noise: FeatureContext['noise'],
    getBaseHeightAt: (x: number, z: number) => number
  ): boolean {
    // First check noise threshold
    const waterNoise = noise.noise2D(gridX * 0.005, gridZ * 0.005)
    if (waterNoise < noiseThreshold) {
      return false
    }

    // Check if there's at least one deep enough depression in this cell
    // Sample corners and center
    const samplePoints = [
      [gridX, gridZ],
      [gridX + gridSize - 1, gridZ],
      [gridX, gridZ + gridSize - 1],
      [gridX + gridSize - 1, gridZ + gridSize - 1],
      [gridX + Math.floor(gridSize / 2), gridZ + Math.floor(gridSize / 2)],
    ]

    for (const [x, z] of samplePoints) {
      const terrainHeight = getBaseHeightAt(x, z)
      const depth = waterLevel - terrainHeight
      if (depth >= minDepth) {
        return true
      }
    }
    return false
  }

  async scan(context: FeatureContext): Promise<void> {
    await this.scanWithEdgeEffects(context)
  }

  /**
   * Scan and fill water, returning edge effects for neighbor propagation.
   */
  async scanWithEdgeEffects(context: FeatureContext): Promise<WaterEdgeEffects> {
    const edgeEffects: WaterEdgeEffects = {
      hasWaterOnNegX: false,
      hasWaterOnPosX: false,
      hasWaterOnNegZ: false,
      hasWaterOnPosZ: false,
    }

    if (!this.settings.enabled) return edgeEffects

    const { chunk, getBaseHeightAt, noise, frameBudget } = context
    const { liquidBlock, waterLevel, frequency, minDepth } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Skip if water level is entirely outside this sub-chunk's range
    if (waterLevel < subChunkMinY) return edgeEffects

    // Convert frequency (0-1) to a noise threshold
    const noiseThreshold = 1 - frequency * 2

    // Grid size for water region decisions
    const gridSize = 128

    // Cache grid cell water decisions
    const gridCache = new Map<string, boolean>()

    const isWaterRegion = (worldX: number, worldZ: number): boolean => {
      const gridX = Math.floor(worldX / gridSize) * gridSize
      const gridZ = Math.floor(worldZ / gridSize) * gridSize
      const key = `${gridX},${gridZ}`

      let result = gridCache.get(key)
      if (result === undefined) {
        result = this.cellHasWater(
          gridX, gridZ, gridSize, waterLevel, minDepth,
          noiseThreshold, noise, getBaseHeightAt
        )
        gridCache.set(key, result)
      }
      return result
    }

    // Determine if this chunk should have water by checking:
    // 1. Any corner of the chunk is in a water region
    // 2. Any adjacent position (just outside chunk) is in a water region
    // This ensures entire depressions fill, not just edge blocks
    const chunkOrigin = localToWorld(coord, { x: 0, y: 0, z: 0 })
    const chunkBaseX = Number(chunkOrigin.x)
    const chunkBaseZ = Number(chunkOrigin.z)

    let chunkHasWater = false

    // Check chunk corners
    const corners = [
      [chunkBaseX, chunkBaseZ],
      [chunkBaseX + CHUNK_SIZE_X - 1, chunkBaseZ],
      [chunkBaseX, chunkBaseZ + CHUNK_SIZE_Z - 1],
      [chunkBaseX + CHUNK_SIZE_X - 1, chunkBaseZ + CHUNK_SIZE_Z - 1],
    ]
    for (const [x, z] of corners) {
      if (isWaterRegion(x, z)) {
        chunkHasWater = true
        break
      }
    }

    // If no corner has water, check adjacent positions for cross-chunk continuity
    if (!chunkHasWater) {
      const adjacentChecks = [
        [chunkBaseX - 1, chunkBaseZ + Math.floor(CHUNK_SIZE_Z / 2)],  // left edge center
        [chunkBaseX + CHUNK_SIZE_X, chunkBaseZ + Math.floor(CHUNK_SIZE_Z / 2)],  // right edge center
        [chunkBaseX + Math.floor(CHUNK_SIZE_X / 2), chunkBaseZ - 1],  // top edge center
        [chunkBaseX + Math.floor(CHUNK_SIZE_X / 2), chunkBaseZ + CHUNK_SIZE_Z],  // bottom edge center
      ]
      for (const [x, z] of adjacentChecks) {
        if (isWaterRegion(x, z)) {
          chunkHasWater = true
          break
        }
      }
    }

    frameBudget?.startFrame()

    // Iterate over each column in the chunk
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

        // Skip if this chunk doesn't have water
        if (!chunkHasWater) continue

        // Fill from terrain+1 up to waterLevel
        const fillStartWorldY = terrainHeight + 1
        const fillEndWorldY = waterLevel

        // Clamp to sub-chunk range
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
