import { Feature, type FeatureContext } from '../Feature.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { forEachGridAnchor, hash2, isFootprintInBiome } from './ossuaryHash.ts'
import { isNearCatacombsPrecinct } from './CatacombsSite.ts'
import { SliceWriter } from './SliceWriter.ts'

/**
 * Settings for the Ossuary's colossal fossils.
 *
 * Placement: one candidate per world-anchored `gridSize` cell, kept with
 * probability `chance` (expected candidates per 512² biome region =
 * (512 / gridSize)² × chance), then vetoed if its footprint (+ dither
 * margin) leaves the biome or it would crowd a Catacombs precinct.
 */
export interface FossilFeatureSettings {
  readonly gridSize: number
  readonly chance: number
  /** Share of ribcages / vertebrae arches; the rest are giant skulls. */
  readonly ribcageShare: number
  readonly archShare: number
}

/** Largest horizontal reach of any fossil from its anchor (ribcage half-length + ribs). */
const FOSSIL_REACH = 26
const FOSSIL_SALT = 7200

const BONE = BlockIds.BONE_BLOCK
const ROCK = BlockIds.OSSIFIED_ROCK
const LANTERN = BlockIds.SOUL_LANTERN
const AIR = BlockIds.AIR

/** Highest Y a fossil may write (the layer-0 ceiling). */
const MAX_FOSSIL_Y = 127

/**
 * Colossal fossils rising from the bone ash - the Ossuary's landmarks:
 * - Ribcage: a whale-sized spine arching out of the ash with ribs that
 *   curve down and plunge back into it, a soul lantern burning inside.
 * - Vertebrae arch: a serpent's backbone breaching the ash in a great arc,
 *   segmented discs with spinous and transverse processes.
 * - Giant skull: a half-buried horned cranium whose eye sockets glow with
 *   soul fire from lanterns inside; players can climb in through the eyes.
 *
 * Every shape is a pure function of its anchor, the seed and pre-feature
 * terrain heights, stamped into each sub-chunk slice it overlaps.
 */
export class FossilFeature extends Feature {
  readonly settings: FossilFeatureSettings

  constructor(settings: FossilFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, getBiomeNameAt, biomeProperties, config } = context
    const seed = config.seed
    const out = new SliceWriter(chunk)
    const owner = biomeProperties.name

