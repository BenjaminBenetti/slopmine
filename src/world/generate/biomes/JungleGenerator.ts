import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { WheatFeature } from '../features/WheatFeature.ts'
import { HerbFeature } from '../features/HerbFeature.ts'
import { RiverbankMudFeature } from '../features/RiverbankMudFeature.ts'
import { RiverbankClayFeature } from '../features/RiverbankClayFeature.ts'
import { JungleTreeFeature } from '../features/JungleTreeFeature.ts'
import { MegaTreeFeature } from '../features/MegaTreeFeature.ts'
import { JungleFernFeature } from '../features/JungleFernFeature.ts'
import { HempFeature } from '../features/HempFeature.ts'
import { PigEntity } from '../../../entities/animals/pig/index.ts'
import { FoxEntity } from '../../../entities/animals/fox/index.ts'
import { CaveSlimeEntity } from '../../../entities/animals/cave_slime/index.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
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
      // Wheat patches - rare surface crop clusters
      new WheatFeature({
        density: 3.0,       // Much rarer than trees (trees are 3.0)
        minPatchSize: 3,
        maxPatchSize: 5,
        gridSize: 16,       // Larger grid = more spread out
        soilBlock: BlockIds.DIRT,  // Replace grass with dirt under wheat
      }),
      // Herb patches - more abundant in jungle environment
      new HerbFeature({
        density: 4.0,
        minPatchSize: 3,
        maxPatchSize: 6,
        gridSize: 12,
      }),
      // Hemp patches - similar to wheat
      new HempFeature({
        density: 3.0,
        minPatchSize: 3,
        maxPatchSize: 5,
        gridSize: 16,
        soilBlock: BlockIds.DIRT,
      }),
      // Mud patches along river banks
      new RiverbankMudFeature({
        waterLevel: 238,
        maxHeightAboveWater: 1,
        maxDepthBelowSurface: 4,
        zoneFrequency: 0.03,
        patchFrequency: 0.12,
        threshold: 0.35,
      }),
      // Clay patches along river banks (rarer than mud)
      new RiverbankClayFeature({
        waterLevel: 238,
        maxHeightAboveWater: 1,
        maxDepthBelowSurface: 3,
        zoneFrequency: 0.025,
        patchFrequency: 0.1,
        threshold: 0.45,
      }),
      // Dense jungle ferns in clumps covering the ground
      new JungleFernFeature({
        density: 20.0,      // Patch frequency (5x more frequent)
        gridSize: 8,        // Space between patch centers
        minPatchSize: 8,    // Min ferns per clump
        maxPatchSize: 16,   // Max ferns per clump
        patchRadius: 3,     // Radius of each clump in blocks
      }),
      // Mega trees - massive trees with thick trunks, walkable branches, and sprawling roots
      new MegaTreeFeature({
        gridSize: 32,           // More common placement
        density: 0.5,
        minTrunkHeight: 40,
        maxTrunkHeight: 80,
        baseTrunkRadius: 2,
        minBranches: 4,
        maxBranches: 8,
        minBranchLength: 8,
        maxBranchLength: 20,
        minRootDepth: 8,
        maxRootDepth: 15,
        minRootSprawl: 6,
        maxRootSprawl: 12,
        minRoots: 4,
        maxRoots: 6,
        leafClusterRadius: 5,
        vineChance: 0.4,
        maxVineLength: 15,
      }),
      // Dense jungle trees with vines (runs in worker thread)
      // Tree sizes vary from small bushes to massive emergents
      new JungleTreeFeature({
        gridSize: 5,          // Slightly denser grid
        density: 8.0,
        vineChanceOnLeaves: 0.6,
        vineChanceOnTrunk: 0.3,
        minVineLength: 2,
        maxVineLength: 10,    // Longer vines for big trees
      }),
    ],
    caves: {
      enabled: true,
      minY: 164,
      maxY: 224,
      // Tunnel network settings - moderate jungle caves
      tunnelDensity: 3,         // reduced from 5
      tunnelMinRadius: 2,
      tunnelMaxRadius: 3,       // narrower tunnels
      tunnelMaxLength: 180,     // shorter systems
      tunnelBranchChance: 0.12, // less branching
      tunnelTurnRate: 0.35,
      tunnelVerticalBias: 0,
      // Noise-based surface entrance settings - moderate (hidden by canopy)
      noiseEntranceEnabled: true,
      noiseEntranceDensity: 0.30,     // reduced from 0.45
      noiseEntranceMinRadius: 2,
      noiseEntranceMaxRadius: 4,
      noiseEntranceMinDepth: 25,
      noiseEntranceMaxDepth: 50,
      noiseEntranceStyle: 'mixed',
      // Chamber settings - occasional jungle chambers
      chamberEnabled: true,
      chamberDensity: 0.20,           // reduced from 0.40
      chamberMinRadius: 10,
      chamberMaxRadius: 20,
      chamberMinY: 168,
      chamberMaxY: 200,
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
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new PigEntity({ position: pos }),
      },
      {
        entityType: 'fox',
        spawnRate: 0.03, // Rare in jungle (~1 fox per 33 chunks)
        maxNearby: 4,
        minLightLevel: 8, // Only spawn in well-lit areas (not caves)
        createEntity: (pos: THREE.Vector3) => new FoxEntity({ position: pos }),
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
}
