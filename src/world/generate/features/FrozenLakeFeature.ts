import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import {
  COCYTUS_BIOME,
  LAKE_LEVEL,
  MAX_RIDGE_HEIGHT,
  cocytusHash,
  ridgeHeightAt,
  isIceDriftAt,
} from '../cocytus/CocytusTerrain.ts'

/**
 * Settings for the Cocytus frozen lake.
 */
export interface FrozenLakeFeatureSettings {
  /** World-anchored grid for figures lying face-up in the ice surface. */
  lyingFigureGrid: number
  /** Chance per grid cell of a lying figure (expected per chunk = 1024/grid² × chance). */
  lyingFigureChance: number
  /** World-anchored grid for "sinner pillars": standing figures frozen in black-ice posts on the lake. */
  pillarGrid: number
  /** Chance per grid cell of a group of sinner pillars. */
  pillarChance: number
  /** World-anchored grid for standing figures frozen inside pressure ridges. */
  ridgeFigureGrid: number
  /** Chance per grid cell of a ridge figure (where the ridge is tall enough). */
  ridgeFigureChance: number
}

/** Offsets of the 1-3 pillars of a sinner-pillar group, around the group anchor. */
const PILLAR_GROUP_OFFSETS: ReadonlyArray<readonly [number, number]> = [[0, 0], [3, 1], [-2, 3]]
/** Pillar groups reach this far from their anchor (offsets + rubble). */
const PILLAR_REACH = 5

/**
 * The frozen lake of Cocytus: black ice fills every column whose base
 * terrain lies below LAKE_LEVEL (like the lava sea in the Molten Wastes),
 * then decorates the ice:
 * - pressure ridges: jagged lines of buckled black ice (pale glacial ice
 *   shards on the taller crests), see ridgeHeightAt;
 * - thin ash-snow drifts on the flat ice;
 * - entombed figures: lying face-up just under the surface (two blocks,
 *   head toward +Z), standing inside tall ridges, and "sinner pillars" -
 *   lone black-ice posts on the lake with a standing figure in each.
 *
 * Runs per sub-chunk for the primary biome only. Every decision is a pure
 * function of world coordinates (world-anchored grids, seeded hashes, the
 * shared CocytusTerrain shape functions), so the slices of a figure or a
 * ridge in neighbouring chunks always agree.
 */
export class FrozenLakeFeature extends Feature {
  readonly settings: FrozenLakeFeatureSettings

  constructor(settings: FrozenLakeFeatureSettings) {
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
    // The lake (bed up to the tallest pillar) spans at most Y 0..LAKE_LEVEL+4
    if (minY > LAKE_LEVEL + MAX_RIDGE_HEIGHT + 4) return

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    const set = (wx: number, wy: number, wz: number, id: number, onlyAir: boolean): void => {
      if (wy < minY || wy > maxY) return
      const lx = wx - chunkWorldX
      const lz = wz - chunkWorldZ
      if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) return
      const ly = wy - minY
      if (onlyAir && chunk.getBlockId(lx, ly, lz) !== BlockIds.AIR) return
      chunk.setBlockId(lx, ly, lz, id)
    }

    // --- 1. Ice fill, ridges and drifts, column by column ---
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = chunkWorldX + lx
        const wz = chunkWorldZ + lz
        const h = getBaseHeightAt(wx, wz)
        if (h >= LAKE_LEVEL) continue

        for (let y = Math.max(h + 1, minY); y <= Math.min(LAKE_LEVEL, maxY); y++) {
          if (chunk.getBlockId(lx, y - minY, lz) === BlockIds.AIR) chunk.setBlockId(lx, y - minY, lz, BlockIds.BLACK_ICE)
        }

