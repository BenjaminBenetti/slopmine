import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Settings for oasis generation.
 */
export interface OasisSettings {
  /** Whether oasis generation is enabled */
  enabled: boolean
  /** Block ID for the water (default: WATER) */
  liquidBlock: number
  /** Noise threshold for oasis placement (higher = rarer, 0-1) */
  rarity: number
  /** Minimum radius of oasis pools in blocks */
  minRadius: number
  /** Maximum radius of oasis pools in blocks */
  maxRadius: number
  /** Depth of water in the oasis */
  waterDepth: number
}

/**
 * Represents a generated oasis location for cactus spawning reference.
 */
export interface OasisLocation {
  /** World X coordinate of oasis center */
  x: number
  /** World Z coordinate of oasis center */
  z: number
  /** Radius of this oasis */
  radius: number
}

/**
 * Oasis feature that creates rare water pools in desert biomes.
 *
 * Algorithm:
 * 1. Use grid-based placement with noise to determine oasis centers
 * 2. Create circular depressions in terrain
 * 3. Fill with water up to a natural water level
 * 4. Track oasis locations for vegetation spawning
 */
export class OasisFeature extends Feature {
  readonly settings: OasisSettings

  /** Oasis locations generated in the current chunk (for cactus spawning) */
  private generatedOases: OasisLocation[] = []

  /** Grid size for oasis placement (one potential oasis per grid cell) */
  private readonly OASIS_GRID_SIZE = 64

  constructor(settings: OasisSettings) {
    super()
    this.settings = settings
  }

  /**
   * Get the oasis locations generated in the last scan.
   * Call this after scan() to get oasis positions for cactus spawning.
   */
  getGeneratedOases(): OasisLocation[] {
    return this.generatedOases
  }

  /**
   * Clear stored oasis locations. Call before each new chunk.
   */
  clearOases(): void {
    this.generatedOases = []
  }

