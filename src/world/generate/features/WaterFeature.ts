import { Feature, type FeatureContext } from './Feature.ts'
import type { WaterSettings } from '../BiomeGenerator.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

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
    if (!this.settings.enabled) return

    const { chunk, getBaseHeightAt, noise, frameBudget } = context
    const { liquidBlock, waterLevel, frequency, minDepth } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Skip if water level is entirely outside this sub-chunk's range
    if (waterLevel < subChunkMinY) return

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

    // Check if position or any adjacent position is in a water region
    // This ensures water continuity at chunk boundaries
    const shouldHaveWater = (worldX: number, worldZ: number, localX: number, localZ: number): boolean => {
      // Check current position
      if (isWaterRegion(worldX, worldZ)) return true

      // At chunk edges, also check adjacent positions to ensure continuity
      // If the neighboring chunk would have water, we should too
      const isLeftEdge = localX === 0
      const isRightEdge = localX === CHUNK_SIZE_X - 1
      const isTopEdge = localZ === 0
      const isBottomEdge = localZ === CHUNK_SIZE_Z - 1

      if (isLeftEdge && isWaterRegion(worldX - 1, worldZ)) return true
      if (isRightEdge && isWaterRegion(worldX + 1, worldZ)) return true
      if (isTopEdge && isWaterRegion(worldX, worldZ - 1)) return true
      if (isBottomEdge && isWaterRegion(worldX, worldZ + 1)) return true

      // Check corners too
      if (isLeftEdge && isTopEdge && isWaterRegion(worldX - 1, worldZ - 1)) return true
      if (isRightEdge && isTopEdge && isWaterRegion(worldX + 1, worldZ - 1)) return true
      if (isLeftEdge && isBottomEdge && isWaterRegion(worldX - 1, worldZ + 1)) return true
      if (isRightEdge && isBottomEdge && isWaterRegion(worldX + 1, worldZ + 1)) return true

      return false
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

        // Check if this column should have water (includes edge continuity check)
        if (!shouldHaveWater(worldX, worldZ, localX, localZ)) continue

        // Fill from terrain+1 up to waterLevel
        const fillStartWorldY = terrainHeight + 1
        const fillEndWorldY = waterLevel

        // Clamp to sub-chunk range
        const clampedStartY = Math.max(fillStartWorldY, subChunkMinY)
        const clampedEndY = Math.min(fillEndWorldY, subChunkMaxY)

        // Skip if no valid Y range in this sub-chunk
        if (clampedStartY > clampedEndY) continue

        // Fill water blocks in this column
        for (let worldY = clampedStartY; worldY <= clampedEndY; worldY++) {
          const localY = worldY - subChunkMinY

          // Only replace AIR blocks
          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (currentBlock === BlockIds.AIR) {
            chunk.setBlockId(localX, localY, localZ, liquidBlock)
          }
        }
      }
    }

    // Yield after processing (only in main thread context)
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }
}
