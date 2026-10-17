import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import { MOLTEN_SEA_Y, getRiverBedY } from '../molten/MoltenTerrain.ts'

/**
 * Settings for infernium ore veins in the Molten Wastes.
 */
export interface InferniumOreFeatureSettings {
  /** Vein attempts per chunk column. */
  readonly attemptsPerChunk: number
  /** Blocks per vein (a short random walk). */
  readonly veinSize: number
  /** Vein seed Y range (world). */
  readonly minY: number
  readonly maxY: number
  /** Gaussian Y distribution of vein seeds. */
  readonly peakY: number
  readonly ySpread: number
  /**
   * Extra attempts per chunk that only take where the column lies under the
   * lava sea: infernium is richest beneath the lava.
   */
  readonly seaBonusAttempts: number
  /**
   * Extra attempts per chunk that seed their vein in an exposed rock face -
   * a canyon wall over a lava river or the sea, a mesa cliff - so some veins
   * glow in plain sight (default 0).
   */
  readonly exposedAttempts?: number
  /** World Y range of exposed vein seeds (defaults 44-80). */
  readonly exposedMinY?: number
  readonly exposedMaxY?: number
}

/** An exposed face must drop at least this many blocks (not a terrain step). */
const MIN_FACE_HEIGHT = 4
/** Columns an exposed attempt samples looking for a face. */
const FACE_SAMPLES = 64
/** Horizontal neighbours a face can open toward. */
const FACE_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** Vein seeds stay at least this far below the column's surface. */
const SURFACE_CLEARANCE = 3

/** Blocks a vein may replace (basalt: the strata bands of cliff faces). */
const HOST_ROCK = new Set<number>([BlockIds.HELL_ROCK, BlockIds.BASALT])

type Step = readonly [number, number, number]

const STEPS: ReadonlyArray<Step> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
]
/** Exposed veins spread across their face: no steps along the face normal. */
const FACE_STEPS_X: ReadonlyArray<Step> = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const FACE_STEPS_Z: ReadonlyArray<Step> = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]

/**
 * Infernium ore: short veins in the hell rock of the Molten Wastes,
 * concentrated around Y 38 (strip-mining depth; optionally richer under the
 * lava sea), plus veins seeded in exposed faces (canyon walls, mesa cliffs)
 * that spread across the face and glow in plain sight. A few more nuggets
 * sit in the roots of the great pillars (HellPillarFeature).
 *
 * Deterministic per column: vein seeds derive from the chunk coordinate and
 * the attempt index; a vein is the slice of a random walk inside the
 * sub-chunk holding its seed (veins never straddle chunk borders).
 */
export class InferniumOreFeature extends Feature {
  readonly settings: InferniumOreFeatureSettings

  constructor(settings: InferniumOreFeatureSettings) {
    super()
    this.settings = settings
  }

  private hash(a: number, b: number, c: number, salt: number): number {
    let h =
      Math.imul(a | 0, 374761393) ^
      Math.imul(b | 0, 668265263) ^
      Math.imul(c | 0, 1610612741) ^
      Math.imul(salt | 0, 1013904223)
    h = Math.imul(h ^ (h >>> 15), 2246822519)
    h = Math.imul(h ^ (h >>> 13), 3266489917)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, config } = context
    const s = this.settings
    const coord = chunk.coordinate as ISubChunkCoordinate
    const subY = typeof coord.subY === 'number' ? coord.subY : 0
    const minY = subY * SUB_CHUNK_HEIGHT
    const maxY = minY + SUB_CHUNK_HEIGHT - 1
    const exposed = s.exposedAttempts ?? 0
    const rangeMin = exposed > 0 ? Math.min(s.minY, s.exposedMinY ?? 44) : s.minY
    const rangeMax = exposed > 0 ? Math.max(s.maxY, s.exposedMaxY ?? 80) : s.maxY
    if (rangeMax < minY || rangeMin > maxY) return

    const cx = Number(coord.x)
    const cz = Number(coord.z)
    const seed = config.seed
    const total = s.attemptsPerChunk + s.seaBonusAttempts

    // Exposed veins: seeded in a rock face (height-based, so every
    // sub-chunk agrees on the seed; only the one holding it writes)
    for (let attempt = 0; attempt < exposed; attempt++) {
      const face = this.findFace(context, cx, cz, attempt, seed)
      if (face && face.y >= minY && face.y <= maxY) {
        const steps = face.normalX !== 0 ? FACE_STEPS_X : FACE_STEPS_Z
        this.placeVein(context, face.lx, face.y - minY, face.lz, face.y, total + attempt, steps)
      }
    }

