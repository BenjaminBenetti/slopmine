import { Feature, type FeatureContext } from '../Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../../interfaces/IChunk.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { hash2, hash3 } from '../../crystal/CrystalAbyssShape.ts'
import { isNearPrismSanctum } from '../../dungeons/kits/crystal/PrismSanctumSite.ts'
import {
  footprintInOwnBiome, forEachGridCell, getAt, getSubChunkBounds, rasterizeShard, setAt,
  type SubChunkBounds,
} from './CrystalFeatureUtils.ts'

export interface AbyssIslandFeatureSettings {
  /** World-anchored placement grid (blocks). */
  gridSize: number
  /** Chance that a grid cell holds an island. */
  chance: number
  /** Range of the island's top surface (Y). Keep top + crystals below 128. */
  minTopY: number
  maxTopY: number
  /** Radius range of the island top (blocks). */
  minRadius: number
  maxRadius: number
  salt: number
}

const isAir = (id: number): boolean => id === BlockIds.AIR

/**
 * Floating abyssal rock islands drifting in the open air of the Crystal
 * Abyss: lobed, domed tops of abyssal stone tapering into a rounded
 * underside studded with glowing prism crystal, hanging shard clusters and
 * a crystal stalactite; a few crystal shards crown the top. Islands only
 * ever fill air.
 */
export class AbyssIslandFeature extends Feature {
  readonly settings: AbyssIslandFeatureSettings

  constructor(settings: AbyssIslandFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const b = getSubChunkBounds(context.chunk)
    const { gridSize, chance, salt, maxRadius, minTopY } = this.settings
    if (b.maxY < minTopY - maxRadius * 2.2 - 12) return // islands live high in the cavern
    const seed = context.config.seed
    const reach = Math.ceil(maxRadius * 1.25) + 2

    forEachGridCell(b, gridSize, reach, (cellX, cellZ) => {
      if (hash2(seed, cellX, cellZ, salt) >= chance) return
      const ax = cellX + Math.floor(hash2(seed, cellX, cellZ, salt + 1) * gridSize)
      const az = cellZ + Math.floor(hash2(seed, cellX, cellZ, salt + 2) * gridSize)
      if (ax + reach < b.minX || ax - reach >= b.minX + CHUNK_SIZE_X) return
      if (az + reach < b.minZ || az - reach >= b.minZ + CHUNK_SIZE_Z) return
      if (!footprintInOwnBiome(context, ax, az, reach)) return
      if (isNearPrismSanctum(seed, ax, az, reach)) return
      this.buildIsland(b, ax, az, seed)
    })
  }

  private buildIsland(b: SubChunkBounds, ax: number, az: number, seed: number): void {
    const s = this.settings
    const r = (k: number): number => hash2(seed, ax, az, s.salt + 10 + k)
    const topY = s.minTopY + Math.floor(r(0) * (s.maxTopY - s.minTopY + 1))
    const radius = s.minRadius + r(1) * (s.maxRadius - s.minRadius)
    const depth = radius * 0.9 + r(2) * 5
    const phase1 = r(3) * Math.PI * 2
    const phase2 = r(4) * Math.PI * 2
    const cx = ax + 0.5
    const cz = az + 0.5

    /** Island column at (x, z): [bottom, top] or null outside the outline. */
    const column = (x: number, z: number): [number, number] | null => {
      const dx = x + 0.5 - cx
      const dz = z + 0.5 - cz
      const rho = Math.sqrt(dx * dx + dz * dz)
      const theta = Math.atan2(dz, dx)
      const outline = radius * (0.84 + 0.12 * Math.sin(3 * theta + phase1) + 0.06 * Math.sin(5 * theta + phase2))
      if (rho > outline) return null
      const u = rho / outline
      const top = topY + Math.round(1.5 * (1 - u * u))
      const bottom = topY - Math.round(depth * Math.pow(Math.max(0, 1 - u * u), 0.7))
      return [bottom, top]
    }

    const ext = Math.ceil(radius) + 1
    const x0 = Math.max(b.minX, Math.floor(cx) - ext)
    const x1 = Math.min(b.minX + CHUNK_SIZE_X - 1, Math.floor(cx) + ext)
    const z0 = Math.max(b.minZ, Math.floor(cz) - ext)
    const z1 = Math.min(b.minZ + CHUNK_SIZE_Z - 1, Math.floor(cz) + ext)

    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const col = column(x, z)
        if (!col) continue
        const [bottom, top] = col
        const ya = Math.max(b.minY, bottom - 1)
        const yb = Math.min(b.maxY, top)
        for (let y = ya; y <= yb; y++) {
          if (!isAir(getAt(b, x, y, z))) continue
          let id: number
          if (y === bottom - 1) {
            // Shard clusters hang from the underside
            if (hash2(seed, x, z, s.salt + 70) >= 0.16) continue
            id = BlockIds.HANGING_PRISM_CLUSTER
          } else if (y === top) {
            id = hash3(seed, x, y, z, s.salt + 71) < 0.4 ? BlockIds.GLITTERING_ABYSSAL_STONE : BlockIds.ABYSSAL_STONE
          } else if (y === bottom && hash3(seed, x, y, z, s.salt + 72) < 0.14) {
            id = BlockIds.PRISM_CRYSTAL // glowing spots on the underside
          } else {
            id = BlockIds.ABYSSAL_STONE
          }
          setAt(b, x, y, z, id)
        }
      }
    }

    // A crystal stalactite under the center
    const centerCol = column(Math.floor(cx), Math.floor(cz))
    if (centerCol) {
      const length = depth * (0.6 + r(5) * 0.5)
      rasterizeShard(b, cx, centerCol[0] + 2, cz, 0, -1, 0, length + 2, 1.7, 0.6,
        (x, y, z, along) => (along > 0.55 || hash3(seed, x, y, z, s.salt + 73) < 0.2 ? BlockIds.PRISM_CRYSTAL : BlockIds.SPIRE_CRYSTAL),
        (id) => id === BlockIds.AIR || id === BlockIds.ABYSSAL_STONE || id === BlockIds.HANGING_PRISM_CLUSTER)
    }

    // Crystal shards crowning the top
    const shards = 1 + Math.floor(r(6) * 3)
    for (let i = 0; i < shards; i++) {
      const phi = r(10 + i) * Math.PI * 2
      const dist = r(20 + i) * radius * 0.45
      const sx = cx + Math.cos(phi) * dist
      const sz = cz + Math.sin(phi) * dist
      const col = column(Math.floor(sx), Math.floor(sz))
      if (!col) continue
      const tilt = r(30 + i) * 0.35
      const dirAz = r(40 + i) * Math.PI * 2
      const length = 4 + r(50 + i) * 6
      const rad = 0.8 + r(60 + i) * 0.7
      const rose = r(70 + i) < 0.5
      rasterizeShard(b, sx, col[1] - 0.5, sz,
        Math.cos(dirAz) * Math.sin(tilt), Math.cos(tilt), Math.sin(dirAz) * Math.sin(tilt),
        length, rad, 0.5,
        (_x, _y, _z, along) => (along > 0.6 && rose ? BlockIds.ROSE_CRYSTAL : BlockIds.SPIRE_CRYSTAL),
        isAir)
    }
  }
}
