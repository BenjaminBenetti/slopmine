import { Feature, type FeatureContext } from '../Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../../interfaces/IChunk.ts'
import { emberHash01 } from './emberHash.ts'
import {
  SubChunkWindow,
  fungusReach,
  placeFungus,
  type FungusParams,
  type ShelfStyle,
} from './FungusShape.ts'
import { findHiveFootprintsNear, isInHiveClearing } from './HiveClearing.ts'
import type { HiveFootprint } from '../../dungeons/kits/embergrove/SporeheartHiveKit.ts'
import { staysInOneRegion } from './regionGuards.ts'

/**
 * Settings for one size class of Ember Grove fungi (serializable: sent to
 * the generation workers as plain data).
 *
 * Placement: a world-anchored grid of `gridSize` cells; each cell holds a
 * fungus with probability `chance` (expected fungi per 32×32 chunk =
 * chance · 1024 / gridSize²), its root jittered within the middle
 * `jitter` fraction of the cell.
 */
export interface GiantFungusFeatureSettings {
  gridSize: number
  chance: number
  jitter: number
  minStemHeight: number
  maxStemHeight: number
  minBaseRadius: number
  maxBaseRadius: number
  minTopRadius: number
  maxTopRadius: number
  minCapRadius: number
  maxCapRadius: number
  /** Cap dome rise as a fraction of the cap radius. */
  minCapRise: number
  maxCapRise: number
  capThickness: number
  maxLean: number
  flareAmount: number
  spiralShelfChance: number
  scatteredShelfChance: number
  strandChance: number
  strandMaxLength: number
  /** Fraction of gill cells that cast real light (the rest only glow). */
  gillLightChance: number
  /** No roots within this distance of a Sporeheart Hive's mound, buttresses or approach (clearing). */
  hiveClearing: number
  /** Distinguishes size classes (hash salt). */
  salt: number
}

/** Max reach of biome-border dithering (DITHER_DISTANCE_BASE + DITHER_VARIANCE). */
const DITHER_MARGIN = 16

/**
 * Giant hell-fungi of the Ember Grove: thick emberwood stems with root
 * flares, broad crimson caps with glowing teal gills, hanging spore strands
 * and shelf fungi (sometimes a climbable spiral). One feature instance per
 * size class (giant canopy fungi, medium understorey fungi).
 *
 * Cross-chunk consistency (see FungusShape): world-anchored grid, all
 * parameters a pure function of the root + seed, precedence writes, and
 * deterministic vetoes only:
 * - the fungus must not cross a 512-block biome-region border (chunks in
 *   another region compute blended heights from different blend data, so
 *   the fungus would sit at a different height there),
 * - every probe ±(reach + dither margin) must be Ember Grove,
 * - no roots in a Sporeheart Hive's clearing.
 */
export class GiantFungusFeature extends Feature {
  readonly settings: GiantFungusFeatureSettings

  constructor(settings: GiantFungusFeatureSettings) {
    super()
    this.settings = settings
  }

