import { Feature, type FeatureContext } from '../Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../../interfaces/IChunk.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { hash2, hash3 } from '../../crystal/CrystalAbyssShape.ts'
import { isNearPrismSanctum } from '../../dungeons/kits/crystal/PrismSanctumSite.ts'
import {
  floorAt, footprintInOwnBiome, forEachGridCell, getAt, getSubChunkBounds, isOpenOrTerrain,
  rasterizeShard, setAt, type SubChunkBounds,
} from './CrystalFeatureUtils.ts'

export interface CrystalSpireFeatureSettings {
  /** World-anchored placement grid (blocks). */
  gridSize: number
  /** Chance that a grid cell holds a spire. */
  chance: number
  /** Spire height range above its root (blocks). */
  minHeight: number
  maxHeight: number
  /** Base radius range of the main prism (blocks). */
  minRadius: number
  maxRadius: number
  /** Largest horizontal drift per block of height (lean). */
  maxLean: number
  /** Satellite shard count range around the base. */
  minSatellites: number
  maxSatellites: number
  /** Highest Y a spire may reach (the Hell layer tops out at 127). */
  maxTopY: number
  /** Chance a spire cell is a vein of minable prism crystal. */
  prismVeinChance: number
  /** Decorrelates several spire features (giants vs. small spires). */
  salt: number
}

/** Longest satellite shard and its widest tilt from vertical (radians). */
const SATELLITE_MAX_LENGTH = 26
const SATELLITE_MAX_TILT = 0.75

/** Longest satellite of a spire of the given height (see buildSpire). */
function satelliteMaxLength(height: number): number {
  return Math.max(4, Math.min(SATELLITE_MAX_LENGTH, height * 0.45))
}

/**
 * Crystal spires - the towering landmarks of the Crystal Abyss: tall
 * faceted prisms of violet spire crystal (octagonal section, slight lean)
 * that blush to magenta rose crystal toward their pointed tips, ringed by
 * leaning satellite shards, with scattered veins of minable prism crystal.
 * Giants climb to the ceiling region (Y 127).
 *
 * Cross-chunk: world-anchored grid, every parameter hashed from the anchor,
 * biome-region veto over the whole reach (+ dither band), and a veto near
 * Prism Sanctums; each slice writes only its own cells.
 */
export class CrystalSpireFeature extends Feature {
  readonly settings: CrystalSpireFeatureSettings
  private readonly reach: number

  constructor(settings: CrystalSpireFeatureSettings) {
    super()
    this.settings = settings
    const s = settings
    const mainReach = s.maxRadius + s.maxLean * s.maxHeight
    const satelliteReach = s.maxRadius * 0.8 + 1 + Math.sin(SATELLITE_MAX_TILT) * satelliteMaxLength(s.maxHeight) + 2.5
    this.reach = Math.ceil(Math.max(mainReach, satelliteReach)) + 1
  }

  async scan(context: FeatureContext): Promise<void> {
    const b = getSubChunkBounds(context.chunk)
    const { gridSize, chance, salt } = this.settings
    const seed = context.config.seed
    const reach = this.reach

    forEachGridCell(b, gridSize, reach, (cellX, cellZ) => {
      if (hash2(seed, cellX, cellZ, salt) >= chance) return
      const ax = cellX + Math.floor(hash2(seed, cellX, cellZ, salt + 1) * gridSize)
      const az = cellZ + Math.floor(hash2(seed, cellX, cellZ, salt + 2) * gridSize)
      if (ax + reach < b.minX || ax - reach >= b.minX + CHUNK_SIZE_X) return
      if (az + reach < b.minZ || az - reach >= b.minZ + CHUNK_SIZE_Z) return
      if (!footprintInOwnBiome(context, ax, az, reach)) return
      if (isNearPrismSanctum(seed, ax, az, reach)) return
      this.buildSpire(context, b, ax, az, seed)
    })
  }