  /**
   * Deterministic random based on position.
   */
  private positionRandom(x: number, y: number, z: number, salt: number): number {
    const n = Math.sin(x * 12.9898 + y * 4.1414 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return n - Math.floor(n)
  }

  /**
   * Check if a position is within an oasis based on noise.
   */
  private shouldHaveOasis(
    gridX: number,
    gridZ: number,
    noise: FeatureContext['noise']
  ): boolean {
    // Use low-frequency noise for oasis placement
    const oasisNoise = noise.noise2D(gridX * 0.003, gridZ * 0.003)
    // Convert to 0-1 range and check against rarity threshold
    const normalizedNoise = (oasisNoise + 1) / 2
    return normalizedNoise > this.settings.rarity
  }

  /**
   * Calculate the radius for an oasis at a given position.
   */
  private getOasisRadius(centerX: number, centerZ: number): number {
    const { minRadius, maxRadius } = this.settings
    const radiusRange = maxRadius - minRadius
    const radiusFactor = this.positionRandom(centerX, 0, centerZ, 100)
    return minRadius + Math.floor(radiusFactor * (radiusRange + 1))
  }

  async scan(context: FeatureContext): Promise<void> {
    if (!this.settings.enabled) return

    // Clear previous oases before generating new ones
    this.clearOases()

    const { chunk, getBaseHeightAt, noise, frameBudget } = context
    const { liquidBlock, waterDepth } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Get chunk world origin
    const chunkOrigin = localToWorld(coord, { x: 0, y: 0, z: 0 })
    const chunkBaseX = Number(chunkOrigin.x)
    const chunkBaseZ = Number(chunkOrigin.z)

    frameBudget?.startFrame()

    // Check grid cells that could affect this chunk (including neighboring cells)
    const gridSize = this.OASIS_GRID_SIZE
    const searchRadius = this.settings.maxRadius + 2

    // Expand search to include grid cells whose oases might extend into this chunk
    const startGridX = Math.floor((chunkBaseX - searchRadius) / gridSize) * gridSize
    const endGridX = Math.floor((chunkBaseX + CHUNK_SIZE_X + searchRadius) / gridSize) * gridSize
    const startGridZ = Math.floor((chunkBaseZ - searchRadius) / gridSize) * gridSize
    const endGridZ = Math.floor((chunkBaseZ + CHUNK_SIZE_Z + searchRadius) / gridSize) * gridSize

    // Find all oases that could affect this chunk
    const oasesToApply: OasisLocation[] = []

    for (let gridX = startGridX; gridX <= endGridX; gridX += gridSize) {
      for (let gridZ = startGridZ; gridZ <= endGridZ; gridZ += gridSize) {
        if (!this.shouldHaveOasis(gridX, gridZ, noise)) continue

        // Jitter the oasis center within the grid cell
        const jitterX = Math.floor(this.positionRandom(gridX, 0, gridZ, 1) * (gridSize - 10)) + 5
        const jitterZ = Math.floor(this.positionRandom(gridX, 0, gridZ, 2) * (gridSize - 10)) + 5

        const centerX = gridX + jitterX
        const centerZ = gridZ + jitterZ
        const radius = this.getOasisRadius(centerX, centerZ)

        // Check if this oasis could affect the current chunk
        const minX = centerX - radius - 1
        const maxX = centerX + radius + 1
        const minZ = centerZ - radius - 1
        const maxZ = centerZ + radius + 1

        const overlapsChunkX = maxX >= chunkBaseX && minX < chunkBaseX + CHUNK_SIZE_X
        const overlapsChunkZ = maxZ >= chunkBaseZ && minZ < chunkBaseZ + CHUNK_SIZE_Z

        if (overlapsChunkX && overlapsChunkZ) {
          oasesToApply.push({ x: centerX, z: centerZ, radius })
        }
      }
    }

    // Track oases whose centers are in this chunk (for cactus spawning)
    for (const oasis of oasesToApply) {
      const inChunkX = oasis.x >= chunkBaseX && oasis.x < chunkBaseX + CHUNK_SIZE_X
      const inChunkZ = oasis.z >= chunkBaseZ && oasis.z < chunkBaseZ + CHUNK_SIZE_Z
      if (inChunkX && inChunkZ) {
        this.generatedOases.push(oasis)
      }
    }

    // Apply each oasis to the chunk
    for (const oasis of oasesToApply) {
      await this.applyOasis(
        chunk,
        oasis,
        chunkBaseX,
        chunkBaseZ,
        subChunkMinY,
        subChunkMaxY,
        getBaseHeightAt,
        liquidBlock,
        waterDepth,
        frameBudget
      )
    }

    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Apply a single oasis to the chunk.
   */
  private async applyOasis(
    chunk: FeatureContext['chunk'],
    oasis: OasisLocation,
    chunkBaseX: number,
    chunkBaseZ: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    getBaseHeightAt: (x: number, z: number) => number,
    liquidBlock: number,
    waterDepth: number,
    frameBudget?: FeatureContext['frameBudget']
  ): Promise<void> {
    const { x: centerX, z: centerZ, radius } = oasis
    const radiusSq = radius * radius

    // Find the lowest terrain height in the oasis area to determine water level
    let lowestHeight = Infinity
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz <= radiusSq) {
          const height = getBaseHeightAt(centerX + dx, centerZ + dz)
          if (height < lowestHeight) {
            lowestHeight = height
          }
        }
      }
    }

    // Water level is at the lowest point in the depression
    const waterLevel = lowestHeight

    // Iterate over the oasis area within chunk bounds
    const minLocalX = Math.max(0, centerX - radius - chunkBaseX)
    const maxLocalX = Math.min(CHUNK_SIZE_X - 1, centerX + radius - chunkBaseX)
    const minLocalZ = Math.max(0, centerZ - radius - chunkBaseZ)
    const maxLocalZ = Math.min(CHUNK_SIZE_Z - 1, centerZ + radius - chunkBaseZ)