    for (let attempt = 0; attempt < total; attempt++) {
      const lx = Math.floor(this.hash(cx, cz, attempt, seed ^ 0x11) * CHUNK_SIZE_X)
      const lz = Math.floor(this.hash(cx, cz, attempt, seed ^ 0x22) * CHUNK_SIZE_Z)
      const worldX = cx * CHUNK_SIZE_X + lx
      const worldZ = cz * CHUNK_SIZE_Z + lz
      const height = getBaseHeightAt(worldX, worldZ)

      // Bonus attempts only take under the lava sea
      if (attempt >= s.attemptsPerChunk && height >= MOLTEN_SEA_Y) continue

      // Gaussian seed Y (Box-Muller) within the range, buried in the rock
      // (seeds at the surface are dropped, not clamped - ore crusts on the
      // ground would make the hunt trivial; cliffs and canyons expose veins)
      const u1 = Math.max(1e-4, this.hash(cx, cz, attempt, seed ^ 0x33))
      const u2 = this.hash(cx, cz, attempt, seed ^ 0x44)
      const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      const seedY = Math.max(s.minY, Math.min(s.maxY, Math.round(s.peakY + gauss * s.ySpread)))
      if (seedY > height - SURFACE_CLEARANCE) continue
      if (seedY < minY || seedY > maxY) continue

      this.placeVein(context, lx, seedY - minY, lz, seedY, attempt)
    }
  }

  /** Random walk of veinSize steps from a seed cell, clipped to this sub-chunk. */
  private placeVein(
    context: FeatureContext,
    lx: number,
    localY: number,
    lz: number,
    seedY: number,
    attempt: number,
    steps: ReadonlyArray<Step> = STEPS
  ): void {
    const { chunk } = context
    const coord = chunk.coordinate as ISubChunkCoordinate
    const worldX = Number(coord.x) * CHUNK_SIZE_X + lx
    const worldZ = Number(coord.z) * CHUNK_SIZE_Z + lz
    let x = lx
    let y = localY
    let z = lz
    for (let i = 0; i < this.settings.veinSize; i++) {
      if (x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y >= 0 && y < SUB_CHUNK_HEIGHT) {
        if (HOST_ROCK.has(chunk.getBlockId(x, y, z))) {
          chunk.setBlockId(x, y, z, BlockIds.INFERNIUM_ORE)
        }
      }
      const step = steps[Math.floor(this.hash(worldX + i, seedY, worldZ, attempt ^ 0x55) * steps.length) % steps.length]
      x += step[0]
      y += step[1]
      z += step[2]
    }
  }

  /**
   * Seed cell of an exposed vein: sample columns of the chunk for a rock
   * face at least MIN_FACE_HEIGHT tall toward a neighbour column that is
   * open above a lower floor (a lava river canyon, the lava sea, lower
   * ground below a cliff), and pick a cell inside the face. Pure function of
   * heights and noise, so it is identical in every sub-chunk.
   */
  private findFace(
    context: FeatureContext,
    cx: number,
    cz: number,
    attempt: number,
    seed: number
  ): { lx: number; y: number; lz: number; normalX: number } | null {
    const { getBaseHeightAt, noise } = context
    const s = this.settings
    const lowY = s.exposedMinY ?? 44
    const highY = s.exposedMaxY ?? 80
    /** Highest solid Y of a column: rock top, or the lava surface over the sea / a river. */
    const floorAt = (x: number, z: number): number => {
      const h = getBaseHeightAt(x, z)
      if (h < MOLTEN_SEA_Y) return MOLTEN_SEA_Y
      return getRiverBedY(noise, x, z, h) !== null ? MOLTEN_SEA_Y : h
    }
    for (let sample = 0; sample < FACE_SAMPLES; sample++) {
      const salt = attempt * 64 + sample
      const lx = Math.floor(this.hash(cx, cz, salt, seed ^ 0x66) * CHUNK_SIZE_X)
      const lz = Math.floor(this.hash(cx, cz, salt, seed ^ 0x77) * CHUNK_SIZE_Z)
      const x = cx * CHUNK_SIZE_X + lx
      const z = cz * CHUNK_SIZE_Z + lz
      const top = floorAt(x, z)
      if (top <= MOLTEN_SEA_Y) continue // open sea or river: no wall here
      const turn = Math.floor(this.hash(cx, cz, salt, seed ^ 0x88) * 4)
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = FACE_DIRS[(turn + d) & 3]
        const open = floorAt(x + dx, z + dz)
        // Face cells: above the neighbour's floor, below this column's lip
        const faceLow = Math.max(open + 1, lowY)
        const faceHigh = Math.min(top - 1, highY)
        if (top - open < MIN_FACE_HEIGHT || faceHigh < faceLow) continue
        const y = faceLow + Math.floor(this.hash(x, z, salt, seed ^ 0x99) * (faceHigh - faceLow + 1))
        return { lx, y, lz, normalX: dx }
      }
    }
    return null
  }
}