  private buildSpire(context: FeatureContext, b: SubChunkBounds, ax: number, az: number, seed: number): void {
    const s = this.settings
    const r = (k: number): number => hash2(seed, ax, az, s.salt + 10 + k)

    const ground = floorAt(context, ax, az)
    const baseY = ground - 3
    const topY = Math.min(s.maxTopY, Math.floor(baseY + s.minHeight + r(0) * (s.maxHeight - s.minHeight)))
    const height = topY - baseY
    if (height < 8) return
    const radius = s.minRadius + r(1) * (s.maxRadius - s.minRadius)
    const leanAngle = r(2) * Math.PI * 2
    const lean = r(3) * s.maxLean
    const leanX = Math.cos(leanAngle) * lean
    const leanZ = Math.sin(leanAngle) * lean
    const roseStart = 0.5 + r(4) * 0.25

    const material = (x: number, y: number, z: number, t: number): number => {
      if (hash3(seed, x, y, z, s.salt + 50) < s.prismVeinChance) return BlockIds.PRISM_CRYSTAL
      const dither = (hash3(seed, x, y, z, s.salt + 51) - 0.5) * 0.14
      return t + dither > roseStart ? BlockIds.ROSE_CRYSTAL : BlockIds.SPIRE_CRYSTAL
    }

    // Main prism: octagonal section, prism body tapering into a pointed tip
    const y0 = Math.max(baseY, b.minY)
    const y1 = Math.min(topY, b.maxY)
    for (let y = y0; y <= y1; y++) {
      const t = (y - baseY) / height
      const rad = radius * (1 - 0.2 * t) * Math.min(1, (1 - t) / 0.32)
      const cx = ax + 0.5 + leanX * (y - baseY)
      const cz = az + 0.5 + leanZ * (y - baseY)

      // Spine: the axis cell of this level and of the level below, so the
      // leaning tip stays face-connected all the way up
      const spineX = Math.floor(cx)
      const spineZ = Math.floor(cz)
      const belowX = Math.floor(cx - leanX)
      const belowZ = Math.floor(cz - leanZ)
      // (+ the elbow cell, in case the axis steps diagonally between levels)
      for (const [sx, sz] of [[spineX, spineZ], [belowX, belowZ], [spineX, belowZ]]) {
        if (sx < b.minX || sx >= b.minX + CHUNK_SIZE_X || sz < b.minZ || sz >= b.minZ + CHUNK_SIZE_Z) continue
        if (isOpenOrTerrain(getAt(b, sx, y, sz))) setAt(b, sx, y, sz, material(sx, y, sz, t))
      }

      if (rad < 0.35) continue
      const x0 = Math.max(b.minX, Math.floor(cx - rad))
      const x1 = Math.min(b.minX + CHUNK_SIZE_X - 1, Math.ceil(cx + rad))
      const z0 = Math.max(b.minZ, Math.floor(cz - rad))
      const z1 = Math.min(b.minZ + CHUNK_SIZE_Z - 1, Math.ceil(cz + rad))
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const dx = Math.abs(x + 0.5 - cx)
          const dz = Math.abs(z + 0.5 - cz)
          if (Math.max(dx, dz, (dx + dz) * 0.7071) > rad) continue
          if (!isOpenOrTerrain(getAt(b, x, y, z))) continue
          setAt(b, x, y, z, material(x, y, z, t))
        }
      }
    }

    // Satellite shards leaning out from the base
    const count = s.minSatellites + Math.floor(r(5) * (s.maxSatellites - s.minSatellites + 1))
    for (let i = 0; i < count; i++) {
      const phi = r(6) * Math.PI * 2 + (i * Math.PI * 2) / count + (r(20 + i) - 0.5) * 0.8
      const dist = radius * 0.75 + 0.5
      const sx = ax + 0.5 + Math.cos(phi) * dist
      const sz = az + 0.5 + Math.sin(phi) * dist
      const sy = floorAt(context, Math.floor(sx), Math.floor(sz)) - 1.5
      const tilt = 0.25 + r(30 + i) * (SATELLITE_MAX_TILT - 0.25)
      const dirX = Math.cos(phi) * Math.sin(tilt)
      const dirY = Math.cos(tilt)
      const dirZ = Math.sin(phi) * Math.sin(tilt)
      const length = Math.min(satelliteMaxLength(height), Math.max(4, height * (0.2 + r(40 + i) * 0.25)))
      const shardRadius = 0.9 + r(50 + i) * 1.3
      if (sy - shardRadius > b.maxY || sy + length + shardRadius < b.minY) continue
      rasterizeShard(b, sx, sy, sz, dirX, dirY, dirZ, length, shardRadius, 0.45, (x, y, z, along) =>
        material(x, y, z, roseStart - 0.25 + along * 0.6)
      )
    }
  }
}
