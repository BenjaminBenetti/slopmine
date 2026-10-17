import { Feature, type FeatureContext } from '../Feature.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { hash2 } from './ossuaryHash.ts'
import { SliceWriter } from './SliceWriter.ts'

/**
 * Settings for the Ossuary's surface scatter (per-column chances).
 */
export interface OssuaryScatterFeatureSettings {
  /** Soul bloom chance inside bloom patches / elsewhere. */
  readonly bloomPatchChance: number
  readonly bloomChance: number
  /** Patch noise threshold (2D simplex, scale `patchScale`). */
  readonly patchThreshold: number
  readonly patchScale: number
  /** Bone pile chance per ash column. */
  readonly bonePileChance: number
  /** Chance of a half-buried bone (1-2 bone blocks) poking out of the ash. */
  readonly buriedBoneChance: number
}

const SCATTER_SALT = 7400

/**
 * Soul blooms in glowing patches, bone piles and half-buried bones on the
 * Ossuary's bone ash. Per column: only where the pre-feature surface is
 * still bone ash with air above (fossils, spires and the Catacombs keep
 * their cells), and only when both cells lie in this sub-chunk so the slice
 * owning the surface decides alone.
 */
export class OssuaryScatterFeature extends Feature {
  readonly settings: OssuaryScatterFeatureSettings

  constructor(settings: OssuaryScatterFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, noise, config } = context
    const seed = config.seed
    const s = this.settings
    const out = new SliceWriter(chunk)

    for (let z = out.minZ; z <= out.maxZ; z++) {
      for (let x = out.minX; x <= out.maxX; x++) {
        const ground = getBaseHeightAt(x, z)
        if (ground < out.minY || ground + 2 > out.maxY) continue
        if (out.get(x, ground, z) !== BlockIds.BONE_ASH) continue
        if (out.get(x, ground + 1, z) !== BlockIds.AIR) continue

        const roll = hash2(x, z, SCATTER_SALT, seed)
        const inPatch = noise.noise2D(x * s.patchScale + 311.7, z * s.patchScale - 197.3) > s.patchThreshold
        const bloom = inPatch ? s.bloomPatchChance : s.bloomChance
        if (roll < bloom) {
          out.set(x, ground + 1, z, BlockIds.SOUL_BLOOM)
        } else if (roll < bloom + s.bonePileChance) {
          out.set(x, ground + 1, z, BlockIds.BONE_PILE)
        } else if (roll < bloom + s.bonePileChance + s.buriedBoneChance) {
          out.set(x, ground + 1, z, BlockIds.BONE_BLOCK)
          if (hash2(x, z, SCATTER_SALT + 1, seed) < 0.4 && out.get(x, ground + 2, z) === BlockIds.AIR) {
            out.set(x, ground + 2, z, BlockIds.BONE_BLOCK)
          }
        }
      }
    }
  }
}
