import { BiomeGenerator, type BiomeProperties } from '../BiomeGenerator.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import type { TerrainConfig } from '../terrain/TerrainConfig.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { LAKE_LEVEL } from '../cocytus/CocytusTerrain.ts'
import { FrozenLakeFeature } from '../features/FrozenLakeFeature.ts'
import { IceSpireFeature } from '../features/IceSpireFeature.ts'
import { FrozenLavafallFeature } from '../features/FrozenLavafallFeature.ts'
import { FrostCrystalFeature } from '../features/FrostCrystalFeature.ts'
import { ProceduralDungeonFeature } from '../dungeons/ProceduralDungeonFeature.ts'
import { FROZEN_CITADEL } from '../dungeons/kits/cocytus/frozenCitadelConfig.ts'
import { OreFeature } from '../features/OreFeature.ts'
import { cocytusEntitySpawns } from '../../../entities/enemies/cocytus/cocytusSpawns.ts'

/**
 * Cocytus - Dante's frozen lake at the bottom of Hell (layer 0, Y 0-127).
 *
 * A vast lake of black ice where the Molten Wastes hold lava (same level,
 * Y 46), broken by pressure ridges and sinners entombed in the ice; dark
 * rimestone shores crusted with hoarfrost and heaped with ash-snow drifts;
 * jagged spires of glacial ice; frozen lavafalls; frost crystals giving cold
 * blue light; and the Frozen Citadels, ice palaces of the Rime Sovereign.
 * Bitter and silent: an icy blue-grey haze and a cold blue light floor.
 *
 * Terrain is a low basin (mostly below the lake surface) with rocky shores
 * and islands; Y 60-127 stays open so the layer reads as a vast cavern with
 * the spires and crags reaching up into it.
 */
export class CocytusGenerator extends BiomeGenerator {
  protected readonly properties: BiomeProperties = {
    name: 'cocytus',
    frequency: 1.0,
    treeDensity: 0,
    layer: 0,
    skylightValue: 0,
    features: [
      // The lake first: ice fill, ridges, drifts, entombed figures
      new FrozenLakeFeature({
        lyingFigureGrid: 13,
        lyingFigureChance: 0.22, // ~1.3 per chunk (on flat ice only)
        pillarGrid: 48,
        pillarChance: 0.45, // ~0.2 groups per chunk
        ridgeFigureGrid: 10,
        ridgeFigureChance: 0.35,
      }),
      // Rime crystal veins in the lake bed, shores and the lake ice itself
      new OreFeature({
        blockId: BlockIds.RIME_CRYSTAL_ORE,
        frequency: 9,
        veinSize: 6,
        minY: 18,
        maxY: 64,
        peakY: 42,
        ySpread: 9,
        replaceableBlocks: [BlockIds.RIMESTONE, BlockIds.FROSTED_RIMESTONE, BlockIds.BLACK_ICE],
      }),
      // Great ice spires (~0.3 clusters per chunk) ...
      new IceSpireFeature({
        gridSize: 40,
        chance: 0.5,
        minHeight: 14,
        maxHeight: 58,
        minRadius: 1.5,
        maxRadius: 4.5,
        maxSatellites: 3,
        icicleChance: 0.35,
        blackIceChance: 0.2,
      }),
      // ... and stalagmites (~1.5 clusters per chunk)
      new IceSpireFeature({
        gridSize: 14,
        chance: 0.3,
        minHeight: 3,
        maxHeight: 10,
        minRadius: 0.6,
        maxRadius: 1.6,
        maxSatellites: 2,
        icicleChance: 0,
        blackIceChance: 0.3,
      }),
      // Frozen lavafalls (~1 crag per 13 chunks)
      new FrozenLavafallFeature({
        gridSize: 72,
        chance: 0.4,
        minHeight: 32,
        maxHeight: 60,
        minRadius: 4.5,
        maxRadius: 7,
      }),
      // The Frozen Citadel: one procedural castle per Cocytus region (p 0.85), see
      // dungeons/kits/cocytus/FrozenCitadelKit.ts; spires and lavafalls keep out of it
      new ProceduralDungeonFeature(FROZEN_CITADEL),
      // Cold light last (sits on whatever surface is left open)
      new FrostCrystalFeature({ chance: 0.0022, gladeBoost: 3.5 }),
    ],
    // The layer itself is one giant cavern
    caves: undefined,
    // The lake is FrozenLakeFeature (solid black ice, not a liquid)
    water: undefined,
    terrainConfig: {
      layers: [
        // Broad basins and shores
        { type: 'fractal', octaves: 4, persistence: 0.5, scale: 0.006, weight: 1.0 },
        // Rocky crests: islands and headlands rising out of the ice
        { type: 'ridged', octaves: 2, persistence: 0.5, scale: 0.014, weight: 2.6, offset: -0.52, clampMin: 0 },
      ],
      // ~62% of the floor lies below the lake surface; crests reach ~Y 80
      baseHeight: 38,
      heightScale: 21,
      combineMode: 'add',
      absoluteHeight: true,
    } as TerrainConfig,
    // Icy blue-grey haze and a cold blue light floor. As in Hell, the floor and
    // the haze are tuned together so lit ground near the player is never darker
    // than the haze it fades into (black ice is meant to read as dark glass).
    skybox: {
      undergroundFogColor: { r: 0.1, g: 0.135, b: 0.185 },
      fogDensity: 2.0,
      lightTint: { r: 0.84, g: 0.93, b: 1.0 },
      minimumLight: { r: 0.33, g: 0.41, b: 0.58 },
    },
    entitySpawns: cocytusEntitySpawns,
  }

  /**
   * Rimestone up to the blended surface. Land surfaces are frosted rimestone,
   * bare rimestone on steep crags, ash snow in drift hollows; the lake bed
   * is bare rimestone (the frozen lake itself is FrozenLakeFeature).
   */
  protected fillChunk(
    chunk: IChunkData,
    minY: number,
    _maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    const coord = chunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z
    const topY = minY + SUB_CHUNK_HEIGHT - 1

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = chunkWorldX + lx
        const wz = chunkWorldZ + lz
        const h = getHeightAt(wx, wz)
        if (h < minY) continue

        let surface: number = BlockIds.RIMESTONE
        let drift = false
        if (h >= LAKE_LEVEL) {
          const slope = Math.max(
            Math.abs(getHeightAt(wx + 1, wz) - h),
            Math.abs(getHeightAt(wx - 1, wz) - h),
            Math.abs(getHeightAt(wx, wz + 1) - h),
            Math.abs(getHeightAt(wx, wz - 1) - h)
          )
          if (slope < 3) {
            const d = noise.noise2D(wx * 0.021 + 17.3, wz * 0.021 - 8.9) * 0.75 + noise.noise2D(wx * 0.09, wz * 0.09) * 0.25
            drift = d > 0.3
            surface = drift ? BlockIds.ASH_SNOW : BlockIds.FROSTED_RIMESTONE
          }
        }

        const yEnd = Math.min(h, topY)
        for (let y = minY; y <= yEnd; y++) {
          let id: number = BlockIds.RIMESTONE
          if (y === h) id = surface
          else if (drift && y >= h - 2) id = BlockIds.ASH_SNOW
          chunk.setBlockId(lx, y - minY, lz, id)
        }
      }
    }
  }
}
