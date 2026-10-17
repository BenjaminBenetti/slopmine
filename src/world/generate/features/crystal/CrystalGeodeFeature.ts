import { Feature, type FeatureContext } from '../Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../../interfaces/IChunk.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { hash2, hash3 } from '../../crystal/CrystalAbyssShape.ts'
import { isNearPrismSanctum } from '../../dungeons/kits/crystal/PrismSanctumSite.ts'
import {
  floorAt, footprintInOwnBiome, forEachGridCell, getAt, getSubChunkBounds, isOpenOrTerrain, setAt,
  type SubChunkBounds,
} from './CrystalFeatureUtils.ts'

export interface CrystalGeodeFeatureSettings {
  /** World-anchored placement grid (blocks). */
  gridSize: number
  /** Chance that a grid cell holds a geode. */
  chance: number
  /** Outer radius range (blocks). */
  minRadius: number
  maxRadius: number
  /** Chance a geode is buried deep instead of half-sunk at the surface. */
  buriedChance: number
  /** Chance a surface geode is cracked open. */
  crackChance: number
  /** Chance a lining cell is minable prism crystal (else spire crystal). */
  prismLiningChance: number
  salt: number
}

/** Vertical squash of the geode ellipsoid. */
const Y_SQUASH = 1.15

const OUTSIDE = 0
const CRUST = 1
const LINING = 2
const HOLLOW = 3
const CRACK = 4

/**
 * Crystal geodes: hollow ellipsoids with a pale calcite crust, a glowing
 * crystal lining (spire crystal with veins of minable prism crystal) and
 * shard clusters growing from the inner floor and roof. Surface geodes sit
 * half-sunk in the floor as pale domes - some cracked open, spilling light -
 * while buried ones wait in chasm walls and mine shafts.
 */
export class CrystalGeodeFeature extends Feature {
  readonly settings: CrystalGeodeFeatureSettings

  constructor(settings: CrystalGeodeFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const b = getSubChunkBounds(context.chunk)
    const { gridSize, chance, salt, maxRadius } = this.settings
    const seed = context.config.seed
    const reach = Math.ceil(maxRadius) + 1

    forEachGridCell(b, gridSize, reach, (cellX, cellZ) => {
      if (hash2(seed, cellX, cellZ, salt) >= chance) return
      const ax = cellX + Math.floor(hash2(seed, cellX, cellZ, salt + 1) * gridSize)
      const az = cellZ + Math.floor(hash2(seed, cellX, cellZ, salt + 2) * gridSize)
      if (ax + reach < b.minX || ax - reach >= b.minX + CHUNK_SIZE_X) return
      if (az + reach < b.minZ || az - reach >= b.minZ + CHUNK_SIZE_Z) return
      if (!footprintInOwnBiome(context, ax, az, reach)) return
      if (isNearPrismSanctum(seed, ax, az, reach)) return
      this.buildGeode(context, b, ax, az, seed)
    })
  }

  private buildGeode(context: FeatureContext, b: SubChunkBounds, ax: number, az: number, seed: number): void {
    const s = this.settings
    const r = (k: number): number => hash2(seed, ax, az, s.salt + 10 + k)
    const radius = s.minRadius + r(0) * (s.maxRadius - s.minRadius)
    const ground = floorAt(context, ax, az)
    const buried = r(1) < s.buriedChance && ground - 2 * radius - 14 > 6
    const cx = ax + 0.5
    const cz = az + 0.5
    const cy = buried
      ? 8 + radius + Math.floor(r(2) * (ground - 2 * radius - 14))
      : ground - radius * 0.35
    const cracked = !buried && r(3) < s.crackChance
    const crackAz = r(4) * Math.PI * 2
    const crackEl = 0.25 + r(5) * 0.45
    const crackX = Math.cos(crackEl) * Math.cos(crackAz)
    const crackY = Math.sin(crackEl)
    const crackZ = Math.cos(crackEl) * Math.sin(crackAz)

    const layer = (x: number, y: number, z: number): number => {
      const dx = x + 0.5 - cx
      const dy = (y + 0.5 - cy) * Y_SQUASH
      const dz = z + 0.5 - cz
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d > radius) return OUTSIDE
      if (cracked && d > radius - 2.6 && d > 0) {
        if ((dx * crackX + dy * crackY + dz * crackZ) / d > 0.72) return CRACK
      }
      if (d > radius - 1.3) return CRUST
      if (d > radius - 2.4) return LINING
      return HOLLOW
    }

    const ext = Math.ceil(radius) + 1
    const extY = Math.ceil(radius / Y_SQUASH) + 1
    const x0 = Math.max(b.minX, Math.floor(cx) - ext)
    const x1 = Math.min(b.minX + CHUNK_SIZE_X - 1, Math.floor(cx) + ext)
    const z0 = Math.max(b.minZ, Math.floor(cz) - ext)
    const z1 = Math.min(b.minZ + CHUNK_SIZE_Z - 1, Math.floor(cz) + ext)
    const y0 = Math.max(b.minY, Math.floor(cy) - extY)
    const y1 = Math.min(b.maxY, Math.floor(cy) + extY)

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const kind = layer(x, y, z)
          if (kind === OUTSIDE) continue
          const current = getAt(b, x, y, z)
          if (!isOpenOrTerrain(current)) continue
          if (kind === CRUST) {
            setAt(b, x, y, z, BlockIds.GEODE_CRUST)
          } else if (kind === LINING) {
            const prism = hash3(seed, x, y, z, s.salt + 60) < s.prismLiningChance
            setAt(b, x, y, z, prism ? BlockIds.PRISM_CRYSTAL : BlockIds.SPIRE_CRYSTAL)
          } else if (kind === CRACK) {
            // The crack only opens what was terrain; above-ground cells stay air
            if (current !== BlockIds.AIR) setAt(b, x, y, z, BlockIds.AIR)
          } else {
            // Hollow: clusters grow from the lining below / hang from the lining above
            let id: number = BlockIds.AIR
            if (layer(x, y - 1, z) === LINING && hash3(seed, x, y, z, s.salt + 61) < 0.45) {
              id = BlockIds.PRISM_CLUSTER
            } else if (layer(x, y + 1, z) === LINING && hash3(seed, x, y, z, s.salt + 62) < 0.3) {
              id = BlockIds.HANGING_PRISM_CLUSTER
            }
            if (current !== id) setAt(b, x, y, z, id)
          }
        }
      }
    }
  }
}
