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
 * Swamp biome with mud surface, clay subsurface, and scattered mushrooms.
 * Features murky water pools at low elevations.
 */
export class SwampGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'swamp',
    frequency: 0.5,
    treeDensity: 8.0, // Mushroom density
    features: [
      // Clay mounds
      new CliffFeature({
        frequency: 0.015,
        threshold: 0.65,
        maxHeight: 2,
        block: BlockIds.CLAY,
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
        replaceableBlocks: [BlockIds.STONE, BlockIds.CLAY],
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
        replaceableBlocks: [BlockIds.STONE, BlockIds.CLAY],
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
        replaceableBlocks: [BlockIds.STONE, BlockIds.CLAY],
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
      frequency: 0.003,
      threshold: 0.006,
      minY: 164,
      maxY: 220,
      layerCount: 1,
      layerSpacing: 16,
      layerPeakY: 188,
      cheeseEnabled: true,
      cheeseFrequency: 0.002,
      cheeseThreshold: 0.82,
      entrancesEnabled: true,
      entranceMinWidth: 6,
      entranceThreshold: 0.45,
    },
    // Swamp water - murky water pools throughout
    water: {
      enabled: true,
      liquidBlock: BlockIds.SWAMP_WATER,
      waterLevel: 234,
      frequency: 0.5,  // Lots of water in swamps
      minDepth: 2,     // Shallow pools
    },
    terrainConfig: {
      layers: [
        {
          type: 'fractal',
          octaves: 3,
          persistence: 0.35,
          scale: 0.006,
          weight: 1.0,
        },
        // Low rolling hills for swamp
        {
          type: 'fractal',
          octaves: 2,
          persistence: 0.5,
          scale: 0.015,
          weight: 0.3,
        },
      ],
      baseHeight: -5, // Lower terrain so more is below water level
      heightScale: 10, // Slightly more variation for water pools
      combineMode: 'add',
    } as TerrainConfig,
    // Swamp has a darker, murky atmosphere
    skybox: {
      brightness: 0.6, // 60% brightness for darker sky
      tint: { r: 0.85, g: 0.9, b: 0.75 }, // Slight greenish-brown tint
    },
  }

  // Mushroom placement grid size
  private readonly MUSHROOM_GRID_SIZE = 10

  /**
   * Fill terrain with mud, clay, and stone layers.
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
        const mudStartY = height
        const mudEndY = height - 3  // 4 blocks of mud
        const clayStartY = mudEndY - 1
        const clayEndY = height - 10  // 7 blocks of clay
        const stoneStartY = clayEndY - 1
        const stoneEndY = terrainFloor

        // Top surface: muddy grass (or exposed mud near water for shoreline effect)
        if (mudStartY >= minY && mudStartY <= maxY && mudStartY >= terrainFloor) {
          const localY = mudStartY - minY
          const waterLevel = this.properties.water?.waterLevel ?? 234
          // Use exposed mud within 2 blocks of water level for muddy shoreline
          const isNearWater = height <= waterLevel + 2
          chunk.setBlockId(localX, localY, localZ, isNearWater ? BlockIds.MUD : BlockIds.MUDDY_GRASS)
        }

        // Below surface: mud
        for (let worldY = Math.min(mudStartY - 1, maxY); worldY >= Math.max(mudEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.MUD)
          }
        }

        // Mid layer: clay
        for (let worldY = Math.min(clayStartY, maxY); worldY >= Math.max(clayEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.CLAY)
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
    await this.generateMushrooms(chunk, world)
  }

  override async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    await this.generateMushroomsForSubChunk(subChunk, world)
  }

  /**
   * Generate scattered mushrooms for a specific sub-chunk.
   */
  private async generateMushroomsForSubChunk(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    const coord = subChunk.coordinate
    const mushroomDensity = this.properties.treeDensity
    const gridSize = this.MUSHROOM_GRID_SIZE

    // Sub-chunk Y bounds
    const minSubY = Number(coord.subY) * SUB_CHUNK_HEIGHT
    const maxSubY = minSubY + SUB_CHUNK_HEIGHT - 1

    let mushroomsPlaced = 0

    // Check each cell in a grid pattern for potential mushroom positions
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

        const mushroomWorldX = worldX + jitterX
        const mushroomWorldZ = worldZ + jitterZ

        // Probability check for mushroom placement
        const mushroomChance = this.positionRandom(mushroomWorldX, mushroomWorldZ, 0)
        const threshold = mushroomDensity / (gridSize * gridSize)

        if (mushroomChance > threshold) continue

        // Get ground height at mushroom position
        const groundHeight = this.getHeightAt(mushroomWorldX, mushroomWorldZ)
        const mushroomBaseY = groundHeight + 1

        // Only place mushroom if its base is within this sub-chunk
        if (mushroomBaseY < minSubY || mushroomBaseY > maxSubY) continue

        const baseX = BigInt(mushroomWorldX)
        const baseY = BigInt(mushroomBaseY)
        const baseZ = BigInt(mushroomWorldZ)

        // Check if we can place the mushroom
        if (this.canPlaceMushroom(world, baseX, baseY, baseZ)) {
          this.placeMushroom(world, baseX, baseY, baseZ)
          mushroomsPlaced++

          // Yield every 5 mushrooms to prevent frame blocking
          if (mushroomsPlaced % 5 === 0) {
            await this.yieldToEventLoop()
          }
        }
      }
    }

    // Final yield after mushroom generation
    await this.yieldToEventLoop()
  }

  /**
   * Generate scattered mushrooms for full chunk.
   */
  private async generateMushrooms(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    const coord = chunk.coordinate
    const mushroomDensity = this.properties.treeDensity
    const gridSize = this.MUSHROOM_GRID_SIZE

    let mushroomsPlaced = 0

    // Check each cell in a grid pattern for potential mushroom positions
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

        const mushroomWorldX = worldX + jitterX
        const mushroomWorldZ = worldZ + jitterZ

        // Probability check for mushroom placement
        const mushroomChance = this.positionRandom(mushroomWorldX, mushroomWorldZ, 0)
        const threshold = mushroomDensity / (gridSize * gridSize)

        if (mushroomChance > threshold) continue

        // Get ground height at mushroom position
        const groundHeight = this.getHeightAt(mushroomWorldX, mushroomWorldZ)

        const baseX = BigInt(mushroomWorldX)
        const baseY = BigInt(groundHeight + 1)
        const baseZ = BigInt(mushroomWorldZ)

        // Check if we can place the mushroom
        if (this.canPlaceMushroom(world, baseX, baseY, baseZ)) {
          this.placeMushroom(world, baseX, baseY, baseZ)
          mushroomsPlaced++

          // Yield every 5 mushrooms to prevent frame blocking
          if (mushroomsPlaced % 5 === 0) {
            await this.yieldToEventLoop()
          }
        }
      }
    }

    // Final yield after mushroom generation
    await this.yieldToEventLoop()
  }

  /**
   * Check if a mushroom can be placed at the given location.
   * Basic check for suitable ground.
   */
  private canPlaceMushroom(
    world: WorldManager,
    x: bigint,
    y: bigint,
    z: bigint
  ): boolean {
    // Check that the block below is muddy grass, mud, or clay (typical swamp ground)
    const blockBelow = world.getBlockId(x, y - 1n, z)
    if (blockBelow !== BlockIds.MUDDY_GRASS && blockBelow !== BlockIds.MUD && blockBelow !== BlockIds.CLAY) return false

    // Check that base position is air
    const blockAt = world.getBlockId(x, y, z)
    if (blockAt !== BlockIds.AIR) return false

    return true
  }

  /**
   * Check if there's enough clearance for a mushroom of given height.
   */
  private hasMushroomClearance(
    world: WorldManager,
    x: bigint,
    y: bigint,
    z: bigint,
    height: number,
    capRadius: number
  ): boolean {
    // Check vertical clearance for stem
    for (let h = 0; h < height; h++) {
      const blockAt = world.getBlockId(x, y + BigInt(h), z)
      if (blockAt !== BlockIds.AIR) return false
    }

    // Check clearance for cap
    const capY = y + BigInt(height)
    for (let dx = -capRadius; dx <= capRadius; dx++) {
      for (let dz = -capRadius; dz <= capRadius; dz++) {
        const dist = Math.abs(dx) + Math.abs(dz)
        if (dist > capRadius + 1) continue
        const blockAt = world.getBlockId(x + BigInt(dx), capY, z + BigInt(dz))
        if (blockAt !== BlockIds.AIR) return false
      }
    }

    return true
  }

  /**
   * Place a giant mushroom at the given location.
   * Creates a tall stem with a wide cap on top.
   * Randomly selects between regular, blue, and purple mushroom types.
   */
  private placeMushroom(
    world: WorldManager,
    x: bigint,
    y: bigint,
    z: bigint
  ): void {
    // Determine mushroom type based on position (regular, blue, or purple)
    const typeRandom = this.positionRandom(Number(x), Number(z), 200)
    let stemBlock: number
    let capBlock: number
    if (typeRandom < 0.5) {
      // 50% regular mushrooms
      stemBlock = BlockIds.MUSHROOM
      capBlock = BlockIds.MUSHROOM_CAP
    } else if (typeRandom < 0.75) {
      // 25% blue mushrooms
      stemBlock = BlockIds.BLUE_MUSHROOM
      capBlock = BlockIds.BLUE_MUSHROOM_CAP
    } else {
      // 25% purple mushrooms
      stemBlock = BlockIds.PURPLE_MUSHROOM
      capBlock = BlockIds.PURPLE_MUSHROOM_CAP
    }

    // Determine height based on position (4-12 blocks)
    const heightRandom = this.positionRandom(Number(x), Number(z), 100)
    let height = Math.floor(4 + heightRandom * 8)
    let capRadius = this.getCapRadius(height)

    // Try to find a height that fits, reducing if needed
    while (height >= 4 && !this.hasMushroomClearance(world, x, y, z, height, capRadius)) {
      height -= 2
      capRadius = this.getCapRadius(height)
    }

    // If no room even for minimum height, place single block
    if (height < 4) {
      world.setBlock(x, y, z, stemBlock)
      return
    }

    // Build stem (mushroom blocks)
    for (let h = 0; h < height; h++) {
      world.setBlock(x, y + BigInt(h), z, stemBlock)
    }

    // Build cap (mushroom cap blocks)
    const capY = y + BigInt(height)

    // Create circular cap with overhang
    for (let dx = -capRadius; dx <= capRadius; dx++) {
      for (let dz = -capRadius; dz <= capRadius; dz++) {
        // Skip corners for rounder appearance
        const dist = Math.abs(dx) + Math.abs(dz)
        if (dist > capRadius + 1) continue

        // Top layer of cap
        world.setBlock(
          x + BigInt(dx),
          capY,
          z + BigInt(dz),
          capBlock
        )

        // Add hanging edges for taller mushrooms
        if (height >= 6 && dist === capRadius + 1) {
          world.setBlock(
            x + BigInt(dx),
            capY - 1n,
            z + BigInt(dz),
            capBlock
          )
        }
      }
    }

    // Add a second layer on top for extra bulk on tall mushrooms
    if (height >= 8) {
      const innerRadius = Math.max(1, capRadius - 1)
      for (let dx = -innerRadius; dx <= innerRadius; dx++) {
        for (let dz = -innerRadius; dz <= innerRadius; dz++) {
          const dist = Math.abs(dx) + Math.abs(dz)
          if (dist <= innerRadius) {
            world.setBlock(
              x + BigInt(dx),
              capY + 1n,
              z + BigInt(dz),
              capBlock
            )
          }
        }
      }
    }
  }

  /**
   * Get cap radius based on mushroom height.
   */
  private getCapRadius(height: number): number {
    if (height <= 5) return 2
    if (height <= 8) return 3
    return 4
  }
}
