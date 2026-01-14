import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OakTree, type TreeParams } from '../structures/OakTree.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { PigEntity } from '../../../entities/animals/pig/index.ts'
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
 * Jungle biome with grass surface, dirt subsurface, tall trees, and hanging vines.
 */
export class JungleGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'jungle',
    frequency: 0.8,
    treeDensity: 8.0, // Dense tree coverage
    features: [
      new CliffFeature({
        frequency: 0.02,
        threshold: 0.65,
        maxHeight: 2,
        block: BlockIds.STONE,
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
        replaceableBlocks: [BlockIds.STONE],
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
        replaceableBlocks: [BlockIds.STONE],
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
        replaceableBlocks: [BlockIds.STONE],
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
      threshold: 0.007,
      minY: 164,
      maxY: 224,
      layerCount: 1,
      layerSpacing: 16,
      layerPeakY: 188,
      cheeseEnabled: true,
      cheeseFrequency: 0.003,
      cheeseThreshold: 0.84,
      entrancesEnabled: true,
      entranceMinWidth: 8,
      entranceThreshold: 0.45,
    },
    water: {
      enabled: true,
      liquidBlock: BlockIds.WATER,
      waterLevel: 238,
      frequency: 0.3, // More water in jungle
      minDepth: 2,
    },
    terrainConfig: {
      layers: [
        {
          type: 'fractal',
          octaves: 4,
          persistence: 0.5,
          scale: 0.008,
          weight: 1.0,
        },
        // Add variation for hilly jungle terrain
        {
          type: 'fractal',
          octaves: 2,
          persistence: 0.6,
          scale: 0.015,
          weight: 0.4,
        },
      ],
      baseHeight: 0,
      heightScale: 10, // Slightly more dramatic than plains
      combineMode: 'add',
    } as TerrainConfig,
    entitySpawns: [
      {
        entityType: 'pig',
        spawnRate: 0.2, // Less common in jungle
        maxNearby: 3,
        createEntity: (pos: THREE.Vector3) => new PigEntity({ position: pos }),
      },
    ],
  }

  // Tree placement grid size (smaller = denser trees)
  private readonly TREE_GRID_SIZE = 6

  /**
   * Fill terrain within the given Y range with grass, dirt, and stone layers.
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

        // Calculate layer boundaries (world Y)
        const surfaceY = height
        const dirtStartY = height - 1
        const dirtEndY = height - 4 // 4 blocks of dirt
        const stoneStartY = dirtEndY - 1
        const stoneEndY = terrainFloor

        // Surface: grass (only if within Y range)
        if (surfaceY >= minY && surfaceY <= maxY) {
          const localY = surfaceY - minY
          chunk.setBlockId(localX, localY, localZ, BlockIds.GRASS)
        }

        // Subsurface: dirt (only blocks within Y range)
        for (let worldY = Math.min(dirtStartY, maxY); worldY >= Math.max(dirtEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.DIRT)
          }
        }

        // Base: stone (only blocks within Y range)
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
    await this.generateTrees(chunk, world)
  }

  override async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    await this.generateTreesForSubChunk(subChunk, world)
  }

  /**
   * Generate scattered jungle trees with vines for a specific sub-chunk.
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

    let treesPlaced = 0

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

        // Jungle trees are taller
        const trunkHeight =
          6 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 3) * 4)
        const leafRadius =
          3 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 4) * 2)

        const params: TreeParams = { trunkHeight, leafRadius }

        const baseX = BigInt(treeWorldX)
        const baseY = BigInt(treeBaseY)
        const baseZ = BigInt(treeWorldZ)

        // Place tree if location is valid
        if (OakTree.canPlace(world, baseX, baseY, baseZ, params)) {
          OakTree.place(world, baseX, baseY, baseZ, params)

          // Add vines hanging from the tree
          this.placeVines(world, baseX, baseY, baseZ, params)

          treesPlaced++

          // Yield every 2 trees to prevent frame blocking
          if (treesPlaced % 2 === 0) {
            await this.yieldToEventLoop()
          }
        }
      }
    }

    // Final yield after tree generation
    await this.yieldToEventLoop()
  }

  /**
   * Generate scattered jungle trees with vines.
   */
  private async generateTrees(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    const coord = chunk.coordinate
    const treeDensity = this.properties.treeDensity
    const gridSize = this.TREE_GRID_SIZE

    let treesPlaced = 0

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

        // Jungle trees are taller
        const trunkHeight =
          6 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 3) * 4)
        const leafRadius =
          3 +
          Math.floor(this.positionRandom(treeWorldX, treeWorldZ, 4) * 2)

        const params: TreeParams = { trunkHeight, leafRadius }

        const baseX = BigInt(treeWorldX)
        const baseY = BigInt(groundHeight + 1)
        const baseZ = BigInt(treeWorldZ)

        // Place tree if location is valid
        if (OakTree.canPlace(world, baseX, baseY, baseZ, params)) {
          OakTree.place(world, baseX, baseY, baseZ, params)

          // Add vines hanging from the tree
          this.placeVines(world, baseX, baseY, baseZ, params)

          treesPlaced++

          // Yield every 2 trees to prevent frame blocking
          if (treesPlaced % 2 === 0) {
            await this.yieldToEventLoop()
          }
        }
      }
    }

    // Final yield after tree generation
    await this.yieldToEventLoop()
  }

  /**
   * Place vines hanging from tree leaves and trunk.
   */
  private placeVines(
    world: WorldManager,
    baseX: bigint,
    baseY: bigint,
    baseZ: bigint,
    params: TreeParams
  ): void {
    const { trunkHeight, leafRadius } = params
    const leafCenterY = baseY + BigInt(trunkHeight - 1)

    // Place vines on the sides of leaves
    for (let dx = -leafRadius; dx <= leafRadius; dx++) {
      for (let dz = -leafRadius; dz <= leafRadius; dz++) {
        // Only place on the perimeter of the leaf canopy
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < leafRadius - 0.5 || dist > leafRadius + 0.5) continue

        const vineX = baseX + BigInt(dx)
        const vineZ = baseZ + BigInt(dz)

        // Check if there's a leaf block here
        const checkY = leafCenterY
        const blockAt = world.getBlockId(vineX, checkY, vineZ)
        if (blockAt !== BlockIds.OAK_LEAVES) continue

        // Random chance to place vine (60%)
        const vineChance = this.positionRandom(Number(vineX), Number(vineZ), 5)
        if (vineChance > 0.6) continue

        // Place vines hanging down from the leaf
        const vineLength = 2 + Math.floor(this.positionRandom(Number(vineX), Number(vineZ), 6) * 4)

        for (let dy = 1; dy <= vineLength; dy++) {
          const vineY = checkY - BigInt(dy)
          const blockBelow = world.getBlockId(vineX, vineY, vineZ)

          // Only place in air
          if (blockBelow === BlockIds.AIR) {
            world.setBlock(vineX, vineY, vineZ, BlockIds.VINE)
          } else {
            break // Stop if we hit something
          }
        }
      }
    }

    // Also place some vines on the trunk
    for (let dy = 2; dy < trunkHeight - 1; dy++) {
      const trunkY = baseY + BigInt(dy)

      // Check each side of the trunk for vine placement
      const sides: [bigint, bigint][] = [
        [baseX + 1n, baseZ],
        [baseX - 1n, baseZ],
        [baseX, baseZ + 1n],
        [baseX, baseZ - 1n],
      ]

      for (const [sideX, sideZ] of sides) {
        // 30% chance to place vine on trunk side
        const vineChance = this.positionRandom(Number(sideX) + dy, Number(sideZ), 7)
        if (vineChance > 0.3) continue

        // Only place in air
        if (world.getBlockId(sideX, trunkY, sideZ) === BlockIds.AIR) {
          world.setBlock(sideX, trunkY, sideZ, BlockIds.VINE)
        }
      }
    }
  }
}
