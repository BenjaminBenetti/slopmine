import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { GiantFungusFeature } from '../features/embergrove/GiantFungusFeature.ts'
import { ProceduralDungeonFeature } from '../dungeons/ProceduralDungeonFeature.ts'
import { SPOREHEART_HIVE } from '../dungeons/kits/embergrove/hiveConstants.ts'
import { EmberFloorFeature } from '../features/embergrove/EmberFloorFeature.ts'
import { EmberHogEntity } from '../../../entities/animals/ember_hog/index.ts'
import { SporeStalkerEntity } from '../../../entities/enemies/spore_stalker/index.ts'
import { EmberRoachEntity } from '../../../entities/enemies/ember_roach/index.ts'

/**
 * Ember Grove - a Hell-layer forest of giant glowing fungi.
 *
 * Layer 0 (Y 0-127): a gently rolling crimson-mycelium floor around Y 38-56
 * over hell rock, and above it a vast open cavern filled by a canopy of
 * giant hell-fungi (emberwood stems, crimson ember-spotted caps with teal
 * glowing gills, hanging spore strands, spiral shelf fungi), an understorey
 * of smaller fungi, and glowcap patches lighting the floor. The first place
 * in Hell that feels like a forest: lush, alive, a little sinister. Home of
 * the Sporeheart Hive dungeon.
 */
export class EmberGroveGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'ember-grove',
    frequency: 1.0,
    treeDensity: 0,
    layer: 0,
    skylightValue: 0,
    features: [
      // Canopy giants: ~1.1 per chunk (0.72 · 1024 / 26²)
      new GiantFungusFeature({
        gridSize: 26,
        chance: 0.72,
        jitter: 0.6,
        minStemHeight: 24,
        maxStemHeight: 44,
        minBaseRadius: 2.3,
        maxBaseRadius: 3.3,
        minTopRadius: 1.3,
        maxTopRadius: 1.9,
        minCapRadius: 7.5,
        maxCapRadius: 12.5,
        minCapRise: 0.22,
        maxCapRise: 0.5,
        capThickness: 2,
        maxLean: 4,
        flareAmount: 2.4,
        spiralShelfChance: 0.35,
        scatteredShelfChance: 0.45,
        strandChance: 0.08,
        strandMaxLength: 7,
        // Canopy gills sit 25-45 blocks up: a few lit cells pool teal light
        // under the caps; the rest glow through their texture
        gillLightChance: 0.06,
        hiveClearing: 10,
        salt: 1,
      }),
      // Understorey fungi: ~2.4 per chunk (0.4 · 1024 / 13²)
      new GiantFungusFeature({
        gridSize: 13,
        chance: 0.4,
        jitter: 0.8,
        minStemHeight: 6,
        maxStemHeight: 15,
        minBaseRadius: 0.9,
        maxBaseRadius: 1.6,
        minTopRadius: 0.6,
        maxTopRadius: 1.0,
        minCapRadius: 3.2,
        maxCapRadius: 6.5,
        minCapRise: 0.35,
        maxCapRise: 0.65,
        capThickness: 1,
        maxLean: 2,
        flareAmount: 1.2,
        spiralShelfChance: 0,
        scatteredShelfChance: 0.2,
        strandChance: 0.06,
        strandMaxLength: 3,
        // Understorey caps are close to the floor: more of their gills light it
        gillLightChance: 0.16,
        hiveClearing: 6,
        salt: 2,
      }),
      // The Sporeheart Hive (procedural; after the fungi, which keep clear of its mound)
      new ProceduralDungeonFeature(SPOREHEART_HIVE),
      // Floor cover last (only on bare mycelium)
      new EmberFloorFeature({
        glowcapPatchScale: 0.06,
        glowcapPatchThreshold: 0.42,
        glowcapDensity: 0.32,
        glowcapScatter: 0.006,
        sproutPatchScale: 0.045,
        sproutPatchThreshold: -0.15,
        sproutDensity: 0.15,
      }),
    ],
    caves: undefined, // the layer itself is the cavern
    terrainConfig: {
      layers: [
        { type: 'fractal', octaves: 4, persistence: 0.5, scale: 0.011, weight: 1.0 },
        // Soft mycelium mounds
        { type: 'billowed', octaves: 2, persistence: 0.5, scale: 0.035, weight: 0.3 },
      ],
      baseHeight: 46,
      heightScale: 8,
      combineMode: 'add',
      absoluteHeight: true,
    } as TerrainConfig,
    // Warm crimson haze with a teal undertone; the ambient floor is a
    // rose-crimson glow (like Hell's ember light, cooler and pinker), and
    // the teal comes from gills, glowcaps and spore sacs. Haze is a bit
    // thinner than the Molten Wastes so the glowing canopy reads at range.
    skybox: {
      undergroundFogColor: { r: 0.15, g: 0.035, b: 0.06 },
      fogDensity: 2.2,
      lightTint: { r: 1.0, g: 0.86, b: 0.9 },
      minimumLight: { r: 0.28, g: 0.13, b: 0.16 },
    },
    entitySpawns: [
      {
        entityType: 'ember_hog',
        spawnRate: 0.22,
        minY: 30,
        maxY: 100,
        maxNearby: 8,
        validGroundBlocks: [BlockIds.CRIMSON_MYCELIUM],
        createEntity: (pos: THREE.Vector3) => new EmberHogEntity({ position: pos }),
      },
      {
        entityType: 'spore_stalker',
        spawnRate: 0.14,
        minY: 30,
        maxY: 110,
        maxNearby: 5,
        createEntity: (pos: THREE.Vector3) => new SporeStalkerEntity({ position: pos }),
      },
      {
        entityType: 'ember_roach',
        spawnRate: 0.05,
        minY: 40,
        maxY: 120,
        maxNearby: 3,
        createEntity: (pos: THREE.Vector3) => new EmberRoachEntity({ position: pos }),
      },
    ],
  }

  /**
   * Hell rock up to the blended surface, crimson mycelium on top (a few
   * bare-rock clearings break it up).
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

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldX = chunkWorldX + localX
        const worldZ = chunkWorldZ + localZ
        const surface = getHeightAt(worldX, worldZ)
        if (surface < minY) continue

        const bare = noise.noise2D(worldX * 0.03 + 71.3, worldZ * 0.03 - 19.7) < -0.62
        const top = Math.min(surface, minY + SUB_CHUNK_HEIGHT - 1)
        for (let worldY = minY; worldY <= top; worldY++) {
          const id = worldY === surface && !bare ? BlockIds.CRIMSON_MYCELIUM : BlockIds.HELL_ROCK
          chunk.setBlockId(localX, worldY - minY, localZ, id)
        }
      }
    }
  }
}