    for (let localX = minLocalX; localX <= maxLocalX; localX++) {
      for (let localZ = minLocalZ; localZ <= maxLocalZ; localZ++) {
        const worldX = chunkBaseX + localX
        const worldZ = chunkBaseZ + localZ

        // Check if within circular oasis
        const dx = worldX - centerX
        const dz = worldZ - centerZ
        const distSq = dx * dx + dz * dz

        if (distSq > radiusSq) continue

        // Get terrain height at this position
        const terrainHeight = getBaseHeightAt(worldX, worldZ)

        // Calculate depression depth based on distance from center
        // Center is deepest, edges are shallower
        const distFactor = Math.sqrt(distSq) / radius
        const depressionDepth = Math.floor(waterDepth * (1 - distFactor * 0.5))

        // Dig depression and fill with water
        const targetDepth = waterLevel - depressionDepth

        for (let worldY = terrainHeight; worldY >= targetDepth; worldY--) {
          // Skip if outside sub-chunk Y range
          if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

          const localY = worldY - subChunkMinY

          if (worldY > waterLevel) {
            // Above water level - dig out terrain (replace with air)
            const currentBlock = chunk.getBlockId(localX, localY, localZ)
            if (currentBlock !== BlockIds.AIR) {
              chunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
            }
          } else if (worldY > targetDepth) {
            // At or below water level but above bottom - fill with water
            const currentBlock = chunk.getBlockId(localX, localY, localZ)
            if (currentBlock === BlockIds.AIR || currentBlock === BlockIds.SAND) {
              chunk.setBlockId(localX, localY, localZ, liquidBlock)
            }
          }
        }

        // Place sand at the bottom of the oasis
        const bottomY = targetDepth
        if (bottomY >= subChunkMinY && bottomY <= subChunkMaxY) {
          const localBottomY = bottomY - subChunkMinY
          chunk.setBlockId(localX, localBottomY, localZ, BlockIds.SAND)
        }
      }
    }

    // Place cacti around the oasis (ring from radius+1 to radius+10)
    await this.placeCactiAroundOasis(
      chunk,
      oasis,
      chunkBaseX,
      chunkBaseZ,
      subChunkMinY,
      subChunkMaxY,
      getBaseHeightAt
    )

    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Place cacti in a ring around the oasis.
   */
  private async placeCactiAroundOasis(
    chunk: FeatureContext['chunk'],
    oasis: OasisLocation,
    chunkBaseX: number,
    chunkBaseZ: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    getBaseHeightAt: (x: number, z: number) => number
  ): Promise<void> {
    const { x: centerX, z: centerZ, radius } = oasis
    const innerRadius = radius + 2  // Start just outside water
    const outerRadius = radius + 12 // Extend outward

    // Try to place cacti at grid positions around the oasis
    const cactusSpacing = 3 // Minimum spacing between cacti

    for (let dx = -outerRadius; dx <= outerRadius; dx += cactusSpacing) {
      for (let dz = -outerRadius; dz <= outerRadius; dz += cactusSpacing) {
        const distSq = dx * dx + dz * dz
        const dist = Math.sqrt(distSq)

        // Only place in the ring around the oasis
        if (dist < innerRadius || dist > outerRadius) continue

        const worldX = centerX + dx
        const worldZ = centerZ + dz

        // Check if within chunk bounds
        const localX = worldX - chunkBaseX
        const localZ = worldZ - chunkBaseZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        // Use position-based random for deterministic placement
        const rand = this.positionRandom(worldX, 0, worldZ, 200)

        // Higher chance closer to water (70% at edge, 30% at outer ring)
        const distFactor = (dist - innerRadius) / (outerRadius - innerRadius)
        const placeChance = 0.7 - distFactor * 0.4
        if (rand > placeChance) continue

        // Get terrain height and check if cactus base is in this sub-chunk
        const terrainHeight = getBaseHeightAt(worldX, worldZ)
        const cactusBaseY = terrainHeight + 1

        if (cactusBaseY < subChunkMinY || cactusBaseY > subChunkMaxY) continue

        const localBaseY = cactusBaseY - subChunkMinY

        // Check block below is sand
        if (localBaseY > 0) {
          const blockBelow = chunk.getBlockId(localX, localBaseY - 1, localZ)
          if (blockBelow !== BlockIds.SAND) continue
        }

        // Check cactus position is air
        if (chunk.getBlockId(localX, localBaseY, localZ) !== BlockIds.AIR) continue

        // Random cactus height (1-3)
        const heightRand = this.positionRandom(worldX, 1, worldZ, 201)
        const cactusHeight = 1 + Math.floor(heightRand * 3)

        // Place cactus blocks
        for (let h = 0; h < cactusHeight; h++) {
          const y = localBaseY + h
          if (y >= SUB_CHUNK_HEIGHT) break
          if (chunk.getBlockId(localX, y, localZ) !== BlockIds.AIR) break
          chunk.setBlockId(localX, y, localZ, BlockIds.CACTUS)
        }
      }
    }
  }
}
