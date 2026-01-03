import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OakTree, type TreeParams } from '../structures/OakTree.ts'
import { FlowerPatch, type FlowerPatchParams } from '../structures/FlowerPatch.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import type { Chunk } from '../../chunks/Chunk.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'

/**
 * Grassy plains biome with gentle rolling hills and scattered oak trees.
 */
export class PlainsGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'plains',
    surfaceBlock: BlockIds.GRASS,
    subsurfaceBlock: BlockIds.DIRT,
    subsurfaceDepth: 4,
    baseBlock: BlockIds.STONE,
    heightAmplitude: 8,
    heightOffset: 0,
    treeDensity: 3.0,
    features: [
      new CliffFeature({
        frequency: 0.03,
        threshold: 0.6,
        maxHeight: 2,
        block: BlockIds.STONE,
      }),
    ],
    caves: {
      enabled: true,
      frequency: 0.025,      // higher = smaller/narrower tunnels
      threshold: 0.035,      // higher = narrower (less blocks carved)
      minY: 8,
      maxY: 48,
      layerCount: 2,
      layerSpacing: 18,
      layerPeakY: 28,
      cheeseEnabled: true,
      cheeseFrequency: 0.008,
      cheeseThreshold: 0.65,
      entrancesEnabled: true,
      entranceMinWidth: 4,
    },
  }

  // Tree placement grid size
  private readonly TREE_GRID_SIZE = 8
  // Flower placement grid size (smaller for more frequent patches)
  private readonly FLOWER_GRID_SIZE = 12

  /**
   * Choose a random flower color based on a random value.
   */
  private chooseFlowerColor(random: number): BlockIds.RED_FLOWER | BlockIds.YELLOW_FLOWER | BlockIds.BLUE_FLOWER | BlockIds.PINK_FLOWER {
    if (random < 0.25) {
      return BlockIds.RED_FLOWER
    } else if (random < 0.5) {
      return BlockIds.YELLOW_FLOWER
    } else if (random < 0.75) {
      return BlockIds.BLUE_FLOWER
    } else {
      return BlockIds.PINK_FLOWER
    }
  }

  /**
   * Try to place a single flower patch at the specified world position.
   * Returns true if patch was placed, false otherwise.
   */
  private tryPlaceFlowerPatch(
    world: WorldManager,
    patchWorldX: number,
    patchWorldZ: number,
    patchBaseY: number
  ): void {
    // Random flower patch parameters (using position-based random with different salts)
    const flowerCount = 3 + Math.floor(this.positionRandom(patchWorldX, patchWorldZ, 8) * 5) // 3-7 flowers

    // Choose flower color based on position
    const colorChoice = this.positionRandom(patchWorldX, patchWorldZ, 9)
    const flowerType = this.chooseFlowerColor(colorChoice)

    const params: FlowerPatchParams = { flowerCount, flowerType }

    const centerX = BigInt(patchWorldX)
    const centerY = BigInt(patchBaseY)
    const centerZ = BigInt(patchWorldZ)

    // Create a position-based random function for flower placement
    // Use a counter to get different random values within the same patch
    let counter = 0
    const patchRandom = () => {
      return this.positionRandom(patchWorldX, patchWorldZ, 10 + counter++)
    }

    // Place flower patch if location is valid
    if (FlowerPatch.canPlace(world, centerX, centerY, centerZ)) {
      FlowerPatch.place(world, centerX, centerY, centerZ, params, patchRandom)
    }
  }

  protected override async generateDecorations(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    await this.generateTrees(chunk, world)
    await this.generateFlowerPatches(chunk, world)
  }

  override async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    await this.generateTreesForSubChunk(subChunk, world)
    await this.generateFlowerPatchesForSubChunk(subChunk, world)
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

    // Check each cell in a grid pattern for potential tree positions
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

        const treeWorldX = worldX + jitterX
        const treeWorldZ = worldZ + jitterZ

        // Probability check for tree placement
        const treeChance = this.positionRandom(treeWorldX, treeWorldZ, 0)
        const threshold = treeDensity / (gridSize * gridSize)

        if (treeChance > threshold) continue

        // Get ground height at tree position
        const groundHeight = this.getHeightAt(treeWorldX, treeWorldZ)
        const treeBaseY = groundHeight + 1

        // Only place tree if its base is within this sub-chunk
        if (treeBaseY < minSubY || treeBaseY > maxSubY) continue

        // Random tree parameters
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

        // Place tree if location is valid
        if (OakTree.canPlace(world, baseX, baseY, baseZ, params)) {
          OakTree.place(world, baseX, baseY, baseZ, params)
        }
      }
    }

    // Yield to event loop after tree generation
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

    // Check each cell in a grid pattern for potential tree positions
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

        const treeWorldX = worldX + jitterX
        const treeWorldZ = worldZ + jitterZ

        // Probability check for tree placement
        const treeChance = this.positionRandom(treeWorldX, treeWorldZ, 0)
        const threshold = treeDensity / (gridSize * gridSize)

        if (treeChance > threshold) continue

        // Get ground height at tree position
        const groundHeight = this.getHeightAt(treeWorldX, treeWorldZ)

        // Random tree parameters
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

        // Place tree if location is valid
        if (OakTree.canPlace(world, baseX, baseY, baseZ, params)) {
          OakTree.place(world, baseX, baseY, baseZ, params)
        }
      }
    }

    // Yield to event loop after tree generation
    await this.yieldToEventLoop()
  }

  /**
   * Generate scattered flower patches for a specific sub-chunk.
   * Only generates patches rooted in this sub-chunk's Y range.
   */
  private async generateFlowerPatchesForSubChunk(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    const coord = subChunk.coordinate
    const gridSize = this.FLOWER_GRID_SIZE

    // Sub-chunk Y bounds
    const minSubY = Number(coord.subY) * SUB_CHUNK_HEIGHT
    const maxSubY = minSubY + SUB_CHUNK_HEIGHT - 1

    // Check each cell in a grid pattern for potential flower patch positions
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for more natural placement
        const jitterX = Math.floor(
          this.positionRandom(worldX, worldZ, 5) * gridSize
        )
        const jitterZ = Math.floor(
          this.positionRandom(worldX, worldZ, 6) * gridSize
        )

        const patchWorldX = worldX + jitterX
        const patchWorldZ = worldZ + jitterZ

        // Probability check for flower patch placement
        const patchChance = this.positionRandom(patchWorldX, patchWorldZ, 7)
        const threshold = 0.3 // 30% chance per grid cell

        if (patchChance > threshold) continue

        // Get ground height at patch position
        const groundHeight = this.getHeightAt(patchWorldX, patchWorldZ)
        const patchBaseY = groundHeight + 1

        // Only place patch if its base is within this sub-chunk
        if (patchBaseY < minSubY || patchBaseY > maxSubY) continue

        // Try to place flower patch
        this.tryPlaceFlowerPatch(world, patchWorldX, patchWorldZ, patchBaseY)
      }
    }

    // Yield to event loop after flower generation
    await this.yieldToEventLoop()
  }

  /**
   * Generate scattered flower patches.
   * Uses deterministic random based on world position with jittered grid.
   */
  private async generateFlowerPatches(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    const coord = chunk.coordinate
    const gridSize = this.FLOWER_GRID_SIZE

    // Check each cell in a grid pattern for potential flower patch positions
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for more natural placement
        const jitterX = Math.floor(
          this.positionRandom(worldX, worldZ, 5) * gridSize
        )
        const jitterZ = Math.floor(
          this.positionRandom(worldX, worldZ, 6) * gridSize
        )

        const patchWorldX = worldX + jitterX
        const patchWorldZ = worldZ + jitterZ

        // Probability check for flower patch placement
        const patchChance = this.positionRandom(patchWorldX, patchWorldZ, 7)
        const threshold = 0.3 // 30% chance per grid cell

        if (patchChance > threshold) continue

        // Get ground height at patch position
        const groundHeight = this.getHeightAt(patchWorldX, patchWorldZ)

        // Try to place flower patch
        this.tryPlaceFlowerPatch(world, patchWorldX, patchWorldZ, groundHeight + 1)
      }
    }

    // Yield to event loop after flower generation
    await this.yieldToEventLoop()
  }
}
