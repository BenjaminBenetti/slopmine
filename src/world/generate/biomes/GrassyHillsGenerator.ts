import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { OakTree, type TreeParams } from '../structures/OakTree.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { HerbFeature } from '../features/HerbFeature.ts'
import { FlowerPatchFeature } from '../features/FlowerPatchFeature.ts'
import { PigEntity } from '../../../entities/animals/pig/index.ts'
import { CowEntity } from '../../../entities/animals/cow/index.ts'
import { FoxEntity } from '../../../entities/animals/fox/index.ts'
import { RabbitEntity } from '../../../entities/animals/rabbit/index.ts'
import { CaveSlimeEntity } from '../../../entities/animals/cave_slime/index.ts'
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
 * Grassy hills biome with dramatic rolling hills and sparse oak trees.
 */
export class GrassyHillsGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'grassy-hills',
    frequency: 0.25,
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
        minY: 156,
        maxY: 280,
        peakY: 226,
        ySpread: 32,
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
      // Herb patches - slightly rarer than plains due to hilly terrain
      new HerbFeature({
        density: 1.5,
        minPatchSize: 2,
        maxPatchSize: 4,
        gridSize: 16,
      }),
      // Flower patches - slightly less dense than plains due to hilly terrain
      new FlowerPatchFeature({
        density: 1.5,
        minPatchSize: 2,
        maxPatchSize: 5,
        gridSize: 12,
        flowerBlockIds: [BlockIds.YELLOW_FLOWER, BlockIds.BLUE_FLOWER, BlockIds.RED_FLOWER],
      }),
    ],
    caves: {
      enabled: true,
      minY: 146,
      maxY: 320,
      floorFadeDepth: 10,
      // Deep falloff: hills have steep flanks, so caves must close well below
      // the local surface or they tear open on every hillside
      surfaceFalloffDepth: 20,
      // Larger caverns that hillsides frequently expose
      cheese: { enabled: true, threshold: 0.43, scale: 0.011, verticalScale: 1.4 },
      spaghetti: { enabled: true, thickness: 0.085, thicknessVariance: 0.6, scale: 0.012, verticalSquash: 1.5 },
      ravine: { enabled: true, scale: 0.0035, width: 0.035, depth: 60, taper: 0.7, density: 0.3 },
      // Frequent entrances - hills wear through into the caves below
      entrance: { enabled: true, scale: 0.011, threshold: 0.78, boost: 0.6, depth: 55 },
      floodLevel: 152,
      floodBlockId: BlockIds.LAVA,
      liquidSurfaceGuardY: 240,   // waterLevel 238 + 2: guards entrance mouths, pipes, and (partially) ravines under pools and shores
    },
    water: {
      enabled: true,
      liquidBlock: BlockIds.WATER,
      waterLevel: 238,        // Same water level as plains for consistency
      frequency: 0.3,         // Fewer water pools in hills
      minDepth: 3,            // Need deeper depressions in hilly terrain
      sandBlock: BlockIds.SAND,  // Sandy bottoms and shores around water
      sandDepth: 3,
      shoreRadius: 1,
    },
    terrainConfig: {
      layers: [
        {
          type: 'fractal',
          octaves: 4,
          persistence: 0.5,
          scale: 0.01,
          weight: 1.0,
        },
      ],
      baseHeight: 10,
      heightScale: 13,
      combineMode: 'add',
    } as TerrainConfig,
    entitySpawns: [
      {
        entityType: 'pig',
        spawnRate: 0.3, // ~1 pig per 3 chunks
        maxNearby: 4,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new PigEntity({ position: pos }),
      },
      {
        entityType: 'cow',
        spawnRate: 0.2, // ~1 cow per 5 chunks
        maxNearby: 6,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new CowEntity({ position: pos }),
      },
      {
        entityType: 'fox',
        spawnRate: 0.05, // Rarer than pigs (~1 fox per 20 chunks)
        maxNearby: 4,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new FoxEntity({ position: pos }),
      },
      {
        entityType: 'rabbit',
        spawnRate: 0.2, // Common in grassy hills
        maxNearby: 10,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new RabbitEntity({ position: pos }),
      },
      {
        entityType: 'cave_slime',
        spawnRate: 0.15, // Common in dark caves
        maxNearby: 8,
        maxLightLevel: 7, // Only spawn in dark areas
        createEntity: (pos: THREE.Vector3) => new CaveSlimeEntity({ position: pos }),
      },
    ],
  }

  private readonly TREE_GRID_SIZE = 8

  /**
   * Fill terrain within the given Y range with grass, dirt, and stone layers.
   * Only processes blocks within minY/maxY for efficient sub-chunk generation.
   *
   * @param chunk The chunk to fill (uses local Y coordinates for setBlockId)
   * @param minY Minimum world Y coordinate of this chunk/sub-chunk
   * @param maxY Maximum world Y coordinate of this chunk/sub-chunk
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
        const dirtEndY = height - 4  // 4 blocks of dirt
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

    let treesPlaced = 0

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

    let treesPlaced = 0

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
}
