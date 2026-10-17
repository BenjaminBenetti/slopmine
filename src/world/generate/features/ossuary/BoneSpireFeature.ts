import { Feature, type FeatureContext } from '../Feature.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { forEachGridAnchor, hash2, hash3, isFootprintInBiome } from './ossuaryHash.ts'
import { isNearCatacombsPrecinct } from './CatacombsSite.ts'
import { SliceWriter } from './SliceWriter.ts'

/**
 * Settings for the Ossuary's bone spires.
 *
 * Placement: one candidate per world-anchored `gridSize` cell, kept with
 * probability `chance` (expected per 512² region = (512 / gridSize)² × chance),
 * vetoed near foreign biome regions and Catacombs precincts.
 */
export interface BoneSpireFeatureSettings {
  readonly gridSize: number
  readonly chance: number
  /** Share of spires that grow all the way to the layer ceiling (Y 127). */
  readonly columnShare: number
  /** Share of free-standing spikes crowned with a soul lantern. */
  readonly lanternShare: number
  /** Chance a core (ossified rock) cell is a soul vein. */
  readonly veinChance: number
}

const SPIRE_SALT = 7300
/** Base radius is at most 4, plus up to 2 blocks of lean. */
const SPIRE_REACH = 7
const CEILING_Y = 127

const BONE = BlockIds.BONE_BLOCK
const ROCK = BlockIds.OSSIFIED_ROCK
const VEIN = BlockIds.SOUL_VEIN
const LANTERN = BlockIds.SOUL_LANTERN

/**
 * Bone spires: tapering, vertebra-banded spikes of bone rising from the ash
 * toward the cavern ceiling, some joining it as hourglass columns, many
 * crowned with soul lanterns - the green beacons that make the Ossuary
 * readable from afar. Bone shell, ossified-rock core with soul veins, and a
 * notched joint every 6 blocks.
 */
export class BoneSpireFeature extends Feature {
  readonly settings: BoneSpireFeatureSettings

  constructor(settings: BoneSpireFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, getBiomeNameAt, biomeProperties, config } = context
    const seed = config.seed
    const out = new SliceWriter(chunk)
    const owner = biomeProperties.name
    const { gridSize, chance, columnShare, lanternShare, veinChance } = this.settings

    forEachGridAnchor(
      out.minX, out.maxX, out.minZ, out.maxZ,
      gridSize, SPIRE_REACH, chance, SPIRE_REACH, SPIRE_SALT, seed,
      (x, z, cellX, cellZ) => {
        if (getBiomeNameAt && !isFootprintInBiome(getBiomeNameAt, owner, x, z, SPIRE_REACH)) return
        if (isNearCatacombsPrecinct(x, z, SPIRE_REACH + 26, seed, getBaseHeightAt)) return
        const h = (salt: number) => hash2(cellX, cellZ, SPIRE_SALT + 10 + salt, seed)

        const base = getBaseHeightAt(x, z)
        const r0 = 2 + Math.floor(h(0) * 2.99) // 2-4
        const column = h(1) < columnShare
        const top = column ? CEILING_Y : Math.min(CEILING_Y - 3, base + 26 + Math.floor(h(2) * 48))
        if (top <= base + 6) return
        const leanX = column ? 0 : (h(3) - 0.5) * 4
        const leanZ = column ? 0 : (h(4) - 0.5) * 4
        const crowned = !column && h(5) < lanternShare
        const bottom = base - 2
        const yTop = crowned ? top + 1 : top
        if (!out.overlaps(x - SPIRE_REACH, x + SPIRE_REACH, bottom, yTop, z - SPIRE_REACH, z + SPIRE_REACH)) return

        const span = top - base
        const centerAt = (y: number): [number, number] => {
          const t = Math.max(0, (y - base) / span)
          return [Math.round(x + leanX * t * t), Math.round(z + leanZ * t * t)]
        }
        const y0 = Math.max(bottom, out.minY)
        const y1 = Math.min(top, out.maxY)
        for (let y = y0; y <= y1; y++) {
          const t = Math.max(0, (y - base) / span)
          const radius = column
            ? r0 * (0.35 + 0.65 * ((1 - t) ** 2 + t ** 4))
            : r0 * (1 - t) ** 1.2 + 0.3
          const joint = (((y - base) % 6) + 6) % 6 === 0 && y > base
          const r = joint ? Math.max(0.3, radius - 1) : radius
          const cx = x + leanX * t * t
          const cz = z + leanZ * t * t
          const ri = Math.ceil(r)
          const icx = Math.round(cx)
          const icz = Math.round(cz)
          for (let dz = -ri; dz <= ri; dz++) {
            for (let dx = -ri; dx <= ri; dx++) {
              const wx = icx + dx
              const wz = icz + dz
              const ddx = wx - cx
              const ddz = wz - cz
              const d2 = ddx * ddx + ddz * ddz
              if (d2 > r * r && !(dx === 0 && dz === 0)) continue
              const core = r > 1.1 && d2 <= (r - 1.1) * (r - 1.1)
              // Bone shell (the joint rings are just notches in it), ossified
              // rock core threaded with soul veins
              let id = BONE
              if (core) id = hash3(wx, y, wz, SPIRE_SALT + 50, seed) < veinChance ? VEIN : ROCK
              out.set(wx, y, wz, id)
            }
          }
          // A thin, leaning tip shifts its centre between layers: bridge to
          // the layer below so the spike stays face-connected
          if (ri <= 1 && y > bottom) {
            const [px, pz] = centerAt(y - 1)
            if (px !== icx || pz !== icz) {
              out.set(px, y, pz, BONE)
              if (px !== icx && pz !== icz) out.set(icx, y, pz, BONE)
            }
          }
        }

        if (crowned) {
          const [tx, tz] = centerAt(top)
          out.set(tx, top + 1, tz, LANTERN)
        }
      }
    )
  }
}
