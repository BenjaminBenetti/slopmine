import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { FossilFeature } from '../features/ossuary/FossilFeature.ts'
import { BoneSpireFeature } from '../features/ossuary/BoneSpireFeature.ts'
import { OssuaryScatterFeature } from '../features/ossuary/OssuaryScatterFeature.ts'
import { ProceduralDungeonFeature } from '../dungeons/ProceduralDungeonFeature.ts'
import { CATACOMBS } from '../dungeons/kits/ossuary/CatacombsConfig.ts'
import { hash2 } from '../features/ossuary/ossuaryHash.ts'
import { SkeletonEntity } from '../../../entities/enemies/skeleton/index.ts'
import { WraithEntity } from '../../../entities/enemies/wraith/index.ts'
import { BoneHoundEntity } from '../../../entities/enemies/bone_hound/index.ts'

/** Chance a bare-rock surface block is an exposed soul vein. */
const SURFACE_VEIN_CHANCE = 0.03

/**
 * The Ossuary - a Hell-layer biome (layer 0, Y 0-127): a vast cavern floored
 * with pale bone-ash dunes over grey-olive ossified rock, where colossal
 * fossils (ribcages, vertebrae arches, horned skulls) breach the ash and
 * vertebra-banded bone spires climb toward the ceiling, lit by sickly green
 * soul fire. Unique resource: soul veins (soul shards). Dungeon: the
 * Catacombs necropolis (walled precinct, chapel-mausoleum, three crypt
 * levels), ruled by the Bone King.
 */
export class OssuaryGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'ossuary',
    frequency: 1.0,
    treeDensity: 0,
    layer: 0,
    skylightValue: 0,
    features: [
      // Soul veins in the ossified rock (and exposed on its slopes)
      new OreFeature({
        blockId: BlockIds.SOUL_VEIN,
        frequency: 10,
        veinSize: 6,
        minY: 8,
        maxY: 90,
        peakY: 42,
        ySpread: 16,
        replaceableBlocks: [BlockIds.OSSIFIED_ROCK],
      }),
      // Colossal fossils: (512/96)² × 0.7 ≈ 20 candidates per 512² region,
      // ~10-12 after the biome-border / Catacombs vetoes (headless census)
      new FossilFeature({
        gridSize: 96,
        chance: 0.7,
        ribcageShare: 0.4,
        archShare: 0.32,
      }),
      // Bone spires: (512/36)² × 0.4 ≈ 81 candidates per region, ~45 after
      // the vetoes (headless census); 25% reach the ceiling, 60% of the rest
      // carry a soul-lantern beacon
      new BoneSpireFeature({
        gridSize: 36,
        chance: 0.4,
        columnShare: 0.25,
        lanternShare: 0.6,
        veinChance: 0.05,
      }),
      // Soul-bloom patches, bone piles and half-buried bones on the ash
      new OssuaryScatterFeature({
        bloomPatchChance: 0.09,
        bloomChance: 0.004,
        patchThreshold: 0.38,
        patchScale: 0.045,
        bonePileChance: 0.006,
        buriedBoneChance: 0.003,
      }),
      // The Catacombs necropolis (procedural kit, one per region at 85%) -
      // last, so its crypts carve through everything above
      new ProceduralDungeonFeature(CATACOMBS),
    ],
    caves: undefined, // the layer itself is one giant cavern
    terrainConfig: {
      layers: [
        // Broad basins and plateaus
        { type: 'fractal', octaves: 3, persistence: 0.5, scale: 0.008, weight: 1.0 },
        // Rounded ash dunes and drifts
        { type: 'billowed', octaves: 2, persistence: 0.45, scale: 0.035, weight: 0.3 },
      ],
      baseHeight: 46,
      heightScale: 14,
      combineMode: 'add',
      absoluteHeight: true,
    } as TerrainConfig,
    // Pale grey-green haze and a cold greenish light floor: the bone ash reads
    // pale green-white near the player and the distance fades into a dim
    // grey-green, never brighter than the lit ground (see HellGenerator).
    skybox: {
      undergroundFogColor: { r: 0.16, g: 0.21, b: 0.18 },
      fogDensity: 2.1,
      lightTint: { r: 0.9, g: 1.0, b: 0.92 },
      minimumLight: { r: 0.3, g: 0.37, b: 0.31 },
    },
    entitySpawns: [
      {
        entityType: 'wraith',
        spawnRate: 0.16,
        minY: 30,
        maxY: 120,
        maxNearby: 6,
        createEntity: (pos: THREE.Vector3) => new WraithEntity({ position: pos }),
      },
      {
        entityType: 'bone_hound',
        spawnRate: 0.16,
        minY: 25,
        maxY: 110,
        maxNearby: 6,
        createEntity: (pos: THREE.Vector3) => new BoneHoundEntity({ position: pos }),
      },
      {
        entityType: 'skeleton',
        spawnRate: 0.1,
        minY: 15,
        maxY: 110,
        maxNearby: 5,
        createEntity: (pos: THREE.Vector3) => new SkeletonEntity({ position: pos }),
      },
    ],
  }

  /**
   * Bone ash over ossified rock. The ash is 2-5 blocks deep on gentle
   * ground, thins on slopes and vanishes on steep ones and on rock outcrops,
   * so the darker fossil rock (and its soul veins) shows through.
   * Uses the passed (blended) height getter.
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const chunkWorldX = Number(chunk.coordinate.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(chunk.coordinate.z) * CHUNK_SIZE_Z
    const topY = Math.min(maxY, minY + SUB_CHUNK_HEIGHT - 1)

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldX = chunkWorldX + localX
        const worldZ = chunkWorldZ + localZ
        const height = getHeightAt(worldX, worldZ)
        if (height < minY) continue

        const slope = Math.max(
          Math.abs(getHeightAt(worldX + 1, worldZ) - getHeightAt(worldX - 1, worldZ)),
          Math.abs(getHeightAt(worldX, worldZ + 1) - getHeightAt(worldX, worldZ - 1))
        )
        let ashDepth: number
        if (slope >= 4) {
          ashDepth = 0
        } else if (slope === 3) {
          ashDepth = 1
        } else {
          const drift = noise.noise2D(worldX * 0.06 + 91.3, worldZ * 0.06 - 47.9) * 0.5 + 0.5
          ashDepth = 2 + Math.floor(drift * 4)
        }
        // Wind-scoured rock outcrops
        if (noise.noise2D(worldX * 0.018 - 503.1, worldZ * 0.018 + 211.7) > 0.68) ashDepth = 0
        // Soul veins glinting on bare rock: the green that reads from afar
        const surfaceVein = ashDepth === 0 && hash2(worldX, worldZ, 7500, this.config.seed) < SURFACE_VEIN_CHANCE

        const top = Math.min(height, topY)
        for (let worldY = minY; worldY <= top; worldY++) {
          const blockId = worldY > height - ashDepth
            ? BlockIds.BONE_ASH
            : surfaceVein && worldY === height ? BlockIds.SOUL_VEIN : BlockIds.OSSIFIED_ROCK
          chunk.setBlockId(localX, worldY - minY, localZ, blockId)
        }
      }
    }
  }
}
