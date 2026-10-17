import { Feature, type FeatureContext } from '../Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../../interfaces/IChunk.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { hash2 } from '../../crystal/CrystalAbyssShape.ts'
import { floorAt, getAt, getSubChunkBounds, setAt } from './CrystalFeatureUtils.ts'

export interface CrystalScatterFeatureSettings {
  /** Chance per floor column of a prism cluster sprite. */
  clusterChance: number
  /** Chance per floor column of a small crystal outcrop (2-4 tall). */
  outcropChance: number
  salt: number
}

const isFloor = (id: number): boolean =>
  id === BlockIds.ABYSSAL_STONE || id === BlockIds.GLITTERING_ABYSSAL_STONE

/**
 * Glitter on the Crystal Abyss floor: single-column decorations (prism
 * cluster sprites, small crystal outcrops) on bare abyssal floor. Runs after
 * the landmark features; every decision reads only cells of this sub-chunk
 * (ground and air above must both lie in it), so slices always agree.
 */
export class CrystalScatterFeature extends Feature {
  readonly settings: CrystalScatterFeatureSettings

  constructor(settings: CrystalScatterFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const b = getSubChunkBounds(context.chunk)
    const { clusterChance, outcropChance, salt } = this.settings
    const seed = context.config.seed

    for (let z = b.minZ; z < b.minZ + CHUNK_SIZE_Z; z++) {
      for (let x = b.minX; x < b.minX + CHUNK_SIZE_X; x++) {
        const roll = hash2(seed, x, z, salt)
        if (roll >= clusterChance + outcropChance) continue
        const h = floorAt(context, x, z)
        if (h < b.minY || h + 1 > b.maxY) continue
        if (!isFloor(getAt(b, x, h, z))) continue
        if (getAt(b, x, h + 1, z) !== BlockIds.AIR) continue

        if (roll < outcropChance) {
          // Small outcrop: a short crystal column capped by a cluster
          const height = 2 + Math.floor(hash2(seed, x, z, salt + 1) * 3)
          const rose = hash2(seed, x, z, salt + 2) < 0.35
          let y = h + 1
          for (; y <= h + height && y <= b.maxY; y++) {
            if (getAt(b, x, y, z) !== BlockIds.AIR) break
            const top = y === h + height
            setAt(b, x, y, z, top && rose ? BlockIds.ROSE_CRYSTAL : y === h + 1 ? BlockIds.PRISM_CRYSTAL : BlockIds.SPIRE_CRYSTAL)
          }
          if (y <= b.maxY && y === h + height + 1 && getAt(b, x, y, z) === BlockIds.AIR) {
            setAt(b, x, y, z, BlockIds.PRISM_CLUSTER)
          }
        } else {
          setAt(b, x, h + 1, z, BlockIds.PRISM_CLUSTER)
        }
      }
    }
  }
}
