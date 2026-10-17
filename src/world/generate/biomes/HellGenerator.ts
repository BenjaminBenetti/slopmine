import * as THREE from 'three'
import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { NoiseLayerConfig, TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { HellPillarFeature } from '../features/HellPillarFeature.ts'
import { InferniumOreFeature } from '../features/InferniumOreFeature.ts'
import { ProceduralDungeonFeature } from '../dungeons/ProceduralDungeonFeature.ts'
import { INFERNAL_BASTION } from '../dungeons/kits/molten/BastionConfig.ts'
import { MOLTEN_SEA_Y, getRaftThickness, getRiverBedY, isShoreCrust } from '../molten/MoltenTerrain.ts'
import { MagmaSlimeEntity } from '../../../entities/animals/magma_slime/index.ts'
import { SkeletonEntity } from '../../../entities/enemies/skeleton/index.ts'
import { EmberRoachEntity } from '../../../entities/enemies/ember_roach/index.ts'
import { HellhoundEntity, HELLHOUND_MAX_NEARBY } from '../../../entities/enemies/hellhound/HellhoundEntity.ts'

/** Terrain heights at or above this are badland mesas: ash-topped, banded cliffs. */
const MESA_Y = 58
/** Mesas this high get a second layer of ash. */
const DEEP_ASH_Y = 62
/** Banded strata (basalt bands, ember seams) show from this Y up. */
const STRATA_MIN_Y = 50
/** Thickness of one stratum band. */
const STRATA_BAND = 3

/**
 * Mesa noise shared by the terrace layers below: identical type, scale,
 * octaves and persistence evaluate to the same value n at a column.
 */
const MESA_NOISE = { type: 'fractal', octaves: 2, persistence: 0.45, scale: 0.0065 } as const

/**
 * One terrace step of the mesas, as a pair of layers on MESA_NOISE:
 * w·(max(n, low) - max(n, high)) is a ramp from -rise (n <= low) up to 0
 * (n >= high), so the terrain steps up by `rise` (heightScale units) where n
 * crosses [low, high] - a cliff, steep for a narrow band. Built from plain
 * 'add' layers so the blended worker height (and every feature that reads
 * it) sees the mesas exactly.
 */
function terraceStep(low: number, high: number, rise: number): NoiseLayerConfig[] {
  const weight = rise / (high - low)
  return [
    { ...MESA_NOISE, weight, clampMin: low },
    { ...MESA_NOISE, weight: -weight, clampMin: high },
  ]
}

const HEIGHT_SCALE = 12
const TERRACE_LOWER = { low: 0.1, high: 0.16, rise: 1.1 }
const TERRACE_UPPER = { low: 0.34, high: 0.39, rise: 0.8 }

/**
 * The Molten Wastes (`hell`) - the first and fieriest Hell biome.
 *
 * Layer 0 (Y 0-127), under the surface layer's stone ceiling (Y 140):
 * - A lava sea at Y 46 filling every depression, with cooled obsidian crust
 *   rafts drifting on it and obsidian crusts where it laps the shore
 * - Hell-rock lowlands rising into terraced badland mesas (up to ~Y 78):
 *   cinder-ash tops, cliffs banded with basalt strata and glowing ember seams
 * - Lava rivers in straight-walled canyons, running level with the sea
 * - The great pillars soaring to the ceiling, some pouring lava falls
 * - Infernium ore deep in the rock, on canyon walls and cliffs, and in pillar roots
 * - Infernal Bastions: fortresses on the sea guarding the Pyre Tyrant
 * No skylight: the lava, ember seams and braziers are the only light, over an
 * ember-red ambient glow.
 */
export class HellGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'hell',
    frequency: 1.0, // equal share of the Hell layer with the other Hell biomes
    treeDensity: 0, // No trees underground
    layer: 0, // Underground layer (Y=0-127)
    skylightValue: 0, // Complete darkness
    features: [
      // Infernal Bastions first (procedural castle kit): pillars keep clear of them
      new ProceduralDungeonFeature(INFERNAL_BASTION),
      // Massive pillars in the air gap, some pouring lava falls
      new HellPillarFeature({
        gridSize: 20,
        density: 0.15,
        minRadius: 2,
        maxRadius: 5,
        targetTopY: 127,
        lavaFallChance: 0.22,
        avoidMoltenRivers: true,
        avoidInfernalBastions: true,
        rootOreChance: 0.02,
      }),
      // Infernium (~9 ore per chunk): buried veins around Y 38 to strip-mine,
      // one vein per chunk on a canyon wall or cliff face (where there is
      // one) to spot from afar, and nuggets in the pillar roots
      new InferniumOreFeature({
        attemptsPerChunk: 2,
        veinSize: 5,
        minY: 8,
        maxY: 62,
        peakY: 38,
        ySpread: 12,
        seaBonusAttempts: 0,
        exposedAttempts: 1,
      }),
    ],
    // No caves in Hell - the layer itself is one giant cavern
    caves: undefined,
    // Lava fills all terrain depressions below waterLevel
    water: {
      enabled: true,
      liquidBlock: BlockIds.LAVA,
      waterLevel: MOLTEN_SEA_Y,
      frequency: 0,
      minDepth: 0,
    },
    terrainConfig: {
      layers: [
        // Broad lava-sea basins vs. land
        { type: 'fractal', octaves: 3, persistence: 0.5, scale: 0.0042, weight: 1.0 },
        // Rolling detail
        { type: 'fractal', octaves: 3, persistence: 0.5, scale: 0.028, weight: 0.22 },
        // Two terrace steps: badland mesas with cliffs, sometimes as islands
        ...terraceStep(TERRACE_LOWER.low, TERRACE_LOWER.high, TERRACE_LOWER.rise),
        ...terraceStep(TERRACE_UPPER.low, TERRACE_UPPER.high, TERRACE_UPPER.rise),
      ],
      // The terraces contribute -(lower.rise + upper.rise) off the mesas;
      // compensate so the low ground sits around Y 44 (just under the sea)
      baseHeight: 44 + (TERRACE_LOWER.rise + TERRACE_UPPER.rise) * HEIGHT_SCALE,
      heightScale: HEIGHT_SCALE,
      combineMode: 'add',
      absoluteHeight: true, // Skip seaLevel for underground biome
    } as TerrainConfig,
    // The whole layer is underground (sky fully dark): a thick dark-red haze
    // over the lava sea instead of black fog, and ember-warm face shading.
    // The haze and the ember glow are tuned together: lit ground near the
    // player must be at least as bright as the haze it fades into, or the
    // floor reads as a black void under a glowing red distance (inverted
    // aerial perspective).
    skybox: {
      undergroundFogColor: { r: 0.15, g: 0.04, b: 0.025 },
      fogDensity: 2.4,
      lightTint: { r: 1.0, g: 0.86, b: 0.76 },
      // Ambient ember glow (like the Nether's ambient light, linear): rock
      // far from lava stays readable as dark crimson, not black silhouettes
      minimumLight: { r: 0.33, g: 0.15, b: 0.1 },
    },
    // Spawns stay inside the cavern (never searchFromSky underground)
    entitySpawns: [
      {
        entityType: 'magma_slime',
        spawnRate: 0.25,
        minY: 44,
        maxY: 120,
        maxNearby: 10,
        createEntity: (pos: THREE.Vector3) => new MagmaSlimeEntity({ position: pos, variant: 'hell' }),
      },
      {
        entityType: 'skeleton',
        spawnRate: 0.1,
        minY: 44,
        maxY: 120,
        maxNearby: 5,
        createEntity: (pos: THREE.Vector3) => new SkeletonEntity({ position: pos }),
      },
      {
        // Bastion garrison: skeletons favour the fortresses' brick floors
        entityType: 'skeleton',
        spawnRate: 0.5,
        minY: 44,
        maxY: 120,
        maxNearby: 7,
        validGroundBlocks: [BlockIds.INFERNAL_BRICKS, BlockIds.CRACKED_INFERNAL_BRICKS, BlockIds.INFERNAL_TILES],
        createEntity: (pos: THREE.Vector3) => new SkeletonEntity({ position: pos }),
      },
      {
        entityType: 'ember_roach',
        spawnRate: 0.18,
        minY: 44,
        maxY: 120,
        maxNearby: 6,
        createEntity: (pos: THREE.Vector3) => new EmberRoachEntity({ position: pos }),
      },
      {
        // Hellhounds hunt the badlands in packs (the leader brings 1-2 more)
        entityType: 'hellhound',
        spawnRate: 0.06,
        minY: 47,
        maxY: 120,
        maxNearby: HELLHOUND_MAX_NEARBY,
        validGroundBlocks: [BlockIds.HELL_ASH, BlockIds.HELL_ROCK, BlockIds.BASALT, BlockIds.OBSIDIAN],
        createEntity: (pos: THREE.Vector3) => new HellhoundEntity({ position: pos, packLeader: true }),
      },
    ],
  }

  /**
   * Fill the Molten Wastes: rock from Y 0 to the blended surface height,
   * with lava river canyons cut level with the sea, obsidian shore crusts
   * and sea rafts, cinder-ash mesa tops and banded cliff strata.
   *
   * Uses the BLENDED height getter it is given (never this.getHeightAt), so
   * terrain meets neighbouring Hell biomes seamlessly.
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const coord = chunk.coordinate
    const subMaxY = Math.min(maxY, minY + SUB_CHUNK_HEIGHT - 1)

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const surfaceHeight = getHeightAt(worldX, worldZ)

        // Obsidian rafts float on the sea surface above deep columns (the
        // water pass later fills the lava around and under them)
        const raft = getRaftThickness(noise, worldX, worldZ, surfaceHeight)
        for (let y = MOLTEN_SEA_Y - raft + 1; raft > 0 && y <= MOLTEN_SEA_Y; y++) {
          if (y >= minY && y <= subMaxY) chunk.setBlockId(localX, y - minY, localZ, BlockIds.OBSIDIAN)
        }

        const fillTop = Math.min(surfaceHeight, subMaxY)
        if (fillTop < minY) continue

        // Lava river canyon: open above the bed, lava up to the sea level
        const riverBed = getRiverBedY(noise, worldX, worldZ, surfaceHeight)

        const isMesa = surfaceHeight >= MESA_Y
        const crust = !isMesa && isShoreCrust(noise, worldX, worldZ, surfaceHeight)
        // Strata undulate gently so bands don't read as ruler lines
        const strataOffset = surfaceHeight >= STRATA_MIN_Y
          ? Math.floor(noise.noise2D(worldX * 0.012 + 41.3, worldZ * 0.012 - 17.9) * 4)
          : 0
        // Ember seams glow only near exposed cliff faces (they are light
        // emitters - no point burying thousands inside solid rock)
        let faceFloor = Infinity
        if (isMesa) {
          faceFloor = Math.min(
            getHeightAt(worldX + 2, worldZ),
            getHeightAt(worldX - 2, worldZ),
            getHeightAt(worldX, worldZ + 2),
            getHeightAt(worldX, worldZ - 2)
          )
        }

        for (let worldY = minY; worldY <= fillTop; worldY++) {
          const localY = worldY - minY

          if (riverBed !== null && worldY > riverBed) {
            if (worldY <= MOLTEN_SEA_Y) chunk.setBlockId(localX, localY, localZ, BlockIds.LAVA)
            continue // canyon air above the lava
          }

          let blockId: number = BlockIds.HELL_ROCK
          if (worldY === surfaceHeight && riverBed === null) {
            if (crust) {
              blockId = BlockIds.OBSIDIAN
            } else if (isMesa) {
              // Cinder ash, pocked with hot magma vents that light the mesas
              blockId = noise.noise2D(worldX * 0.21 + 7.7, worldZ * 0.21 - 3.3) > 0.83
                ? BlockIds.HELL_MAGMA
                : BlockIds.HELL_ASH
            }
          } else if (worldY === surfaceHeight - 1 && surfaceHeight >= DEEP_ASH_Y && riverBed === null) {
            blockId = BlockIds.HELL_ASH
          } else if (worldY >= STRATA_MIN_Y && surfaceHeight >= STRATA_MIN_Y + 4) {
            const band = Math.floor((worldY + strataOffset) / STRATA_BAND) % 5
            if (band === 1) {
              blockId = BlockIds.BASALT
            } else if (band === 3 && worldY > faceFloor) {
              // Dashed ember seam along the cliff face
              if (noise.noise2D(worldX * 0.15 - 9.1, worldY * 0.4 + worldZ * 0.15) > 0.25) {
                blockId = BlockIds.HELL_MAGMA
              }
            }
          }
          chunk.setBlockId(localX, localY, localZ, blockId)
        }
      }
    }
  }
}