  /** Deterministic fungus parameters for a root, or null if the cell is empty. */
  fungusAt(cellX: number, cellZ: number, seed: number, groundAt: (x: number, z: number) => number): FungusParams | null {
    const s = this.settings
    const salt = s.salt * 97
    const g = s.gridSize
    if (emberHash01(cellX, cellZ, salt + 1, seed) >= s.chance) return null

    const inset = (1 - s.jitter) * 0.5 * g
    const rootX = cellX * g + Math.floor(inset + emberHash01(cellX, cellZ, salt + 2, seed) * s.jitter * g)
    const rootZ = cellZ * g + Math.floor(inset + emberHash01(cellX, cellZ, salt + 3, seed) * s.jitter * g)

    const roll = (k: number): number => emberHash01(rootX, rootZ, salt + 10 + k, seed)
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

    // Taller fungi get broader caps and stems (correlated, not independent)
    const size = roll(0)
    const stemHeight = Math.round(lerp(s.minStemHeight, s.maxStemHeight, size))
    const capRadius = lerp(s.minCapRadius, s.maxCapRadius, 0.6 * size + 0.4 * roll(1))
    const baseRadius = lerp(s.minBaseRadius, s.maxBaseRadius, 0.7 * size + 0.3 * roll(2))
    const topRadius = lerp(s.minTopRadius, s.maxTopRadius, roll(3))
    const capRise = capRadius * lerp(s.minCapRise, s.maxCapRise, roll(4))
    const leanAngle = roll(5) * Math.PI * 2
    const lean = s.maxLean * roll(6)

    const shelfRoll = roll(7)
    const shelves: ShelfStyle = shelfRoll < s.spiralShelfChance
      ? 'spiral'
      : shelfRoll < s.spiralShelfChance + s.scatteredShelfChance ? 'scattered' : 'none'

    return {
      rootX,
      rootZ,
      baseY: groundAt(rootX, rootZ) + 1,
      stemHeight,
      baseRadius,
      topRadius,
      leanX: Math.cos(leanAngle) * lean,
      leanZ: Math.sin(leanAngle) * lean,
      capRadius,
      capRise,
      capThickness: s.capThickness,
      flareLobes: 3 + Math.floor(roll(8) * 3),
      flarePhase: roll(9) * Math.PI * 2,
      flareAmount: s.flareAmount,
      lobePhaseA: roll(10) * Math.PI * 2,
      lobePhaseB: roll(11) * Math.PI * 2,
      shelves,
      shelfPhase: roll(12) * Math.PI * 2,
      shelfTurn: roll(13) < 0.5 ? 1 : -1,
      strandChance: s.strandChance,
      strandMaxLength: s.strandMaxLength,
      sacChance: 0,
      gillLightChance: s.gillLightChance,
      salt: salt + 100,
      seed,
    }
  }

  /** Upper bound of fungusReach() over every parameter roll. */
  maxReach(): number {
    const s = this.settings
    return Math.ceil(Math.max(
      s.maxLean + s.maxCapRadius * 1.11 + 1.5,
      s.maxLean + s.maxBaseRadius + s.flareAmount + 3
    ))
  }

  /** True if a fungus passes the deterministic vetoes (see class doc). */
  isSiteValid(
    p: FungusParams,
    getBiomeNameAt: ((x: number, z: number) => string) | undefined,
    hives: readonly HiveFootprint[]
  ): boolean {
    const reach = fungusReach(p)
    if (!staysInOneRegion(p.rootX, p.rootZ, reach)) return false
    if (getBiomeNameAt) {
      const m = reach + DITHER_MARGIN
      for (const ox of [-m, 0, m]) {
        for (const oz of [-m, 0, m]) {
          if (getBiomeNameAt(p.rootX + ox, p.rootZ + oz) !== 'ember-grove') return false
        }
      }
    }
    for (const h of hives) {
      if (isInHiveClearing(h, p.rootX, p.rootZ, this.settings.hiveClearing)) return false
    }
    return true
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, config } = context
    const s = this.settings
    const seed = config.seed
    const win = new SubChunkWindow(chunk)

    // Fungi live in the Hell layer's cavern (floors ~Y 35-60)
    if (win.minY >= 128 || win.maxY < 16) return

    const reach = this.maxReach()
    const g = s.gridSize
    const cellX0 = Math.floor((win.chunkX - reach) / g) - 1
    const cellX1 = Math.floor((win.chunkX + CHUNK_SIZE_X + reach) / g)
    const cellZ0 = Math.floor((win.chunkZ - reach) / g) - 1
    const cellZ1 = Math.floor((win.chunkZ + CHUNK_SIZE_Z + reach) / g)

    // Hive clearings that any reachable root could fall into
    const pad = reach + g
    const getBiomeNameAt = context.getBiomeNameAt
    const hives = findHiveFootprintsNear(
      win.chunkX - pad,
      win.chunkZ - pad,
      win.chunkX + CHUNK_SIZE_X + pad,
      win.chunkZ + CHUNK_SIZE_Z + pad,
      seed,
      getBiomeNameAt,
      getBaseHeightAt
    )

    for (let cx = cellX0; cx <= cellX1; cx++) {
      for (let cz = cellZ0; cz <= cellZ1; cz++) {
        const p = this.fungusAt(cx, cz, seed, getBaseHeightAt)
        if (!p) continue
        if (!this.isSiteValid(p, getBiomeNameAt, hives)) continue
        placeFungus(win, p, getBaseHeightAt)
      }
    }
  }
}
