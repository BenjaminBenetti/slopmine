import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import { cocytusHash, cocytusSurfaceY } from '../cocytus/CocytusTerrain.ts'

/**
 * Settings for frost crystal clusters (Cocytus' cold light).
 */
export interface FrostCrystalFeatureSettings {
  /** Base chance per surface column. */
  chance: number
  /** Multiplier where the low-frequency "glow field" is strong (crystals gather in glades). */
  gladeBoost: number
}

/**
 * Glowing frost crystal clusters on the ice and shores of Cocytus. Each
 * column rolls independently (seeded hash × a low-frequency glade field), so
 * there is no cross-chunk state: a crystal sits on the column's predicted
 * surface (cocytusSurfaceY) when that cell is still open air - spires,
 * crags, drifts and the citadel keep theirs.
 */
export class FrostCrystalFeature extends Feature {
  readonly settings: FrostCrystalFeatureSettings

  constructor(settings: FrostCrystalFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, noise, config } = context
    const seed = config.seed
    const coord = chunk.coordinate
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const minY = subY * SUB_CHUNK_HEIGHT
    const maxY = minY + SUB_CHUNK_HEIGHT - 1
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = chunkWorldX + lx
        const wz = chunkWorldZ + lz
        const roll = cocytusHash(seed, wx, wz, 801)
        if (roll >= this.settings.chance * this.settings.gladeBoost) continue
        const glade = noise.noise2D(wx * 0.013 - 41.7, wz * 0.013 + 63.2)
        const chance = this.settings.chance * (glade > 0.35 ? this.settings.gladeBoost : 0.5)
        if (roll >= chance) continue
        const y = cocytusSurfaceY(noise, seed, wx, wz, getBaseHeightAt(wx, wz)) + 1
        if (y < minY || y > maxY) continue
        if (chunk.getBlockId(lx, y - minY, lz) !== BlockIds.AIR) continue
        // Needs solid support when the cell below is in this sub-chunk
        if (y - 1 >= minY && chunk.getBlockId(lx, y - 1 - minY, lz) === BlockIds.AIR) continue
        chunk.setBlockId(lx, y - minY, lz, BlockIds.FROST_CRYSTAL)
      }
    }
  }
}
