import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { LavaFeature } from '../features/LavaFeature.ts'
import type { Chunk } from '../../chunks/Chunk.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'

/**
 * Volcanic biome with basalt surface, magma subsurface, and lava pools.
 * A harsh, fiery landscape with dramatic terrain and glowing magma.
 */
export class VolcanicGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'volcanic',
    frequency: 0.3, // Less common than other biomes
    treeDensity: 0.0, // No vegetation in volcanic biomes
    features: [
      // Basalt cliffs/formations
      new CliffFeature({
        frequency: 0.025,
        threshold: 0.65,
        maxHeight: 5,
        block: BlockIds.BASALT,
      }),
      // Common ores - coal spawns near surface
      new OreFeature({
        blockId: BlockIds.COAL_BLOCK,
        frequency: 25,
        veinSize: 14,
        minY: 156,
        maxY: 256,
        peakY: 210,
        ySpread: 18,
        replaceableBlocks: [BlockIds.STONE, BlockIds.BASALT, BlockIds.MAGMA],
      }),
      // Iron spawns mid-level
      new OreFeature({
        blockId: BlockIds.IRON_BLOCK,
        frequency: 15,
        veinSize: 10,
        minY: 156,
        maxY: 220,
        peakY: 185,
        ySpread: 16,
        replaceableBlocks: [BlockIds.STONE, BlockIds.BASALT, BlockIds.MAGMA],
      }),
      // Copper spawns similar to iron
      new OreFeature({
        blockId: BlockIds.COPPER_BLOCK,
        frequency: 12,
        veinSize: 12,
        minY: 156,
        maxY: 230,
        peakY: 195,
        ySpread: 18,
        replaceableBlocks: [BlockIds.STONE, BlockIds.BASALT, BlockIds.MAGMA],
      }),
      // Gold spawns deeper
      new OreFeature({
        blockId: BlockIds.GOLD_BLOCK,
        frequency: 6,
        veinSize: 7,
        minY: 156,
        maxY: 190,
        peakY: 170,
        ySpread: 10,
        replaceableBlocks: [BlockIds.STONE, BlockIds.MAGMA],
      }),
      // Diamond spawns very deep
      new OreFeature({
        blockId: BlockIds.DIAMOND_BLOCK,
        frequency: 3,
        veinSize: 5,
        minY: 156,
        maxY: 175,
        peakY: 162,
        ySpread: 5,
        replaceableBlocks: [BlockIds.STONE],
      }),
      // Lava pools - the signature feature of volcanic biomes
      new LavaFeature({
        frequency: 0.4,
        minDepth: 3,
        lavaLevel: 238,
      }),
    ],
    caves: {
      enabled: true,
      frequency: 0.005, // Slightly more frequent caves
      threshold: 0.007,
      minY: 164,
      maxY: 230,
      layerCount: 2,
      layerSpacing: 20,
      layerPeakY: 192,
      cheeseEnabled: true,
      cheeseFrequency: 0.004,
      cheeseThreshold: 0.82,
      entrancesEnabled: true,
      entranceMinWidth: 6,
      entranceThreshold: 0.55,
    },
    // No water in volcanic biomes - too hot!
    water: {
      enabled: false,
      liquidBlock: BlockIds.LAVA,
      waterLevel: 238,
      frequency: 0,
      minDepth: 10,
    },
    terrainConfig: {
      layers: [
        // Base terrain with moderate hills
        {
          type: 'fractal',
          octaves: 4,
          persistence: 0.45,
          scale: 0.006,
          weight: 1.0,
        },
        // Add some roughness for volcanic terrain
        {
          type: 'fractal',
          octaves: 2,
          persistence: 0.5,
          scale: 0.025,
          weight: 0.4,
        },
      ],
      baseHeight: 0,
      heightScale: 18, // More dramatic terrain than plains
      combineMode: 'add',
    } as TerrainConfig,
  }

  /**
   * Fill terrain with basalt surface, magma subsurface, and stone base.
   * Creates magma-filled craters at mountain peaks.
   * Sprinkles magma blocks on the surface in valleys.
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
    const valleyThreshold = this.config.seaLevel - 2 // Heights below this are valleys
    const peakThreshold = this.config.seaLevel + 8 // Heights above this are peaks

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const height = getHeightAt(worldX, worldZ)

        // Check if this column is in a valley and should have surface magma
        const isValley = height < valleyThreshold
        let hasSurfaceMagma = false
        if (isValley) {
          const magmaNoise = noise.noise2D(worldX * 0.08 + 1000, worldZ * 0.08 + 1000)
          hasSurfaceMagma = magmaNoise > 0.5
        }

        // Check if this column is a peak and calculate crater depth
        const isPeak = height > peakThreshold
        let craterDepth = 0
        if (isPeak) {
          // Use noise to define crater regions - lower frequency for larger craters
          const craterNoise = noise.noise2D(worldX * 0.04 + 2000, worldZ * 0.04 + 2000)
          if (craterNoise > 0.3) {
            // Crater depth varies based on noise (1-4 blocks deep)
            craterDepth = Math.floor(1 + (craterNoise - 0.3) * 6)
            craterDepth = Math.min(craterDepth, 4)
          }
        }

        // Adjusted surface height for craters
        const effectiveSurfaceY = height - craterDepth

        // Layer boundaries (world Y) - based on effective surface
        const basaltStartY = effectiveSurfaceY
        const basaltEndY = effectiveSurfaceY - 3
        const magmaStartY = basaltEndY - 1
        const magmaEndY = effectiveSurfaceY - 10
        const stoneStartY = magmaEndY - 1
        const stoneEndY = terrainFloor

        // Fill crater with magma (from effective surface up to original height)
        if (craterDepth > 0) {
          for (let worldY = Math.min(height, maxY); worldY > Math.max(effectiveSurfaceY, minY - 1); worldY--) {
            if (worldY >= minY) {
              const localY = worldY - minY
              chunk.setBlockId(localX, localY, localZ, BlockIds.MAGMA)
            }
          }
        }

        // Surface and near-surface: basalt (or magma in valleys)
        for (let worldY = Math.min(basaltStartY, maxY); worldY >= Math.max(basaltEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            const isSurfaceBlock = worldY === Math.floor(basaltStartY)

            if (hasSurfaceMagma && isSurfaceBlock) {
              chunk.setBlockId(localX, localY, localZ, BlockIds.MAGMA)
            } else {
              chunk.setBlockId(localX, localY, localZ, BlockIds.BASALT)
            }
          }
        }

        // Mid layer: magma (glowing subsurface)
        for (let worldY = Math.min(magmaStartY, maxY); worldY >= Math.max(magmaEndY, minY); worldY--) {
          if (worldY >= terrainFloor) {
            const localY = worldY - minY
            chunk.setBlockId(localX, localY, localZ, BlockIds.MAGMA)
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

  // No decorations in volcanic biomes - it's a barren, hostile environment
  protected override async generateDecorations(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    // No vegetation in volcanic biomes
  }

  override async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    // No vegetation in volcanic biomes
  }
}