    forEachGridAnchor(
      out.minX, out.maxX, out.minZ, out.maxZ,
      this.settings.gridSize, FOSSIL_REACH, this.settings.chance, FOSSIL_REACH, FOSSIL_SALT, seed,
      (x, z, cellX, cellZ) => {
        if (getBiomeNameAt && !isFootprintInBiome(getBiomeNameAt, owner, x, z, FOSSIL_REACH)) return
        if (isNearCatacombsPrecinct(x, z, FOSSIL_REACH + 12, seed, getBaseHeightAt)) return
        const kind = hash2(cellX, cellZ, FOSSIL_SALT + 3, seed)
        const shape = (salt: number) => hash2(cellX, cellZ, FOSSIL_SALT + 10 + salt, seed)
        const base = getBaseHeightAt(x, z)
        if (kind < this.settings.ribcageShare) {
          this.ribcage(out, x, z, base, shape, getBaseHeightAt)
        } else if (kind < this.settings.ribcageShare + this.settings.archShare) {
          this.vertebraeArch(out, x, z, base, shape, getBaseHeightAt)
        } else {
          this.skull(out, x, z, base, shape, getBaseHeightAt)
        }
      }
    )
  }

  /** Map (along, perp) on the fossil's axis to world X/Z. */
  private static axisX(alongX: boolean, x: number, along: number, perp: number): number {
    return alongX ? x + along : x + perp
  }

  private static axisZ(alongX: boolean, z: number, along: number, perp: number): number {
    return alongX ? z + perp : z + along
  }

  private ribcage(
    out: SliceWriter,
    x: number,
    z: number,
    base: number,
    shape: (salt: number) => number,
    groundAt: (x: number, z: number) => number
  ): void {
    const alongX = shape(0) < 0.5
    const half = Math.floor((30 + Math.floor(shape(1) * 13)) / 2) // 15-21
    const height = 12 + Math.floor(shape(2) * 7) // spine 12-18 above the ash
    const ribMax = Math.round(height * 0.75)
    const yMin = base - 6
    const yMax = Math.min(MAX_FOSSIL_Y, base + height + 2)
    const reach = half + 1
    if (!out.overlaps(x - reach - ribMax, x + reach + ribMax, yMin - 4, yMax, z - reach - ribMax, z + reach + ribMax)) return

    const spineY = (a: number): number => base + height * (1 - Math.abs(a / half) ** 3) - 1
    const set = (along: number, perp: number, y: number, id: number): void => {
      if (y > MAX_FOSSIL_Y) return
      out.set(FossilFeature.axisX(alongX, x, along, perp), y, FossilFeature.axisZ(alongX, z, along, perp), id)
    }

    // Spine: 3 wide, 2 tall (deeper where it dives, so neighbouring columns
    // always share a face), with a knob (spinous process) every third block
    for (let a = -half; a <= half; a++) {
      const ys = Math.round(spineY(a))
      const low = Math.min(ys - 1, Math.round(spineY(a - 1)), Math.round(spineY(a + 1)))
      for (let p = -1; p <= 1; p++) {
        for (let y = low; y <= ys; y++) set(a, p, y, BONE)
      }
      if (((a % 3) + 3) % 3 === 0) set(a, 0, ys + 1, BONE)
    }

    // Ribs: arcs from the spine curving out and down into the ash
    for (let a = -half + 3; a <= half - 3; a += 3) {
      const r = ribMax * Math.sqrt(Math.max(0, 1 - (a / half) ** 2))
      if (r < 2) continue
      const yTop = spineY(a) - 1
      for (const side of [-1, 1]) {
        let lastP = Number.NaN
        let lastY = Number.NaN
        for (let theta = 0; theta <= 2.15; theta += 0.04) {
          const p = side * Math.round(1.5 + r * Math.sin(theta))
          const y = Math.round(yTop - r * (1 - Math.cos(theta)))
          if (p !== lastP && y !== lastY && !Number.isNaN(lastP)) {
            // Diagonal step: fill the corner so the arc stays face-connected
            set(a, p, lastY, BONE)
            set(a + 1, p, lastY, BONE)
          }
          set(a, p, y, BONE)
          set(a + 1, p, y, BONE)
          lastP = p
          lastY = y
        }
        // Plunge the rib tip into the ash at its own column
        const wx = FossilFeature.axisX(alongX, x, a, lastP)
        const wz = FossilFeature.axisZ(alongX, z, a, lastP)
        const ground = groundAt(wx, wz)
        for (let y = lastY - 1; y >= ground - 2; y--) {
          set(a, lastP, y, BONE)
          set(a + 1, lastP, y, BONE)
        }
      }
    }

    // Soul fire burning in the ash inside the ribcage
    const ground = groundAt(x, z)
    set(0, 0, ground, ROCK)
    set(0, 0, ground + 1, LANTERN)
  }

  private vertebraeArch(
    out: SliceWriter,
    x: number,
    z: number,
    base: number,
    shape: (salt: number) => number,
    groundAt: (x: number, z: number) => number
  ): void {
    const alongX = shape(0) < 0.5
    const half = Math.floor((34 + Math.floor(shape(1) * 15)) / 2) // 17-24
    const peak = 16 + Math.floor(shape(2) * 12) // 16-27 above the ash
    const yMax = Math.min(MAX_FOSSIL_Y, base + peak + 4)
    // Ground under each end of the backbone (lowest of its 3 columns)
    const endGround = (ia: number): number => {
      let g = Infinity
      for (let p = -1; p <= 1; p++) {
        g = Math.min(g, groundAt(FossilFeature.axisX(alongX, x, ia, p), FossilFeature.axisZ(alongX, z, ia, p)))
      }
      return g
    }
    const groundLo = endGround(-half)
    const groundHi = endGround(half)
    const yMin = Math.min(base - 6, groundLo - 3, groundHi - 3)
    if (!out.overlaps(x - half - 4, x + half + 4, yMin, yMax, z - half - 4, z + half + 4)) return

    const set = (along: number, perp: number, y: number, id: number): void => {
      if (y > MAX_FOSSIL_Y) return
      out.set(FossilFeature.axisX(alongX, x, along, perp), y, FossilFeature.axisZ(alongX, z, along, perp), id)
    }
    const curveY = (a: number): number => base - 3 + (peak + 3) * (1 - (a / half) ** 2)

    for (let a4 = -half * 4; a4 <= half * 4; a4++) {
      const a = a4 / 4
      const ia = Math.round(a)
      const yc = Math.round(curveY(a))
      const segment = ((ia + half) % 3 + 3) % 3
      if (segment === 2) {
        // Joint between vertebrae: a narrow neck
        set(ia, 0, yc, BONE)
      } else {
        // Vertebral body: 3x3 disc
        for (let p = -1; p <= 1; p++) {
          for (let dy = -1; dy <= 1; dy++) set(ia, p, yc + dy, BONE)
        }
      }
    }
    // Where the dunes fall away under an end, the backbone keeps diving until
    // it is buried (else the arch floats over low ground)
    for (const [ia, ground] of [[-half, groundLo], [half, groundHi]] as const) {
      const bottom = Math.round(curveY(ia)) - 2
      for (let y = ground - 2; y <= bottom; y++) {
        for (let p = -1; p <= 1; p++) set(ia, p, y, BONE)
      }
    }
    // Processes on every third vertebra: a spike up, transverse spurs sideways
    for (let ia = -half + 1; ia <= half - 1; ia++) {
      if (((ia + half) % 3 + 3) % 3 !== 0) continue
      const yc = Math.round(curveY(ia))
      set(ia, 0, yc + 2, BONE)
      set(ia, 0, yc + 3, BONE)
      set(ia, -2, yc, BONE)
      set(ia, 2, yc, BONE)
      set(ia, -3, yc, BONE)
      set(ia, 3, yc, BONE)
    }
    // Soul fire on the crest of the arch
    const crest = Math.round(curveY(0))
    set(0, 0, crest + 2, BONE)
    set(0, 0, crest + 3, LANTERN)
  }

  private skull(
    out: SliceWriter,
    x: number,
    z: number,
    base: number,
    shape: (salt: number) => number,
    groundAt: (x: number, z: number) => number
  ): void {
    const facing = Math.floor(shape(0) * 4) // front toward +x, -x, +z, -z
    const rx = 9 + Math.floor(shape(1) * 2) // half-width
    const ry = 8 + Math.floor(shape(2) * 2) // half-height
    const rz = 11 + Math.floor(shape(3) * 2) // half-length (front-back)
    const horned = shape(4) < 0.55
    const cy = base + Math.round(ry * 0.7)
    const reach = Math.max(rx + 10, rz + 2)
    if (!out.overlaps(x - reach, x + reach, cy - ry - 1, Math.min(MAX_FOSSIL_Y, cy + ry + 8), z - reach, z + reach)) return

    // Skull-local (u lateral, v up, w forward) -> world
    const toWorldX = (u: number, w: number): number => (facing === 0 ? x + w : facing === 1 ? x - w : facing === 2 ? x + u : x - u)
    const toWorldZ = (u: number, w: number): number => (facing === 0 ? z + u : facing === 1 ? z - u : facing === 2 ? z + w : z - w)

    const eyeU = rx * 0.42
    const eyeV = ry * 0.15
    const eyeW = rz * 0.7
    const innerX = rx - 1.6
    const innerY = ry - 1.6
    const innerZ = rz - 1.6

    for (let w = -rz - 1; w <= rz + 1; w++) {
      for (let u = -rx - 1; u <= rx + 1; u++) {
        const wx = toWorldX(u, w)
        const wz = toWorldZ(u, w)
        if (wx < out.minX || wx > out.maxX || wz < out.minZ || wz > out.maxZ) continue
        const ground = groundAt(wx, wz)
        for (let v = -ry - 1; v <= ry + 1; v++) {
          const y = cy + v
          if (y < out.minY || y > out.maxY || y > MAX_FOSSIL_Y) continue
          const e = (u / rx) ** 2 + (v / ry) ** 2 + (w / rz) ** 2
          if (e > 1) continue
          const inner = (u / innerX) ** 2 + (v / innerY) ** 2 + (w / innerZ) ** 2
          const aboveGround = y > ground
          if (inner <= 1) {
            // Hollow cranium (the ash fills its buried half)
            if (aboveGround) out.set(wx, y, wz, AIR)
            continue
          }
          if (aboveGround) {
            // Eye sockets
            const eye = (Math.abs(u) - eyeU) ** 2 + (v - eyeV) ** 2 + ((w - eyeW) * 0.8) ** 2
            if (eye <= 3.0 * 3.0 && w > 0) {
              out.set(wx, y, wz, AIR)
              continue
            }
            // Nasal cavity: a narrowing slot below the eyes
            if (w > rz * 0.55 && v <= -ry * 0.05 && v >= -ry * 0.4 && Math.abs(u) <= 1 + (v + ry * 0.4) * 0.35) {
              out.set(wx, y, wz, AIR)
              continue
            }
            // Mouth slot with a row of teeth
            if (w > rz * 0.5 && v <= -ry * 0.55 && v >= -ry * 0.7 && Math.abs(u) <= rx * 0.6 && (u & 1) !== 0) {
              out.set(wx, y, wz, AIR)
              continue
            }
          }
          out.set(wx, y, wz, BONE)
        }
      }
    }

    // Soul fire glowing behind each eye socket
    for (const side of [-1, 1]) {
      const u = Math.round(side * eyeU)
      const w = Math.round(eyeW - 3)
      const wx = toWorldX(u, w)
      const wz = toWorldZ(u, w)
      const y = cy + Math.round(eyeV)
      const ground = groundAt(wx, wz)
      if (y <= ground) continue
      // A bone pedestal from the cranium floor keeps the lantern anchored
      for (let py = ground + 1; py < y; py++) out.set(wx, py, wz, BONE)
      out.set(wx, y, wz, LANTERN)
    }

    // Curving horns sweeping out, up and forward
    if (horned) {
      for (const side of [-1, 1]) {
        for (let t = 0; t <= 1; t += 0.02) {
          const u = side * (rx * 0.7 + 8 * t)
          const v = ry * 0.55 + 10 * t - 4 * t * t
          const w = -rz * 0.1 + 8 * t * t
          const r = Math.max(1.0, 2.0 * (1 - t) + 0.5)
          const ri = Math.ceil(r)
          for (let du = -ri; du <= ri; du++) {
            for (let dv = -ri; dv <= ri; dv++) {
              for (let dw = -ri; dw <= ri; dw++) {
                if (du * du + dv * dv + dw * dw > r * r) continue
                const y = cy + Math.round(v + dv)
                if (y > MAX_FOSSIL_Y) continue
                out.set(toWorldX(Math.round(u + du), Math.round(w + dw)), y, toWorldZ(Math.round(u + du), Math.round(w + dw)), BONE)
              }
            }
          }
        }
      }
    }
  }
}
