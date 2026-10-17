import { Feature, type FeatureContext } from '../Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../../interfaces/IChunk.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { emberHash01 } from './emberHash.ts'
import { SubChunkWindow } from './FungusShape.ts'

/**
 * Settings for the Ember Grove floor cover (serializable).
 */
export interface EmberFloorFeatureSettings {
  /** Noise frequency of glowcap patches. */
  glowcapPatchScale: number
  /** Patch noise above which glowcaps grow (higher = fewer, smaller patches). */
  glowcapPatchThreshold: number
  /** Chance per column inside a patch. */
  glowcapDensity: number
  /** Chance per column of a lone glowcap outside patches. */
  glowcapScatter: number
  /** Noise frequency / threshold of crimson sprout meadows. */
  sproutPatchScale: number
  sproutPatchThreshold: number
  /** Chance per column inside a sprout meadow. */
  sproutDensity: number
}

/**
 * Ember Grove floor cover: glowcap patches (the forest floor's light) and
 * crimson sprout meadows on crimson mycelium. Strictly column-local - every
 * write lands in the column being generated - so it needs no cross-chunk
 * handling. Runs after the fungi (stems claim their cells first).
 */
export class EmberFloorFeature extends Feature {
  readonly settings: EmberFloorFeatureSettings

  constructor(settings: EmberFloorFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, noise, config } = context
    const s = this.settings
    const seed = config.seed
    const win = new SubChunkWindow(chunk)
    if (win.minY >= 128) return

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const x = win.chunkX + lx
        const z = win.chunkZ + lz
        const ground = getBaseHeightAt(x, z)
        const y = ground + 1
        if (y < win.minY || y > win.maxY) continue
        if (win.get(x, y, z) !== BlockIds.AIR) continue
        // Only on mycelium (skips dithered foreign ground and structures).
        // When the ground cell is in the sub-chunk below, trust the column.
        if (ground >= win.minY && win.get(x, ground, z) !== BlockIds.CRIMSON_MYCELIUM) continue

        const roll = emberHash01(x, z, 7001, seed)
        const glowPatch = noise.noise2D(x * s.glowcapPatchScale + 311.7, z * s.glowcapPatchScale - 97.3)
        if ((glowPatch > s.glowcapPatchThreshold && roll < s.glowcapDensity) || roll > 1 - s.glowcapScatter) {
          win.set(x, y, z, BlockIds.GLOWCAP)
          continue
        }
        const sproutPatch = noise.noise2D(x * s.sproutPatchScale - 517.1, z * s.sproutPatchScale + 233.9)
        if (sproutPatch > s.sproutPatchThreshold && emberHash01(x, z, 7002, seed) < s.sproutDensity) {
          win.set(x, y, z, BlockIds.CRIMSON_SPROUTS)
        }
      }
    }
  }
}
