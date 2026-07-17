import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Max reach of biome-border dithering (DITHER_DISTANCE_BASE + DITHER_VARIANCE
 * in ChunkGenerationWorker). Boulders keep this far from foreign-biome regions
 * so every chunk rendering a slice agrees the boulder exists.
 */
const BIOME_BORDER_MARGIN = 16
const BIOME_BORDER_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [BIOME_BORDER_MARGIN, 0], [-BIOME_BORDER_MARGIN, 0],
  [0, BIOME_BORDER_MARGIN], [0, -BIOME_BORDER_MARGIN],
  [BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
  [-BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [-BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
]

/**
 * Configuration for boulder generation.
 */
export interface BoulderFeatureSettings {
  /** Boulder spacing grid size (larger = rarer). */
  gridSize: number
  /** Boulder density multiplier; threshold = density / gridSize². */
  density: number
  /** Minimum boulder radius in blocks. */
  minRadius: number
  /** Maximum boulder radius in blocks. */
  maxRadius: number
  /** Primary boulder block (e.g. BlockIds.MOSSY_STONE). */
  blockId: number
  /** Occasional alternate boulder block (e.g. plain BlockIds.STONE). */
  altBlockId: number
  /** Chance a boulder uses the alternate block (0-1). */
  altChance: number
  /** Skip boulders whose ground is deeper than this below the water level. */
  maxWaterDepth: number
  /**
   * Optional cluster gate: when set, boulders only spawn where
   * noise2D(x * scale + offset, z * scale + offset) > threshold. Point this
   * at the same noise field the biome uses for its surface features (e.g.
   * rock outcroppings) to make boulders cluster there.
   */
  clusterNoiseScale?: number
  clusterNoiseOffset?: number
  clusterThreshold?: number
  /** With a cluster gate set, still allow beach/shallow-water boulders. */
  shoreExempt?: boolean
}

/**
 * Boulder feature: scattered rounded rocks half-buried in the ground.
 * Boulders may sit on any surface including beaches and shallow water,
 * where they read as surf-worn rocks poking out of the bays.
 *
 * Cross-chunk handling follows the tree features: a world-anchored placement
 * grid plus fully deterministic per-boulder parameters, so every
 * chunk/sub-chunk renders an identical slice of the same boulder.
 */
export class BoulderFeature extends Feature {
  readonly settings: BoulderFeatureSettings

  constructor(settings: BoulderFeatureSettings) {
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
    const { gridSize, density, minRadius, maxRadius, blockId, altBlockId, altChance, maxWaterDepth } = this.settings
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
    const searchRadius = maxRadius
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let worldX = firstGridX; worldX <= lastGridX; worldX += gridSize) {
      for (let worldZ = firstGridZ; worldZ <= lastGridZ; worldZ += gridSize) {
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 1) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 2) * gridSize)

        const boulderWorldX = worldX + jitterX
        const boulderWorldZ = worldZ + jitterZ

        const chance = this.positionRandom(boulderWorldX, boulderWorldZ, 0)
        if (chance > density / (gridSize * gridSize)) continue

        // Don't drop boulders over cave mouths or ravines
        if (context.isSurfaceCarvedAt?.(boulderWorldX, boulderWorldZ)) continue

        // Keep boulders out of foreign-biome regions and the border dither
        // band (deterministic, so all slices agree)
        if (context.getBiomeNameAt) {
          const owner = biomeProperties.name
          let nearForeignBiome = false
          for (const [ox, oz] of BIOME_BORDER_PROBES) {
            if (context.getBiomeNameAt(boulderWorldX + ox, boulderWorldZ + oz) !== owner) {
              nearForeignBiome = true
              break
            }
          }
          if (nearForeignBiome) continue
        }

        const groundHeight = getBaseHeightAt(boulderWorldX, boulderWorldZ)

        // Deep-water floors get no boulders (invisible bumps); shallow ones do
        if (groundHeight < waterLevel - maxWaterDepth) continue

        // Cluster gate: keep boulders near the biome's rock outcroppings,
        // except on beaches/shallows when shore-exempt (surf rocks). Uses the
        // world-seeded noise, so every slice agrees.
        const { clusterNoiseScale, clusterNoiseOffset, clusterThreshold, shoreExempt } = this.settings
        if (clusterThreshold !== undefined && clusterNoiseScale !== undefined) {
          const offset = clusterNoiseOffset ?? 0
          const onShore = shoreExempt === true && groundHeight <= waterLevel + 1
          if (!onShore) {
            const clusterNoise = context.noise.noise2D(
              boulderWorldX * clusterNoiseScale + offset,
              boulderWorldZ * clusterNoiseScale + offset
            )
            if (clusterNoise <= clusterThreshold) continue
          }
        }

        const radiusRoll = this.positionRandom(boulderWorldX, boulderWorldZ, 60)
        const radius = minRadius + Math.floor(radiusRoll * (maxRadius - minRadius + 1))
        const rockBlock = this.positionRandom(boulderWorldX, boulderWorldZ, 61) < altChance ? altBlockId : blockId

        // Sphere centered at ground level -> a half-buried dome
        const topY = groundHeight + radius
        const bottomY = groundHeight - radius
        if (topY < subChunkMinY || bottomY > subChunkMaxY) continue

        this.placeBoulder(chunk, boulderWorldX, boulderWorldZ, groundHeight, radius, rockBlock, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
      }
    }
  }

  /**
   * Place a rounded boulder, clipped to this sub-chunk's Y range and chunk
   * XZ bounds. Replaces air, water, and soft ground so the dome sits flush.
   */
  private placeBoulder(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    centerWorldX: number,
    centerWorldZ: number,
    centerWorldY: number,
    radius: number,
    rockBlock: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const localX = centerWorldX + dx - chunkWorldX
        const localZ = centerWorldZ + dz - chunkWorldZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        for (let dy = -radius; dy <= radius; dy++) {
          const worldY = centerWorldY + dy
          if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          // Slight edge noise keeps boulders from looking stamped
          const edgeNoise = this.positionRandom(centerWorldX + dx, centerWorldZ + dz, 62 + dy) * 0.4
          if (dist > radius + 0.4 - edgeNoise) continue

          const localY = worldY - subChunkMinY
          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (
            currentBlock === BlockIds.AIR ||
            currentBlock === BlockIds.WATER ||
            currentBlock === BlockIds.GRASS ||
            currentBlock === BlockIds.MOSS ||
            currentBlock === BlockIds.SAND ||
            currentBlock === BlockIds.DIRT
          ) {
            chunk.setBlockId(localX, localY, localZ, rockBlock)
          }
        }
      }
    }
  }
}
