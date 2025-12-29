import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OakTree, type TreeParams } from '../structures/OakTree.ts'
import type { Chunk } from '../../chunks/Chunk.ts'
import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
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
    cliffFrequency: 0.03,
    cliffThreshold: 0.6,
    cliffMaxHeight: 2,
  }

  // Tree placement grid size
  private readonly TREE_GRID_SIZE = 8

  protected override async generateDecorations(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    await this.generateTrees(chunk, world)
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
}
