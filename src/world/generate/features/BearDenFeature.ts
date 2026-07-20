import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Max reach of biome-border dithering (DITHER_DISTANCE_BASE + DITHER_VARIANCE
 * in ChunkGenerationWorker). Dens keep this far from foreign-biome regions so
 * every chunk rendering a slice agrees the den exists.
 */
const BIOME_BORDER_MARGIN = 16
const BIOME_BORDER_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [BIOME_BORDER_MARGIN, 0], [-BIOME_BORDER_MARGIN, 0],
  [0, BIOME_BORDER_MARGIN], [0, -BIOME_BORDER_MARGIN],
  [BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
  [-BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [-BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
]

/** Horizontal footprint radius of the den (5x5 footprint). */
const DEN_RADIUS = 2
/** Den spans dy -1 (buried base slab) to +3 (rubble cap) around ground level. */
const DEN_MIN_DY = -1
const DEN_MAX_DY = 3
/** The four cardinal directions the entrance may face. */
const FACINGS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
]
/** Ground blocks the den may replace when placing its stones. */
const REPLACEABLE_BLOCKS: ReadonlySet<number> = new Set([
  BlockIds.AIR,
  BlockIds.WATER,
  BlockIds.GRASS,
  BlockIds.MOSS,
  BlockIds.SAND,
  BlockIds.DIRT,
  BlockIds.PODZOL,
])

/**
 * Configuration for bear den generation.
 * Exported for worker serialization (WorldGenerator -> ChunkGenerationWorker).
 */
export interface BearDenFeatureSettings {
  /** Den spacing grid size (larger = rarer). */
  gridSize: number
  /** Den density multiplier; per-cell chance = density / gridSize². */
  density: number
  /** Primary den block (e.g. BlockIds.MOSSY_STONE). */
  blockId: number
  /** Occasional alternate den block (e.g. plain BlockIds.STONE). */
  altBlockId: number
  /** Chance a den stone uses the alternate block (0-1, rolled per block). */
  altChance: number
}

/**
 * Bear den feature: a very rare mossy-stone boulder pile (~5x4x5) with a
 * hollow 3x3 cavity, two blocks tall, opening through a 1x2 doorway on one
 * side. Reads as a den for the pine forest's bears. No interior block
 * entities (chests need block state, which workers can't create).
 *
 * Cross-chunk handling follows BoulderFeature: a world-anchored placement
 * grid plus fully deterministic per-den parameters (position jitter, facing,
 * per-block material roll), so every chunk/sub-chunk renders an identical
 * slice of the same den.
 */
export class BearDenFeature extends Feature {
  readonly settings: BearDenFeatureSettings

  constructor(settings: BearDenFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Generate a deterministic random number based on position.
   */
  private positionRandom(x: number, z: number, salt: number): number {
    const hash = Math.sin(x * 12.9898 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return hash - Math.floor(hash)
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, biomeProperties } = context
    const { gridSize, density } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    const waterLevel = biomeProperties.water?.enabled ? biomeProperties.water.waterLevel : -Infinity

    // World-anchored grid (see PineTreeFeature for why chunk-anchored grids
    // desync at chunk borders)
    const searchRadius = DEN_RADIUS + 1
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let gridX = firstGridX; gridX <= lastGridX; gridX += gridSize) {
      for (let gridZ = firstGridZ; gridZ <= lastGridZ; gridZ += gridSize) {
        // Jitter within the cell, keeping the footprint inside the cell so the
        // grid spacing is honored
        const jitterRange = Math.max(1, gridSize - DEN_RADIUS * 2)
        const jitterX = Math.floor(this.positionRandom(gridX, gridZ, 11) * jitterRange)
        const jitterZ = Math.floor(this.positionRandom(gridX, gridZ, 12) * jitterRange)

        const denWorldX = gridX + jitterX
        const denWorldZ = gridZ + jitterZ

        const chance = this.positionRandom(denWorldX, denWorldZ, 10)
        if (chance > density / (gridSize * gridSize)) continue

        // Keep dens out of foreign-biome regions and the border dither band
        // (deterministic, so all slices agree)
        if (context.getBiomeNameAt) {
          const owner = biomeProperties.name
          let nearForeignBiome = false
          for (const [ox, oz] of BIOME_BORDER_PROBES) {
            if (context.getBiomeNameAt(denWorldX + ox, denWorldZ + oz) !== owner) {
              nearForeignBiome = true
              break
            }
          }
          if (nearForeignBiome) continue
        }

        const groundHeight = getBaseHeightAt(denWorldX, denWorldZ)

        // Dens need dry ground - stay clear of pools and shores
        if (groundHeight <= waterLevel + 1) continue

        // Deterministic entrance facing
        const facingRoll = this.positionRandom(denWorldX, denWorldZ, 13)
        const [faceX, faceZ] = FACINGS[Math.min(3, Math.floor(facingRoll * 4))]

        // Don't build over cave mouths or ravines: probe the center and the
        // ground in front of the entrance
        if (
          context.isSurfaceCarvedAt?.(denWorldX, denWorldZ) ||
          context.isSurfaceCarvedAt?.(denWorldX + faceX * (DEN_RADIUS + 1), denWorldZ + faceZ * (DEN_RADIUS + 1))
        ) {
          continue
        }

        // Require reasonably flat ground: the corners must not deviate more
        // than 1 block from the center (deterministic - heights are global)
        let tooSteep = false
        for (const [cx, cz] of [[DEN_RADIUS, DEN_RADIUS], [DEN_RADIUS, -DEN_RADIUS], [-DEN_RADIUS, DEN_RADIUS], [-DEN_RADIUS, -DEN_RADIUS]] as const) {
          const cornerHeight = getBaseHeightAt(denWorldX + cx, denWorldZ + cz)
          if (Math.abs(cornerHeight - groundHeight) > 1) {
            tooSteep = true
            break
          }
        }
        if (tooSteep) continue

        // Y overlap check with this sub-chunk
        const topY = groundHeight + DEN_MAX_DY
        const bottomY = groundHeight + DEN_MIN_DY
        if (topY < subChunkMinY || bottomY > subChunkMaxY) continue

        this.placeDen(
          chunk,
          denWorldX, denWorldZ, groundHeight,
          faceX, faceZ,
          subChunkMinY, subChunkMaxY,
          chunkWorldX, chunkWorldZ
        )
      }
    }
  }

  /**
   * Place the den structure, clipped to this sub-chunk's Y range and chunk XZ
   * bounds. Layout relative to ground level G at the den center:
   *
   * dy -1: 5x5 buried base slab (anchors the den into uneven ground)
   * dy 0-1: 5x5 perimeter wall ring around a 3x3 air cavity, with a 1-wide
   *         2-tall doorway through the wall on the facing side
   * dy 2: full 5x5 roof with rounded (trimmed) corners
   * dy 3: 3x3 rubble cap with noise-trimmed edges
   */
  private placeDen(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    centerWorldX: number,
    centerWorldZ: number,
    groundY: number,
    faceX: number,
    faceZ: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { blockId, altBlockId, altChance } = this.settings

    for (let dx = -DEN_RADIUS; dx <= DEN_RADIUS; dx++) {
      for (let dz = -DEN_RADIUS; dz <= DEN_RADIUS; dz++) {
        const localX = centerWorldX + dx - chunkWorldX
        const localZ = centerWorldZ + dz - chunkWorldZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        const absDx = Math.abs(dx)
        const absDz = Math.abs(dz)
        // Cell lies on the doorway line: at the wall (distance 2) along the
        // facing axis, centered on the cross axis
        const isDoorwayColumn =
          dx === faceX * DEN_RADIUS && dz === faceZ * DEN_RADIUS &&
          (faceX === 0 ? dx === 0 : dz === 0)

        for (let dy = DEN_MIN_DY; dy <= DEN_MAX_DY; dy++) {
          const worldY = groundY + dy
          if (worldY < subChunkMinY || worldY > subChunkMaxY) continue
          const localY = worldY - subChunkMinY

          // Classify the cell
          let cell: 'air' | 'stone' | 'skip' = 'skip'

          if (dy === -1) {
            // Buried base slab
            cell = 'stone'
          } else if (dy === 0 || dy === 1) {
            if (isDoorwayColumn) {
              cell = 'air' // 1x2 doorway through the wall
            } else if (absDx <= 1 && absDz <= 1) {
              cell = 'air' // 3x3 x 2-tall interior cavity
            } else {
              cell = 'stone' // Perimeter wall ring (corners kept for integrity)
            }
          } else if (dy === 2) {
            // Full roof; trim the 4 outer corners for a rounded silhouette
            cell = absDx === DEN_RADIUS && absDz === DEN_RADIUS ? 'skip' : 'stone'
          } else if (dy === 3) {
            // Rubble cap on top, noise-trimmed at the edges (dy 2 is a full
            // roof underneath, so trimming here never opens the cavity)
            if (absDx <= 1 && absDz <= 1) {
              const trim = this.positionRandom(centerWorldX + dx, centerWorldZ + dz, 14)
              const isEdge = absDx === 1 || absDz === 1
              cell = isEdge && trim < 0.45 ? 'skip' : 'stone'
            }
          }

          if (cell === 'air') {
            // Carve the cavity/doorway even through terrain bumps
            chunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
          } else if (cell === 'stone') {
            const currentBlock = chunk.getBlockId(localX, localY, localZ)
            if (REPLACEABLE_BLOCKS.has(currentBlock)) {
              const materialRoll = this.positionRandom(centerWorldX + dx, centerWorldZ + dz, 15 + dy)
              const rockBlock = materialRoll < altChance ? altBlockId : blockId
              chunk.setBlockId(localX, localY, localZ, rockBlock)
            }
          }
        }
      }
    }
  }
}
