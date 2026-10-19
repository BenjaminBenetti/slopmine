import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { BlockTags } from '../../blocks/tags/BlockTags.ts'
import { getBlock } from '../../blocks/BlockRegistry.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * One kind of ground cover in a biome: which plants, on which ground, how
 * dense, and where (an optional noise zone groups it into meadows, flower
 * fields and bare patches instead of an even sprinkle).
 */
export interface GroundCoverLayer {
  /** Blocks placed; repeat an id to weight it. */
  readonly blocks: readonly number[]
  /** Ground blocks it grows on. */
  readonly ground: readonly number[]
  /** Chance per eligible column (inside the zone, if any). */
  readonly density: number
  /** Zone noise frequency (per block): the layer grows where the noise exceeds zoneThreshold. */
  readonly zoneFrequency?: number
  /** Zone noise threshold, 0-1 (0.5 = about half the land). */
  readonly zoneThreshold?: number
  /** Soft zone edges: density ramps from 0 at the threshold to full this far above it. */
  readonly zoneFade?: number
  /** Only on ground at most this far above the biome's water level (shores). */
  readonly maxAboveWater?: number
  /** Only on ground at least this high (Y). */
  readonly minY?: number
  /**
   * Floating plants (lily pads): placed in the air above the water surface at
   * this Y, where the block there is one of `ground` (liquid sources).
   */
  readonly waterSurfaceY?: number
}

export interface GroundCoverSettings {
  /** Decorrelates this feature's placements and zones from other ground cover features. */
  readonly salt: number
  /** The biome's water level (for maxAboveWater). */
  readonly waterLevel: number
  /** Tried in order per column; the first layer whose zone and roll pass places its plant. */
  readonly layers: readonly GroundCoverLayer[]
}

/** How far above / below the blended base height the surface is searched. */
const SURFACE_SEARCH = 4

let leafIds: Set<number> | null = null

/** Leaves: the surface search looks through canopies to the ground below. */
function isLeaf(id: number): boolean {
  if (!leafIds) leafIds = new Set()
  if (leafIds.has(id)) return true
  if (id === BlockIds.AIR) return false
  if (getBlock(id).properties.tags.includes(BlockTags.LEAVES)) {
    leafIds.add(id)
    return true
  }
  return false
}

function hash01(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

/**
 * Per-column ground cover - grass carpets, flower fields, bushes, doodads,
 * lily pads - in layers (GroundCoverLayer). Each column gets at most one
 * plant, in the air cell on its surface (found near the blended base height,
 * looking through tree canopies), so it runs after the biome's other
 * features: it never blocks trees or structures, and only fills what they
 * left open. Purely per column, so sub-chunk and chunk borders are seamless.
 */
export class GroundCoverFeature extends Feature {
  readonly settings: GroundCoverSettings

  constructor(settings: GroundCoverSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, noise, getBaseHeightAt } = context
    const { layers, salt, waterLevel } = this.settings
    const coord = chunk.coordinate as ISubChunkCoordinate
    const subY = typeof coord.subY === 'number' ? coord.subY : 0
    const minY = subY * SUB_CHUNK_HEIGHT
    const maxY = minY + SUB_CHUNK_HEIGHT - 1
    const chunkX = Number(coord.x) * CHUNK_SIZE_X
    const chunkZ = Number(coord.z) * CHUNK_SIZE_Z

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const worldX = chunkX + lx
        const worldZ = chunkZ + lz
        const base = getBaseHeightAt(worldX, worldZ)
        if (base + SURFACE_SEARCH + 1 < minY || base - SURFACE_SEARCH > maxY) continue

        // Surface: the first non-air, non-leaf block from a little above the
        // base height down, with air above it in this sub-chunk
        let groundY = -1
        let groundId = 0
        let searched = false
        for (let y = Math.min(maxY - 1, base + SURFACE_SEARCH); y >= Math.max(minY, base - SURFACE_SEARCH); y--) {
          const id = chunk.getBlockId(lx, y - minY, lz)
          if (id === BlockIds.AIR || isLeaf(id)) continue
          searched = true
          if (chunk.getBlockId(lx, y + 1 - minY, lz) === BlockIds.AIR) {
            groundY = y
            groundId = id
          }
          break
        }
        // Ground on the top row of the sub-chunk below (its own pass can't
        // write up here): ask the terrain there, unless a cave opened it
        if (!searched && base < minY && base >= minY - 1 - SURFACE_SEARCH && context.getTerrainTopBelow &&
          chunk.getBlockId(lx, 0, lz) === BlockIds.AIR && !context.isSurfaceCarvedAt?.(worldX, worldZ)) {
          const below = context.getTerrainTopBelow(lx, lz)
          if (below !== BlockIds.AIR) {
            groundY = minY - 1
            groundId = below
          }
        }

        for (let i = 0; i < layers.length; i++) {
          const layer = layers[i]
          let y = groundY
          let id = groundId
          if (layer.waterSurfaceY !== undefined) {
            y = layer.waterSurfaceY
            if (y < minY || y >= maxY) continue
            id = chunk.getBlockId(lx, y - minY, lz)
            if (chunk.getBlockId(lx, y + 1 - minY, lz) !== BlockIds.AIR) continue
          } else if (groundY < 0) {
            continue
          }
          if (!layer.ground.includes(id)) continue
          if (layer.maxAboveWater !== undefined && y > waterLevel + layer.maxAboveWater) continue
          if (layer.minY !== undefined && y < layer.minY) continue

          let chance = layer.density
          if (layer.zoneFrequency !== undefined) {
            const f = layer.zoneFrequency
            const n = (noise.noise2D((worldX + salt * 977 + i * 1373) * f, (worldZ - salt * 613 + i * 2011) * f) + 1) * 0.5
            const threshold = layer.zoneThreshold ?? 0.5
            if (n < threshold) continue
            if (layer.zoneFade) chance *= Math.min(1, (n - threshold) / layer.zoneFade)
          }
          if (hash01(worldX, worldZ, salt * 131 + i * 7919) >= chance) continue

          const pick = layer.blocks[Math.floor(hash01(worldX, worldZ, salt * 389 + i * 104729) * layer.blocks.length)]
          chunk.setBlockId(lx, y + 1 - minY, lz, pick)
          break
        }
      }
    }
  }
}
