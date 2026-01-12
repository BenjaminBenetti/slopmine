import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import type { Chunk } from '../../chunks/Chunk.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Desert biome with sand surface, sandstone subsurface, and scattered cacti.
 */
export class DesertGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'desert',
    frequency: 0.5,
    treeDensity: 1.0, // Low density - cacti are sparse
    features: [
      // Sandstone cliffs
      new CliffFeature({
        frequency: 0.02,
        threshold: 0.7,
        maxHeight: 3,
        block: BlockIds.SANDSTONE,
      }),
      // Common ores - coal spawns near surface
      new OreFeature({
        blockId: BlockIds.COAL_BLOCK,
        frequency: 20,
        veinSize: 12,
        minY: 156,
        maxY: 256,
        peakY: 214,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE, BlockIds.SANDSTONE],
      }),
      // Iron spawns mid-level
      new OreFeature({
        blockId: BlockIds.IRON_BLOCK,
        frequency: 12,
        veinSize: 8,
        minY: 156,
        maxY: 220,
        peakY: 188,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE, BlockIds.SANDSTONE],
      }),
      // Copper spawns similar to iron but slightly higher
      new OreFeature({
        blockId: BlockIds.COPPER_BLOCK,
        frequency: 10,
        veinSize: 10,
        minY: 156,
        maxY: 236,
        peakY: 204,
        ySpread: 20,
        replaceableBlocks: [BlockIds.STONE, BlockIds.SANDSTONE],
      }),
      // Gold spawns deep and rarely
      new OreFeature({
        blockId: BlockIds.GOLD_BLOCK,
        frequency: 4,
        veinSize: 6,
        minY: 156,
        maxY: 188,
        peakY: 168,
        ySpread: 8,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Diamond spawns very deep and very rarely
      new OreFeature({
        blockId: BlockIds.DIAMOND_BLOCK,
        frequency: 2,
        veinSize: 4,
        minY: 156,
        maxY: 172,
        peakY: 164,
        ySpread: 4,
        replaceableBlocks: [BlockIds.STONE],
      }),
    ],
    caves: {
      enabled: true,
      frequency: 0.004,
      threshold: 0.008,
      minY: 164,
      maxY: 224,
      layerCount: 1,
      layerSpacing: 16,
      layerPeakY: 188,
      cheeseEnabled: true,
      cheeseFrequency: 0.003,
      cheeseThreshold: 0.85,
      entrancesEnabled: true,
      entranceMinWidth: 8,
      entranceThreshold: 0.5,
    },
    // No water in desert
    water: {
      enabled: false,
      liquidBlock: BlockIds.WATER,
      waterLevel: 238,
      frequency: 0,
      minDepth: 10,
    },
    terrainConfig: {
      layers: [
        {
          type: 'fractal',
          octaves: 3,
          persistence: 0.4,
          scale: 0.008,
          weight: 1.0,
        },
        // Add dunes layer for rolling sand hills
        {
          type: 'fractal',
          octaves: 2,
          persistence: 0.6,
          scale: 0.02,
          weight: 0.5,
        },
      ],
      baseHeight: 0,
      heightScale: 12, // Slightly more dramatic than plains
      combineMode: 'add',
    } as TerrainConfig,
  }

  // Cactus placement grid size
  private readonly CACTUS_GRID_SIZE = 12

  /**
   * Fill terrain with sand, sandstone, and stone layers.
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const coord = chunk.coordinate
    const terrainFloor = this.config.seaLevel - this.config.terrainThickness

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const height = getHeightAt(worldX, worldZ)

        // Layer boundaries (world Y)
        const surfaceY = height
        const sandStartY = height
        const sandEndY = height - 4  // 5 blocks of sand
        const sandstoneStartY = sandEndY - 1
        const sandstoneEndY = height - 12  // 8 blocks of sandstone
        const stoneStartY = sandstoneEndY - 1
        const stoneEndY = terrainFloor

        // Surface and near-surface: sand
        for (let worldY = Math.min(sandStartY, maxY); worldY >= Math.max(sandEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.SAND)
          }
        }

        // Mid layer: sandstone
        for (let worldY = Math.min(sandstoneStartY, maxY); worldY >= Math.max(sandstoneEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.SANDSTONE)
          }
        }

        // Base: stone
        for (let worldY = Math.min(stoneStartY, maxY); worldY >= Math.max(stoneEndY, minY); worldY--) {
          const localY = worldY - minY
          chunk.setBlockId(localX, localY, localZ, BlockIds.STONE)
        }
      }
    }
  }

  protected override async generateDecorations(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    await this.generateCacti(chunk, world)
  }

  override async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    await this.generateCactiForSubChunk(subChunk, world)
  }

  /**
   * Generate scattered cacti for a specific sub-chunk.
   */
  private async generateCactiForSubChunk(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    const coord = subChunk.coordinate
    const cactusDensity = this.properties.treeDensity
    const gridSize = this.CACTUS_GRID_SIZE

    // Sub-chunk Y bounds
    const minSubY = Number(coord.subY) * SUB_CHUNK_HEIGHT
    const maxSubY = minSubY + SUB_CHUNK_HEIGHT - 1

    let cactiPlaced = 0

    // Check each cell in a grid pattern for potential cactus positions
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for more natural placement
        const jitterX = Math.floor(
          this.positionRandom(worldX, worldZ, 1) * gridSize
        )
        const jitterZ = Math.floor(
          this.positionRandom(worldX, worldZ, 2) * gridSize
        )

        const cactusWorldX = worldX + jitterX
        const cactusWorldZ = worldZ + jitterZ

        // Probability check for cactus placement
        const cactusChance = this.positionRandom(cactusWorldX, cactusWorldZ, 0)
        const threshold = cactusDensity / (gridSize * gridSize)

        if (cactusChance > threshold) continue

        // Get ground height at cactus position
        const groundHeight = this.getHeightAt(cactusWorldX, cactusWorldZ)
        const cactusBaseY = groundHeight + 1

        // Only place cactus if its base is within this sub-chunk
        if (cactusBaseY < minSubY || cactusBaseY > maxSubY) continue

        // Random cactus height (1-3 blocks tall)
        const cactusHeight = 1 + Math.floor(this.positionRandom(cactusWorldX, cactusWorldZ, 3) * 3)

        const baseX = BigInt(cactusWorldX)
        const baseY = BigInt(cactusBaseY)
        const baseZ = BigInt(cactusWorldZ)

        // Check if we can place the cactus
        if (this.canPlaceCactus(world, baseX, baseY, baseZ, cactusHeight)) {
          this.placeCactus(world, baseX, baseY, baseZ, cactusHeight)
          cactiPlaced++

          // Yield every 3 cacti to prevent frame blocking
          if (cactiPlaced % 3 === 0) {
            await this.yieldToEventLoop()
          }
        }
      }
    }

    // Final yield after cactus generation
    await this.yieldToEventLoop()
  }

  /**
   * Generate scattered cacti for full chunk.
   */
  private async generateCacti(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    const coord = chunk.coordinate
    const cactusDensity = this.properties.treeDensity
    const gridSize = this.CACTUS_GRID_SIZE

    let cactiPlaced = 0

    // Check each cell in a grid pattern for potential cactus positions
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for more natural placement
        const jitterX = Math.floor(
          this.positionRandom(worldX, worldZ, 1) * gridSize
        )
        const jitterZ = Math.floor(
          this.positionRandom(worldX, worldZ, 2) * gridSize
        )

        const cactusWorldX = worldX + jitterX
        const cactusWorldZ = worldZ + jitterZ

        // Probability check for cactus placement
        const cactusChance = this.positionRandom(cactusWorldX, cactusWorldZ, 0)
        const threshold = cactusDensity / (gridSize * gridSize)

        if (cactusChance > threshold) continue

        // Get ground height at cactus position
        const groundHeight = this.getHeightAt(cactusWorldX, cactusWorldZ)

        // Random cactus height (1-3 blocks tall)
        const cactusHeight = 1 + Math.floor(this.positionRandom(cactusWorldX, cactusWorldZ, 3) * 3)

        const baseX = BigInt(cactusWorldX)
        const baseY = BigInt(groundHeight + 1)
        const baseZ = BigInt(cactusWorldZ)

        // Check if we can place the cactus
        if (this.canPlaceCactus(world, baseX, baseY, baseZ, cactusHeight)) {
          this.placeCactus(world, baseX, baseY, baseZ, cactusHeight)
          cactiPlaced++

          // Yield every 3 cacti to prevent frame blocking
          if (cactiPlaced % 3 === 0) {
            await this.yieldToEventLoop()
          }
        }
      }
    }

    // Final yield after cactus generation
    await this.yieldToEventLoop()
  }

  /**
   * Check if a cactus can be placed at the given location.
   */
  private canPlaceCactus(
    world: WorldManager,
    x: bigint,
    y: bigint,
    z: bigint,
    height: number
  ): boolean {
    // Check that the block below is sand
    const blockBelow = world.getBlockId(x, y - 1n, z)
    if (blockBelow !== BlockIds.SAND) return false

    // Check that all cactus blocks would be in air
    for (let i = 0; i < height; i++) {
      const blockAt = world.getBlockId(x, y + BigInt(i), z)
      if (blockAt !== BlockIds.AIR) return false
    }

    // Check that there are no adjacent blocks (cacti need space)
    for (let i = 0; i < height; i++) {
      const cy = y + BigInt(i)
      if (world.getBlockId(x + 1n, cy, z) !== BlockIds.AIR) return false
      if (world.getBlockId(x - 1n, cy, z) !== BlockIds.AIR) return false
      if (world.getBlockId(x, cy, z + 1n) !== BlockIds.AIR) return false
      if (world.getBlockId(x, cy, z - 1n) !== BlockIds.AIR) return false
    }

    return true
  }

  /**
   * Place a cactus at the given location.
   */
  private placeCactus(
    world: WorldManager,
    x: bigint,
    y: bigint,
    z: bigint,
    height: number
  ): void {
    for (let i = 0; i < height; i++) {
      world.setBlock(x, y + BigInt(i), z, BlockIds.CACTUS)
    }
  }
}
