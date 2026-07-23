import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import { CliffFeature } from '../features/CliffFeature.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { LavaFeature } from '../features/LavaFeature.ts'
import { GeyserFeature } from '../features/GeyserFeature.ts'
import { VolcanoConeFeature } from '../features/VolcanoConeFeature.ts'
import { BasaltColumnsFeature } from '../features/BasaltColumnsFeature.ts'
import { CharredMiningCampFeature } from '../features/CharredMiningCampFeature.ts'
import type { Chunk } from '../../chunks/Chunk.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { MagmaSlimeEntity } from '../../../entities/animals/magma_slime/index.ts'
import { KomodoDragonEntity } from '../../../entities/animals/komodo_dragon/index.ts'

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
      // Geyser vents scattered on flat basalt spots. Expected vents/chunk =
      // 1024 * density / gridSize^4 = 1024 * 6 / 4096 = 1.5 pre-rejection;
      // the ±1-flatness / Y≥240 / bare-basalt / uncarved gates thin that to
      // roughly 0.3-0.5 per chunk (in-browser census measured the rates).
      new GeyserFeature({
        gridSize: 8,
        density: 6,
        surfaceBlockId: BlockIds.BASALT,
        minSurfaceY: 240, // stay above the lava pool level (238)
      }),
      // Basalt column clusters (Giant's Causeway style), sprinkled in.
      // Expected clusters/chunk = 1024 * density / gridSize^4
      // = 1024 * 150 / 16^4 ≈ 2.34 pre-rejection; the surface band [240, 247]
      // + relief<=2 flatness gate pass only ~7.6% of sites (measured on real
      // terrain) → ~0.18/chunk ≈ 1 per 5-6 chunks - Ben's "don't overdo it"
      // target.
      new BasaltColumnsFeature({
        gridSize: 16,
        density: 150,
        minSurfaceY: 240, // above lava lakes (238)
        maxSurfaceY: 247, // below crater peaks (magma-topped above seaLevel+8)
      }),
      // Charred mining camp: very rare burnt outpost with a forge, campfire,
      // charred-log ruins, and a mineable coal/iron/gold supply cache.
      // Expected camps/chunk = 1024 * density / gridSize^4
      // = 1024 * 320 / 64^4 ≈ 0.0195 (1 per ~51 chunks) pre-rejection; the
      // band [238, 250] + relief<=4 gates pass ~26% of sites (measured on
      // real terrain - the original band 240-247 + relief<=2 passed 3%,
      // i.e. 1 camp per ~2000 chunks, effectively never) → ~1 per 200 chunks.
      new CharredMiningCampFeature({
        gridSize: 64,
        density: 320,
        minSurfaceY: 238, // lava-lake level - support fill handles the rest
        maxSurfaceY: 250, // below crater peaks (magma-topped above seaLevel+8)
      }),
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
      // Sulfur veins hug the surface (~222-276) - volcanic gases deposit
      // sulfur high up. Deliberately shallow (Y 215-265, peak 240) so the
      // deep band stays reserved for iron/gold/diamond/obsidian rewards.
      new OreFeature({
        blockId: BlockIds.SULFUR_ORE,
        frequency: 14,
        veinSize: 8,
        minY: 215,
        maxY: 265,
        peakY: 240,
        ySpread: 15,
        replaceableBlocks: [BlockIds.STONE, BlockIds.BASALT, BlockIds.MAGMA],
      }),
      // Lava pools - the signature feature of volcanic biomes
      new LavaFeature({
        frequency: 0.4,
        minDepth: 3,
        lavaLevel: 238,
      }),
      // Volcano cones - rare landmark stratovolcanoes with lava calderas.
      // Runs LAST so the solid cone interior overwrites ores/lava/caves in
      // its footprint. Expected placements per chunk =
      // 1024·density/gridSize⁴ = 1024·800/96⁴ ≈ 0.0096 → ~1 cone per
      // 104 chunks (per-cell chance = 800/96² ≈ 8.7%, 1024/96² ≈ 0.11
      // cells per chunk).
      new VolcanoConeFeature({
        gridSize: 96,
        density: 800,
        minHeight: 42,
        maxHeight: 60,
        minBaseHeight: 242, // above lava lakes (Y=238) and their shores
      }),
    ],
    caves: {
      enabled: true,
      minY: 146,
      maxY: 320,
      floorFadeDepth: 10,
      // Steep volcanic slopes need a deep falloff to avoid flank exposure
      surfaceFalloffDepth: 20,
      // Modest magma chambers
      cheese: { enabled: true, threshold: 0.46, scale: 0.013, verticalScale: 1.2 },
      // Long straight horizontal lava tubes (low variance = uniform bore)
      spaghetti: { enabled: true, thickness: 0.075, thicknessVariance: 0.3, scale: 0.009, verticalSquash: 1.9 },
      // Deep volcanic fissures are common
      ravine: { enabled: true, scale: 0.004, width: 0.04, depth: 70, taper: 0.6, density: 0.4 },
      entrance: { enabled: true, scale: 0.01, threshold: 0.82, boost: 0.6, depth: 55 },
      floodLevel: 170,            // high lava table - the deep is dangerous
      floodBlockId: BlockIds.LAVA,
      liquidSurfaceGuardY: 240,   // lava lakes at 238 + 2: guards entrance mouths, pipes, and (partially) ravines under lava lakes and shores
      // Lava-tube mineral lining: cave walls sprinkle sulfur/obsidian, and
      // rock touching lava (flood lava, lake beds) crusts into obsidian rings.
      // Sulfur is the shallow reward (Y >= 210 only, near-surface cave runs);
      // obsidian is the deep reward, so it stays unrestricted.
      lining: {
        replaceableBlocks: [BlockIds.STONE, BlockIds.BASALT, BlockIds.MAGMA],
        wallBlocks: [
          { blockId: BlockIds.SULFUR_ORE, chance: 0.05, minY: 210 },
          { blockId: BlockIds.OBSIDIAN, chance: 0.02 },
        ],
        lavaContactBlock: { blockId: BlockIds.OBSIDIAN, chance: 0.2 },
      },
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
    // Volcanic biome has an ominous, fiery atmosphere
    skybox: {
      brightness: 0.55, // Dark, smoky sky
      tint: { r: 1.0, g: 0.7, b: 0.5 }, // Reddish-orange tint from volcanic ash/glow
    },
    // Creatures that thrive in the volcanic environment
    entitySpawns: [
      {
        entityType: 'magma_slime',
        spawnRate: 0.15,
        minY: 200,
        maxY: 280,
        maxNearby: 8,
        createEntity: (pos: THREE.Vector3) => new MagmaSlimeEntity({ position: pos }),
      },
      {
        entityType: 'komodo_dragon',
        spawnRate: 0.1,
        minY: 200,
        maxY: 280,
        maxNearby: 6,
        createEntity: (pos: THREE.Vector3) => new KomodoDragonEntity({ position: pos }),
      },
    ],
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
