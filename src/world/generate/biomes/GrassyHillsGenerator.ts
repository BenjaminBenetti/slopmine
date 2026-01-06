import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OakTree, type TreeParams } from '../structures/OakTree.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import type { Chunk } from '../../chunks/Chunk.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'

/**
 * Grassy hills biome with dramatic rolling hills and sparse oak trees.
 */
export class GrassyHillsGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'grassy-hills',
    surfaceBlock: BlockIds.GRASS,
    subsurfaceBlock: BlockIds.DIRT,
    subsurfaceDepth: 4,
    baseBlock: BlockIds.STONE,
    heightAmplitude: 13,
    heightOffset: 10,
    treeDensity: 1.5,
    features: [
      new CliffFeature({
        frequency: 0.03,
        threshold: 0.3,
        maxHeight: 4,
        block: BlockIds.STONE,
      }),
      // Common ores - coal spawns high and frequently
      new OreFeature({
        blockId: BlockIds.COAL_BLOCK,
        frequency: 40,
        veinSize: 12,
        minY: 0,
        maxY: 128,
        peakY: 70,
        ySpread: 32,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Iron spawns mid-level
      new OreFeature({
        blockId: BlockIds.IRON_BLOCK,
        frequency: 12,
        veinSize: 8,
        minY: 0,
        maxY: 64,
        peakY: 32,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Copper spawns similar to iron but slightly higher
      new OreFeature({
        blockId: BlockIds.COPPER_BLOCK,
        frequency: 10,
        veinSize: 10,
        minY: 0,
        maxY: 80,
        peakY: 48,
        ySpread: 20,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Gold spawns deep and rarely
      new OreFeature({
        blockId: BlockIds.GOLD_BLOCK,
        frequency: 4,
        veinSize: 6,
        minY: 0,
        maxY: 32,
        peakY: 12,
        ySpread: 8,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Diamond spawns very deep and very rarely
      new OreFeature({
        blockId: BlockIds.DIAMOND_BLOCK,
        frequency: 2,
        veinSize: 4,
        minY: 0,
        maxY: 16,
        peakY: 8,
        ySpread: 4,
        replaceableBlocks: [BlockIds.STONE],
      }),
    ],
    caves: {
      enabled: true,
      frequency: 0.005,
      threshold: 0.006,       // very low - only carve the center of noise tubes for thin tunnels
      minY: 8,
      maxY: 68,               // high enough for entrances to find caves
      layerCount: 1,
      layerSpacing: 16,
      layerPeakY: 32,
      cheeseEnabled: true,
      cheeseFrequency: 0.003, // lower frequency for larger scattered chambers
      cheeseThreshold: 0.82,  // higher threshold for smaller, rarer chambers
      entrancesEnabled: true,
      entranceMinWidth: 10,
      entranceThreshold: 0.4,  // lower = more common entrances
    },
  }

  private readonly TREE_GRID_SIZE = 8

  protected override async generateDecorations(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    await this.generateTrees(chunk, world)
  }

  override async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    await this.generateTreesForSubChunk(subChunk, world)
  }

  /**
   * Generate scattered oak trees for a specific sub-chunk.
   * Only generates trees rooted in this sub-chunk's Y range.
   */
  private async generateTreesForSubChunk(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    const coord = subChunk.coordinate
    const treeDensity = this.properties.treeDensity
    const gridSize = this.TREE_GRID_SIZE

    // Sub-chunk Y bounds
    const minSubY = Number(coord.subY) * SUB_CHUNK_HEIGHT
    const maxSubY = minSubY + SUB_CHUNK_HEIGHT - 1

    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const jitterX = Math.floor(
          this.positionRandom(worldX, worldZ, 1) * gridSize
        )
        const jitterZ = Math.floor(
          this.positionRandom(worldX, worldZ, 2) * gridSize
        )

        const treeWorldX = worldX + jitterX
        const treeWorldZ = worldZ + jitterZ

        const treeChance = this.positionRandom(treeWorldX, treeWorldZ, 0)
        const threshold = treeDensity / (gridSize * gridSize)

        if (treeChance > threshold) continue

        const groundHeight = this.getHeightAt(treeWorldX, treeWorldZ)
        const treeBaseY = groundHeight + 1

        // Only place tree if its base is within this sub-chunk
        if (treeBaseY < minSubY || treeBaseY > maxSubY) continue

        const trunkHeight =
          4 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 3) * 3)
        const leafRadius =
          2 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 4) * 1.5)

        const params: TreeParams = { trunkHeight, leafRadius }

        const baseX = BigInt(treeWorldX)
        const baseY = BigInt(treeBaseY)
        const baseZ = BigInt(treeWorldZ)

        if (OakTree.canPlace(world, baseX, baseY, baseZ, params)) {
          OakTree.place(world, baseX, baseY, baseZ, params)
        }
      }
    }

    await this.yieldToEventLoop()
  }

  /**
   * Generate scattered oak trees.
   * Uses deterministic random based on world position with jittered grid.
   */
  private async generateTrees(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    const coord = chunk.coordinate
    const treeDensity = this.properties.treeDensity
    const gridSize = this.TREE_GRID_SIZE

    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const jitterX = Math.floor(
          this.positionRandom(worldX, worldZ, 1) * gridSize
        )
        const jitterZ = Math.floor(
          this.positionRandom(worldX, worldZ, 2) * gridSize
        )

        const treeWorldX = worldX + jitterX
        const treeWorldZ = worldZ + jitterZ

        const treeChance = this.positionRandom(treeWorldX, treeWorldZ, 0)
        const threshold = treeDensity / (gridSize * gridSize)

        if (treeChance > threshold) continue

        const groundHeight = this.getHeightAt(treeWorldX, treeWorldZ)

        const trunkHeight =
          4 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 3) * 3)
        const leafRadius =
          2 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 4) * 1.5)

        const params: TreeParams = { trunkHeight, leafRadius }

        const baseX = BigInt(treeWorldX)
        const baseY = BigInt(groundHeight + 1)
        const baseZ = BigInt(treeWorldZ)

        if (OakTree.canPlace(world, baseX, baseY, baseZ, params)) {
          OakTree.place(world, baseX, baseY, baseZ, params)
        }
      }
    }

    await this.yieldToEventLoop()
  }
}
