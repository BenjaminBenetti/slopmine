import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { abyssFloorHeight, CHASM_FLOOR_Y, CRYSTAL_ABYSS_TERRAIN } from '../crystal/CrystalAbyssShape.ts'
import { CrystalSpireFeature } from '../features/crystal/CrystalSpireFeature.ts'
import { CrystalGeodeFeature } from '../features/crystal/CrystalGeodeFeature.ts'
import { AbyssIslandFeature } from '../features/crystal/AbyssIslandFeature.ts'
import { CrystalScatterFeature } from '../features/crystal/CrystalScatterFeature.ts'
import { ProceduralDungeonFeature } from '../dungeons/ProceduralDungeonFeature.ts'
import { PRISM_SANCTUM_CONFIG } from '../dungeons/kits/crystal/PrismSanctumConfig.ts'
import { CrystalCoreFeature } from '../features/crystal/CrystalCoreFeature.ts'
import { ShardlingEntity } from '../../../entities/enemies/shardling/index.ts'
import { PrismWispEntity } from '../../../entities/enemies/prism_wisp/index.ts'

/**
 * Crystal Abyss - a Hell-layer biome (layer 0, Y 0-127): a dark, cold,
 * glittering cathedral. Near-black abyssal stone falls in jagged terraces
 * and is split by deep chasms; towering violet-to-magenta crystal spires
 * climb toward the ceiling, pale geodes lie half-sunk in the floor (some
 * cracked open), floating rock islands drift overhead and shard clusters
 * glitter on the ground. The crystals are the light; the haze is deep violet.
 *
 * Unique resource: prism crystal (diamond pickaxe) -> prism shards (strength
 * potions, crystal lamps, the hellbane pickaxe). Dungeon: the Prism Sanctum.
 */
export class CrystalAbyssGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'crystal-abyss',
    frequency: 1.0,
    treeDensity: 0,
    layer: 0,
    skylightValue: 0,
    features: [
      // Giants: climbing to the ceiling region.
      // 1024 * 0.75 / 80^2 = 0.12 per chunk (~1 per 8 chunks)
      new CrystalSpireFeature({
        gridSize: 80,
        chance: 0.75,
        minHeight: 60,
        maxHeight: 100,
        minRadius: 4.5,
        maxRadius: 7,
        maxLean: 0.09,
        minSatellites: 3,
        maxSatellites: 5,
        maxTopY: 127,
        prismVeinChance: 0.03,
        salt: 1101,
      }),
      // Common spires: 1024 * 0.4 / 40^2 = 0.26 per chunk
      new CrystalSpireFeature({
        gridSize: 40,
        chance: 0.4,
        minHeight: 14,
        maxHeight: 42,
        minRadius: 1.6,
        maxRadius: 3.4,
        maxLean: 0.22,
        minSatellites: 1,
        maxSatellites: 3,
        maxTopY: 127,
        prismVeinChance: 0.035,
        salt: 1201,
      }),
      // Crystal clumps: knee-to-head-high shard clusters, the easiest prism
      // crystal to reach. 1024 * 0.3 / 18^2 = 0.95 per chunk
      new CrystalSpireFeature({
        gridSize: 18,
        chance: 0.3,
        minHeight: 6,
        maxHeight: 13,
        minRadius: 0.9,
        maxRadius: 1.7,
        maxLean: 0.25,
        minSatellites: 2,
        maxSatellites: 4,
        maxTopY: 127,
        prismVeinChance: 0.12,
        salt: 1251,
      }),
      // Geodes: 1024 * 0.4 / 48^2 = 0.18 per chunk
      new CrystalGeodeFeature({
        gridSize: 48,
        chance: 0.4,
        minRadius: 5,
        maxRadius: 9,
        buriedChance: 0.35,
        crackChance: 0.75,
        prismLiningChance: 0.3,
        salt: 1301,
      }),
      // Floating islands: 1024 * 0.4 / 112^2 = 0.033 per chunk
      new AbyssIslandFeature({
        gridSize: 112,
        chance: 0.4,
        minTopY: 92,
        maxTopY: 110,
        minRadius: 6,
        maxRadius: 12,
        salt: 1401,
      }),
      // The Prism Sanctum (procedural, one per region at most; see kits/crystal/)
      new ProceduralDungeonFeature(PRISM_SANCTUM_CONFIG),
      new CrystalScatterFeature({
        clusterChance: 0.022,
        outcropChance: 0,
        salt: 1501,
      }),
      // Last: buried crystal cells stop emitting light (shell-only emitters)
      new CrystalCoreFeature({ enabled: true }),
    ],
    // No caves - the layer itself is one vast cavern
    caves: undefined,
    terrainConfig: CRYSTAL_ABYSS_TERRAIN,
    // Deep violet haze; a cool violet light floor so stone far from any
    // crystal still reads as dark violet rock, not a black void. Crystals
    // (light 6-11, emissive) and lamps provide the real light.
    skybox: {
      undergroundFogColor: { r: 0.1, g: 0.055, b: 0.17 },
      fogDensity: 2.4,
      lightTint: { r: 0.9, g: 0.86, b: 1.0 },
      minimumLight: { r: 0.2, g: 0.13, b: 0.32 },
    },
    // Ground search runs from the player's Y (never searchFromSky down here)
    entitySpawns: [
      {
        entityType: 'shardling',
        spawnRate: 0.22,
        minY: 4,
        maxY: 124,
        maxNearby: 8,
        createEntity: (pos: THREE.Vector3) => new ShardlingEntity({ position: pos }),
      },
      {
        entityType: 'prism_wisp',
        spawnRate: 0.14,
        minY: 4,
        maxY: 124,
        maxNearby: 5,
        createEntity: (pos: THREE.Vector3) => new PrismWispEntity({ position: pos }),
      },
    ],
  }

  /**
   * Fill abyssal stone up to the shaped floor (terraces + chasms, from the
   * blended height passed in by the worker). The top block is glittering
   * stone in patches and on every chasm floor.
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    _maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const chunkWorldX = Number(chunk.coordinate.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(chunk.coordinate.z) * CHUNK_SIZE_Z
    const maxY = minY + SUB_CHUNK_HEIGHT - 1

    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
        const worldX = chunkWorldX + localX
        const worldZ = chunkWorldZ + localZ
        const floor = abyssFloorHeight(noise, worldX, worldZ, getHeightAt(worldX, worldZ))
        if (floor < minY) continue

        const glitterTop =
          floor <= CHASM_FLOOR_Y + 4 ||
          noise.noise2D(worldX * 0.045 + 401.3, worldZ * 0.045 - 77.1) > 0.42
        const top = Math.min(floor, maxY)
        for (let y = minY; y <= top; y++) {
          const id = y === floor && glitterTop ? BlockIds.GLITTERING_ABYSSAL_STONE : BlockIds.ABYSSAL_STONE
          chunk.setBlockId(localX, y - minY, localZ, id)
        }
      }
    }
  }
}