        const ridge = ridgeHeightAt(noise, seed, wx, wz)
        if (ridge > 0) {
          for (let dy = 1; dy <= ridge; dy++) {
            // Pale glacial-ice shards crown the taller crests
            const crest = dy === ridge && ridge >= 2 && cocytusHash(seed, wx, wz, 17) < 0.35
            set(wx, LAKE_LEVEL + dy, wz, crest ? BlockIds.GLACIAL_ICE : BlockIds.BLACK_ICE, true)
          }
        } else if (isIceDriftAt(noise, wx, wz)) {
          set(wx, LAKE_LEVEL + 1, wz, BlockIds.ASH_SNOW, true)
        }
      }
    }

    const isFlatIce = (wx: number, wz: number): boolean =>
      getBaseHeightAt(wx, wz) <= LAKE_LEVEL - 2 &&
      ridgeHeightAt(noise, seed, wx, wz) === 0 &&
      !isIceDriftAt(noise, wx, wz)

    // --- 2. Figures lying face-up in the ice surface (head at +Z) ---
    {
      const g = this.settings.lyingFigureGrid
      if (LAKE_LEVEL >= minY && LAKE_LEVEL <= maxY) {
        for (const [gx, gz] of gridCells(chunkWorldX, chunkWorldZ, g, 1)) {
          if (cocytusHash(seed, gx, gz, 101) >= this.settings.lyingFigureChance) continue
          const fx = gx + Math.floor(cocytusHash(seed, gx, gz, 102) * g)
          const fz = gz + Math.floor(cocytusHash(seed, gx, gz, 103) * (g - 1))
          if (!isFlatIce(fx, fz) || !isFlatIce(fx, fz + 1)) continue
          // Both halves must lie in Cocytus (only Cocytus chunks run this)
          if (context.getBiomeNameAt &&
            (context.getBiomeNameAt(fx, fz) !== COCYTUS_BIOME || context.getBiomeNameAt(fx, fz + 1) !== COCYTUS_BIOME)) continue
          set(fx, LAKE_LEVEL, fz, BlockIds.ENTOMBED_LYING_FEET, false)
          set(fx, LAKE_LEVEL, fz + 1, BlockIds.ENTOMBED_LYING_HEAD, false)
        }
      }
    }

    // --- 3. Standing figures inside tall pressure ridges ---
    {
      const g = this.settings.ridgeFigureGrid
      for (const [gx, gz] of gridCells(chunkWorldX, chunkWorldZ, g, 0)) {
        if (cocytusHash(seed, gx, gz, 201) >= this.settings.ridgeFigureChance) continue
        // Search the cell for its tallest ridge column (deterministic scan order)
        let bestX = 0, bestZ = 0, best = 0
        for (let i = 0; i < 6; i++) {
          const cx = gx + Math.floor(cocytusHash(seed, gx, gz, 210 + i) * g)
          const cz = gz + Math.floor(cocytusHash(seed, gx, gz, 220 + i) * g)
          if (getBaseHeightAt(cx, cz) >= LAKE_LEVEL) continue
          const r = ridgeHeightAt(noise, seed, cx, cz)
          if (r > best) { best = r; bestX = cx; bestZ = cz }
        }
        if (best < 2) continue
        set(bestX, LAKE_LEVEL + 1, bestZ, BlockIds.ENTOMBED_UPRIGHT_LOWER, false)
        set(bestX, LAKE_LEVEL + 2, bestZ, BlockIds.ENTOMBED_UPRIGHT_UPPER, false)
      }
    }

    // --- 4. Sinner pillars: lone black-ice posts holding a standing figure ---
    {
      const g = this.settings.pillarGrid
      for (const [gx, gz] of gridCells(chunkWorldX, chunkWorldZ, g, PILLAR_REACH)) {
        if (cocytusHash(seed, gx, gz, 301) >= this.settings.pillarChance) continue
        const ax = gx + PILLAR_REACH + Math.floor(cocytusHash(seed, gx, gz, 302) * Math.max(1, g - 2 * PILLAR_REACH))
        const az = gz + PILLAR_REACH + Math.floor(cocytusHash(seed, gx, gz, 303) * Math.max(1, g - 2 * PILLAR_REACH))
        const count = 1 + Math.floor(cocytusHash(seed, gx, gz, 304) * PILLAR_GROUP_OFFSETS.length)
        for (let i = 0; i < count; i++) {
          const px = ax + PILLAR_GROUP_OFFSETS[i][0]
          const pz = az + PILLAR_GROUP_OFFSETS[i][1]
          if (getBaseHeightAt(px, pz) > LAKE_LEVEL - 2 || ridgeHeightAt(noise, seed, px, pz) > 0) continue
          set(px, LAKE_LEVEL + 1, pz, BlockIds.ENTOMBED_UPRIGHT_LOWER, false)
          set(px, LAKE_LEVEL + 2, pz, BlockIds.ENTOMBED_UPRIGHT_UPPER, false)
          // Cap: black ice, sometimes crowned with a glacial shard
          set(px, LAKE_LEVEL + 3, pz, BlockIds.BLACK_ICE, false)
          if (cocytusHash(seed, px, pz, 305) < 0.4) set(px, LAKE_LEVEL + 4, pz, BlockIds.GLACIAL_ICE, false)
          // A little broken ice heaped at the foot (never against the figure's
          // upper half, so it always shows)
          for (let k = 0; k < 4; k++) {
            if (cocytusHash(seed, px, pz, 310 + k) < 0.3) {
              const [ox, oz] = k === 0 ? [1, 0] : k === 1 ? [-1, 0] : k === 2 ? [0, 1] : [0, -1]
              set(px + ox, LAKE_LEVEL + 1, pz + oz, BlockIds.BLACK_ICE, true)
            }
          }
        }
      }
    }
  }
}

/**
 * Origins of the world-anchored grid cells (multiples of `grid`) whose
 * content may reach this chunk: cells within `reach` blocks of it.
 */
function gridCells(chunkWorldX: number, chunkWorldZ: number, grid: number, reach: number): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  const x0 = Math.floor((chunkWorldX - reach) / grid) * grid - grid
  const x1 = chunkWorldX + CHUNK_SIZE_X - 1 + reach
  const z0 = Math.floor((chunkWorldZ - reach) / grid) * grid - grid
  const z1 = chunkWorldZ + CHUNK_SIZE_Z - 1 + reach
  for (let gx = x0; gx <= x1; gx += grid) {
    for (let gz = z0; gz <= z1; gz += grid) cells.push([gx, gz])
  }
  return cells
}
