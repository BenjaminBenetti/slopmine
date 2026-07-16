import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { isLiquidBlock } from '../../liquid/LiquidPhysicsAlgorithm.ts'
import type { CaveParamsComponent, CaveSample, CaveSampleGetter } from './CaveConfig.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/** Lattice sampling stride in blocks for the 3D noise fields. */
const LATTICE_STEP = 4

/** Number of lattice points across a chunk's 32-block horizontal extent. */
const LATTICE_XZ = CHUNK_SIZE_X / LATTICE_STEP + 1

/** Cheese-threshold tightening applied at the surface outside entrance zones. */
const SURFACE_TIGHTEN = 0.7

/** Cheese-threshold tightening applied approaching the cave floor (minY). */
const FLOOR_TIGHTEN = 0.7

/** Width of the smoothstep band above the entrance threshold (normalized noise units). */
const ENTRANCE_BLEND_BAND = 0.1

/**
 * Entrance pipe geometry, calibrated to this SimplexNoise's 2D distribution
 * (normalized > 0.9 covers ~2.4% of area, > 0.925 roughly 1.5%).
 * A pipe carves where the SHEARED entrance field exceeds
 * min(threshold + PIPE_MOUTH_OFFSET, PIPE_MOUTH_MAX): the field is sampled
 * at coordinates offset proportionally to world Y, so the carved region
 * translates sideways as it descends — a constant-cross-section tube at
 * ~45 degrees. The result is a walkable ramp from a surface mouth down to
 * `entrance.depth`, guaranteed to reach full depth (the requirement does
 * not rise with depth, unlike a narrowing cone which pinches out early
 * unless the field peak is improbably strong).
 */
const PIPE_MOUTH_OFFSET = 0.1
const PIPE_MOUTH_MAX = 0.925
const PIPE_SHEAR_X = 0.9
const PIPE_SHEAR_Z = 0.45

/** Octaves/persistence for the cheese cavern fractal field. */
const CHEESE_OCTAVES = 2
const CHEESE_PERSISTENCE = 0.5

/** Minimal block access shared by IChunkData and ISubChunkData. */
interface BlockAccess {
  getBlockId(x: number, y: number, z: number): number
  setBlockId(x: number, y: number, z: number, blockId: number): boolean
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function smoothstep01(t: number): number {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

/** Map raw simplex output [-1,1] to [0,1]. */
function norm(n: number): number {
  return clamp01((n + 1) * 0.5)
}

/**
 * Noise-density cave carver.
 *
 * Carving decisions are a pure function of world position, seed, and the
 * per-column cave sample, so caves are seamless across chunk and sub-chunk
 * boundaries with no cross-chunk bookkeeping. See CaveConfig.ts for the
 * model: cheese caverns + spaghetti tunnels + ravines, with a surface
 * falloff that is cancelled inside entrance zones so cave mouths open
 * naturally onto the surface.
 *
 * Biome blending: each noise field is evaluated at every contributing
 * biome's own constant frequency and the field VALUES are mixed by blend
 * weight (interpolating frequencies would distort the field increasingly
 * with distance from the origin — see CaveParamsComponent).
 *
 * The three 3D noise fields are sampled on a 4-block lattice and
 * trilinearly interpolated (~50x fewer noise evaluations than per-block).
 */
export class CaveCarver {
  private readonly cheeseNoise: SimplexNoise
  private readonly spaghettiNoise1: SimplexNoise
  private readonly spaghettiNoise2: SimplexNoise
  private readonly thicknessNoise: SimplexNoise
  private readonly ravineNoise: SimplexNoise
  private readonly ravineModNoise: SimplexNoise
  private readonly entranceNoise: SimplexNoise

  // Scratch buffers reused across carve calls (one carver per worker).
  private latCheese: Float32Array = new Float32Array(0)
  private latSpag1: Float32Array = new Float32Array(0)
  private latSpag2: Float32Array = new Float32Array(0)
  private latPipe: Float32Array = new Float32Array(0)
  private readonly heights = new Float32Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)

  constructor(seed: number) {
    this.cheeseNoise = new SimplexNoise(seed + 7001)
    this.spaghettiNoise1 = new SimplexNoise(seed + 7002)
    this.spaghettiNoise2 = new SimplexNoise(seed + 7003)
    this.thicknessNoise = new SimplexNoise(seed + 7004)
    this.ravineNoise = new SimplexNoise(seed + 7005)
    this.ravineModNoise = new SimplexNoise(seed + 7006)
    this.entranceNoise = new SimplexNoise(seed + 7007)
  }

  /**
   * Carve caves within a sub-chunk's world-Y range.
   * The sample getter is invoked per column; its returned object is only
   * guaranteed valid until the next invocation (callers may reuse scratch).
   */
  carveSubChunk(
    subChunk: ISubChunkData,
    getSampleAt: CaveSampleGetter,
    getHeightAt: HeightGetter,
    minWorldY: number,
    maxWorldY: number
  ): void {
    const coord = subChunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z
    this.carveRegion(subChunk, chunkWorldX, chunkWorldZ, minWorldY, maxWorldY, minWorldY, getSampleAt, getHeightAt)
  }

  /**
   * Carve caves into a full chunk column (legacy full-chunk path).
   * World Y equals storage Y for full chunks, so the Y offset is 0.
   */
  carve(
    chunk: IChunkData,
    getSampleAt: CaveSampleGetter,
    getHeightAt: HeightGetter,
    minWorldY = 0,
    maxWorldY = 511
  ): void {
    const coord = chunk.coordinate
    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z
    this.carveRegion(chunk, chunkWorldX, chunkWorldZ, minWorldY, maxWorldY, 0, getSampleAt, getHeightAt)
  }

  /** Weighted cheese fractal field value across blend components. */
  private sampleCheese(worldX: number, worldY: number, worldZ: number, components: readonly CaveParamsComponent[]): number {
    let value = 0
    for (const c of components) {
      if (c.weight <= 0.001) continue
      const s = c.params.cheeseScale
      value +=
        c.weight *
        this.cheeseNoise.fractalNoise3D(
          worldX * s,
          worldY * s * c.params.cheeseVerticalScale,
          worldZ * s,
          CHEESE_OCTAVES,
          CHEESE_PERSISTENCE,
          1
        )
    }
    return value
  }

  /** Weighted spaghetti field value across blend components. */
  private sampleSpaghetti(
    noise: SimplexNoise,
    worldX: number,
    worldY: number,
    worldZ: number,
    components: readonly CaveParamsComponent[]
  ): number {
    let value = 0
    for (const c of components) {
      if (c.weight <= 0.001) continue
      const s = c.params.spaghettiScale
      value += c.weight * noise.noise3D(worldX * s, worldY * s * c.params.spaghettiVerticalSquash, worldZ * s)
    }
    return value
  }

  /**
   * Weighted sheared entrance field for pipes: the 2D entrance field sampled
   * at coordinates offset by worldY, making iso-regions slanted tubes.
   */
  private samplePipeField(
    worldX: number,
    worldY: number,
    worldZ: number,
    components: readonly CaveParamsComponent[]
  ): number {
    const sx = worldX + PIPE_SHEAR_X * worldY
    const sz = worldZ + PIPE_SHEAR_Z * worldY
    let value = 0
    for (const c of components) {
      if (c.weight <= 0.001) continue
      const s = c.params.entranceScale
      value += c.weight * this.entranceNoise.noise2D(sx * s, sz * s)
    }
    return value
  }

  /** Weighted 2D field value at a per-component scale multiple. */
  private sample2D(
    noise: SimplexNoise,
    worldX: number,
    worldZ: number,
    components: readonly CaveParamsComponent[],
    scaleOf: (p: CaveParamsComponent) => number,
    offsetX = 0
  ): number {
    let value = 0
    for (const c of components) {
      if (c.weight <= 0.001) continue
      const s = scaleOf(c)
      value += c.weight * noise.noise2D(worldX * s + offsetX, worldZ * s)
    }
    return value
  }

  /**
   * Pointwise probe: would the carver open the surface at this column?
   * Checks the surface block and the one below it. Used by features (tree
   * placement) to avoid building on entrance mouths and ravines. Evaluates
   * the noise fields directly (no lattice), so it can differ from the carved
   * result by up to the lattice interpolation error right at thresholds —
   * acceptable for placement decisions.
   */
  isSurfaceOpenAt(worldX: number, worldZ: number, surfaceY: number, sample: CaveSample): boolean {
    const params = sample.params
    const components = sample.components
    const strength = params.strength
    if (strength <= 0.001) return false
    if (surfaceY < params.minY || surfaceY > params.maxY) return false

    const liquidGuarded = surfaceY <= params.liquidSurfaceGuardY

    let entranceFactor = 0
    let entranceField = 0
    if (!liquidGuarded && params.entranceStrength > 0.001) {
      entranceField = norm(this.sample2D(this.entranceNoise, worldX, worldZ, components, (c) => c.params.entranceScale))
      entranceFactor =
        smoothstep01((entranceField - params.entranceThreshold) / ENTRANCE_BLEND_BAND) * params.entranceStrength * strength
    }

    // Entrance pipe mouth opens right at the surface (sheared field at surfaceY).
    if (!liquidGuarded && params.entranceStrength > 0.001 && params.entranceDepth > 1) {
      const required =
        Math.min(params.entranceThreshold + PIPE_MOUTH_OFFSET, PIPE_MOUTH_MAX) +
        (1 - params.entranceStrength * strength) * 2
      const pipe = norm(this.samplePipeField(worldX, surfaceY, worldZ, components))
      if (pipe > required) return true
    }
    const entranceFactorSq = entranceFactor * entranceFactor

    if (params.ravineStrength > 0.001 && params.ravineWidth > 0 && params.ravineDensity > 0.001) {
      const mask = norm(this.sample2D(this.ravineModNoise, worldX, worldZ, components, (c) => c.params.ravineScale * 0.6, 2048))
      if (mask < params.ravineDensity) {
        const r = this.sample2D(this.ravineNoise, worldX, worldZ, components, (c) => c.params.ravineScale)
        const widthMod =
          0.7 + 0.6 * norm(this.sample2D(this.ravineModNoise, worldX, worldZ, components, (c) => c.params.ravineScale * 2.7))
        if (Math.abs(r) < params.ravineWidth * widthMod * params.ravineStrength * strength) {
          return true
        }
      }
    }

    if (entranceFactor <= 0.001) return false

    // Only entrance zones can breach the surface via cheese/spaghetti.
    const invFloorFade = 1 / params.floorFadeDepth
    const cheeseSurfaceTerm =
      SURFACE_TIGHTEN * (1 - entranceFactorSq) - params.entranceBoost * entranceFactorSq
    for (let worldY = surfaceY; worldY >= surfaceY - 1; worldY--) {
      const depthBelowSurface = surfaceY - worldY
      const surfaceCloseness = clamp01(1 - depthBelowSurface / params.surfaceFalloffDepth)
      const opening = surfaceCloseness * (1 - entranceFactorSq)
      const floorFade = clamp01((worldY - params.minY) * invFloorFade)

      if (params.cheeseStrength > 0.001) {
        const cheese = this.sampleCheese(worldX, worldY, worldZ, components)
        const threshold =
          params.cheeseThreshold +
          surfaceCloseness * cheeseSurfaceTerm +
          (1 - floorFade) * FLOOR_TIGHTEN +
          (1 - params.cheeseStrength * strength) * 2
        if (cheese > threshold) return true
      }

      if (params.spaghettiStrength > 0.001) {
        const mod = norm(this.thicknessNoise.noise2D(worldX * 0.008, worldZ * 0.008))
        const base =
          params.spaghettiThickness *
          (1 + params.spaghettiThicknessVariance * (mod * 2 - 1)) *
          params.spaghettiStrength *
          strength
        const thickness = base * (1 - opening) * floorFade
        if (thickness > 0) {
          const s1 = Math.abs(this.sampleSpaghetti(this.spaghettiNoise1, worldX, worldY, worldZ, components))
          const s2 = Math.abs(this.sampleSpaghetti(this.spaghettiNoise2, worldX, worldY, worldZ, components))
          if (Math.max(s1, s2) < thickness) return true
        }
      }
    }

    return false
  }

  private carveRegion(
    blocks: BlockAccess,
    chunkWorldX: number,
    chunkWorldZ: number,
    minWorldY: number,
    maxWorldY: number,
    storageYOffset: number,
    getSampleAt: CaveSampleGetter,
    getHeightAt: HeightGetter
  ): void {
    // ---- Pass 1: per-column heights and the carveable Y window ----
    const heights = this.heights
    let windowLo = Infinity
    let windowHi = -Infinity
    let anyCarving = false
    let anyPipes = false

    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
        const worldX = chunkWorldX + localX
        const worldZ = chunkWorldZ + localZ

        const params = getSampleAt(worldX, worldZ).params
        if (params.strength <= 0.001) continue

        const surfaceY = getHeightAt(worldX, worldZ)
        heights[localZ * CHUNK_SIZE_X + localX] = surfaceY

        const colLo = Math.max(minWorldY, Math.floor(params.minY))
        const colHi = Math.min(maxWorldY, Math.floor(params.maxY), surfaceY)
        if (colLo > colHi) continue

        anyCarving = true
        if (params.entranceStrength > 0.001 && params.entranceDepth > 1) anyPipes = true
        if (colLo < windowLo) windowLo = colLo
        if (colHi > windowHi) windowHi = colHi
      }
    }

    if (!anyCarving) return

    // ---- Pass 2: sample 3D noise fields on the lattice ----
    // Lattice Y planes are aligned to LATTICE_STEP in world space so results
    // are identical regardless of which sub-chunk requests them.
    const latY0 = Math.floor(windowLo / LATTICE_STEP) * LATTICE_STEP
    const latYCount = Math.floor((windowHi - latY0) / LATTICE_STEP) + 2
    const latSize = LATTICE_XZ * LATTICE_XZ * latYCount
    if (this.latCheese.length < latSize) {
      this.latCheese = new Float32Array(latSize)
      this.latSpag1 = new Float32Array(latSize)
      this.latSpag2 = new Float32Array(latSize)
      this.latPipe = new Float32Array(latSize)
    }
    const latCheese = this.latCheese
    const latSpag1 = this.latSpag1
    const latSpag2 = this.latSpag2
    const latPipe = this.latPipe

    for (let iz = 0; iz < LATTICE_XZ; iz++) {
      const worldZ = chunkWorldZ + iz * LATTICE_STEP
      for (let ix = 0; ix < LATTICE_XZ; ix++) {
        const worldX = chunkWorldX + ix * LATTICE_STEP
        // Field values are blended across biome components per lattice
        // column; weights vary smoothly, so the interpolated field stays
        // continuous across biome borders and chunk seams.
        const components = getSampleAt(worldX, worldZ).components
        const colBase = (iz * LATTICE_XZ + ix) * latYCount

        for (let iy = 0; iy < latYCount; iy++) {
          const worldY = latY0 + iy * LATTICE_STEP
          const idx = colBase + iy
          latCheese[idx] = this.sampleCheese(worldX, worldY, worldZ, components)
          latSpag1[idx] = this.sampleSpaghetti(this.spaghettiNoise1, worldX, worldY, worldZ, components)
          latSpag2[idx] = this.sampleSpaghetti(this.spaghettiNoise2, worldX, worldY, worldZ, components)
          if (anyPipes) {
            latPipe[idx] = this.samplePipeField(worldX, worldY, worldZ, components)
          }
        }
      }
    }

    // Per-column interpolated Y-profiles (built from the lattice per column).
    const colCheese = new Float32Array(latYCount)
    const colSpag1 = new Float32Array(latYCount)
    const colSpag2 = new Float32Array(latYCount)
    const colPipe = new Float32Array(latYCount)

    // ---- Pass 3: carve per column ----
    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
        const worldX = chunkWorldX + localX
        const worldZ = chunkWorldZ + localZ
        const sample = getSampleAt(worldX, worldZ)
        const params = sample.params
        const components = sample.components
        const strength = params.strength
        if (strength <= 0.001) continue

        const surfaceY = heights[localZ * CHUNK_SIZE_X + localX]
        const yLo = Math.max(minWorldY, Math.floor(params.minY))
        const yHi = Math.min(maxWorldY, Math.floor(params.maxY), surfaceY)
        if (yLo > yHi) continue

        // Liquid guard: don't open entrance mouths under lakes and pools.
        // (Ravines are allowed through - draining a pool into a canyon is a
        // waterfall, which is a feature.)
        const liquidGuarded = surfaceY <= params.liquidSurfaceGuardY

        // Entrance zone factor (0-1) for this column. The squared factor
        // concentrates the surface-falloff cancel and the cheese boost into
        // zone cores, so mouths are distinct discoverable features rather
        // than broad crater fields across the whole zone.
        let entranceFactor = 0
        let entranceFactorSq = 0
        let entranceField = 0
        if (!liquidGuarded && params.entranceStrength > 0.001) {
          entranceField = norm(this.sample2D(this.entranceNoise, worldX, worldZ, components, (c) => c.params.entranceScale))
          entranceFactor =
            smoothstep01((entranceField - params.entranceThreshold) / ENTRANCE_BLEND_BAND) *
            params.entranceStrength *
            strength
          entranceFactorSq = entranceFactor * entranceFactor
        }

        // Ravine profile for this column. A low-frequency density mask culls
        // whole ravine lines so lowering density means fewer ravines, not
        // thinner ones.
        let ravineHalfWidth = 0
        let ravineAbs = Infinity
        let ravineDepthCol = 0
        if (params.ravineStrength > 0.001 && params.ravineWidth > 0 && params.ravineDensity > 0.001) {
          const mask = norm(this.sample2D(this.ravineModNoise, worldX, worldZ, components, (c) => c.params.ravineScale * 0.6, 2048))
          if (mask < params.ravineDensity) {
            const r = this.sample2D(this.ravineNoise, worldX, worldZ, components, (c) => c.params.ravineScale)
            ravineAbs = Math.abs(r)
            const widthMod =
              0.7 + 0.6 * norm(this.sample2D(this.ravineModNoise, worldX, worldZ, components, (c) => c.params.ravineScale * 2.7))
            ravineHalfWidth = params.ravineWidth * widthMod * params.ravineStrength * strength
            if (ravineAbs < ravineHalfWidth) {
              const depthMod =
                0.6 + 0.4 * norm(this.sample2D(this.ravineModNoise, worldX, worldZ, components, (c) => c.params.ravineScale * 1.3, 512))
              ravineDepthCol = params.ravineDepth * depthMod
            }
          }
        }

        // Spaghetti thickness for this column (swells and pinches along tunnels).
        let spagBaseThickness = 0
        if (params.spaghettiStrength > 0.001) {
          const mod = norm(this.thicknessNoise.noise2D(worldX * 0.008, worldZ * 0.008))
          const variance = params.spaghettiThicknessVariance
          spagBaseThickness =
            params.spaghettiThickness *
            (1 + variance * (mod * 2 - 1)) *
            params.spaghettiStrength *
            strength
        }

        const cheeseActive = params.cheeseStrength > 0.001
        // Fade cheese out smoothly at borders with cheese-disabled biomes.
        const cheeseStrengthPenalty = (1 - params.cheeseStrength * strength) * 2

        // Build interpolated noise Y-profiles for this column from the lattice.
        const tx = (localX % LATTICE_STEP) / LATTICE_STEP
        const tz = (localZ % LATTICE_STEP) / LATTICE_STEP
        const ix0 = Math.floor(localX / LATTICE_STEP)
        const iz0 = Math.floor(localZ / LATTICE_STEP)
        const w00 = (1 - tx) * (1 - tz)
        const w10 = tx * (1 - tz)
        const w01 = (1 - tx) * tz
        const w11 = tx * tz
        const c00 = (iz0 * LATTICE_XZ + ix0) * latYCount
        const c10 = (iz0 * LATTICE_XZ + ix0 + 1) * latYCount
        const c01 = ((iz0 + 1) * LATTICE_XZ + ix0) * latYCount
        const c11 = ((iz0 + 1) * LATTICE_XZ + ix0 + 1) * latYCount
        // Pipe eligibility for this column: pipes must reach full depth, so
        // they are gated per column (liquid guard, strength fade at borders)
        // but NOT by depth-varying terms.
        const pipeActive = anyPipes && !liquidGuarded && params.entranceStrength > 0.001 && params.entranceDepth > 1
        const pipeRequired = pipeActive
          ? Math.min(params.entranceThreshold + PIPE_MOUTH_OFFSET, PIPE_MOUTH_MAX) +
            (1 - params.entranceStrength * strength) * 2
          : Infinity

        for (let iy = 0; iy < latYCount; iy++) {
          colCheese[iy] =
            latCheese[c00 + iy] * w00 + latCheese[c10 + iy] * w10 + latCheese[c01 + iy] * w01 + latCheese[c11 + iy] * w11
          colSpag1[iy] =
            latSpag1[c00 + iy] * w00 + latSpag1[c10 + iy] * w10 + latSpag1[c01 + iy] * w01 + latSpag1[c11 + iy] * w11
          colSpag2[iy] =
            latSpag2[c00 + iy] * w00 + latSpag2[c10 + iy] * w10 + latSpag2[c01 + iy] * w01 + latSpag2[c11 + iy] * w11
          if (pipeActive) {
            colPipe[iy] =
              latPipe[c00 + iy] * w00 + latPipe[c10 + iy] * w10 + latPipe[c01 + iy] * w01 + latPipe[c11 + iy] * w11
          }
        }

        const invFloorFade = 1 / params.floorFadeDepth
        const invSurfaceFalloff = 1 / params.surfaceFalloffDepth
        // Unified cheese surface term: falloff tightening and entrance-core
        // boost share the SAME depth curve (surfaceCloseness). This keeps
        // the effective threshold monotone toward the surface — if the two
        // decayed at different rates, a mid-depth "sweet spot" would carve
        // bowls sealed under a solid lid a few blocks thick.
        const cheeseSurfaceTerm =
          SURFACE_TIGHTEN * (1 - entranceFactorSq) - params.entranceBoost * entranceFactorSq

        for (let worldY = yHi; worldY >= yLo; worldY--) {
          const storageY = worldY - storageYOffset
          const blockId = blocks.getBlockId(localX, storageY, localZ)
          if (blockId === BlockIds.AIR) continue

          const depthBelowSurface = surfaceY - worldY

          // Ravine: tapered canyon open to the sky.
          let carve = false
          if (ravineDepthCol > 0 && depthBelowSurface < ravineDepthCol) {
            const t = depthBelowSurface / ravineDepthCol
            const allowedHalf = ravineHalfWidth * (1 - params.ravineTaper * t)
            if (ravineAbs < allowedHalf) {
              carve = true
            }
          }

          // Entrance pipe: a slanted constant-cross-section ramp carved
          // where the sheared entrance field exceeds the mouth requirement.
          // Driven by a 2D field independent of the cave fields, and the
          // requirement is depth-constant, so every mouth continues from
          // the surface all the way to entranceDepth (no blind stubs).
          if (!carve && depthBelowSurface < params.entranceDepth && pipeRequired < Infinity) {
            const iy = (worldY - latY0) / LATTICE_STEP
            const iyBase = Math.floor(iy)
            const ty = iy - iyBase
            const pipe = norm(colPipe[iyBase] + (colPipe[iyBase + 1] - colPipe[iyBase]) * ty)
            if (pipe > pipeRequired) {
              carve = true
            }
          }

          // Surface falloff: caves pinch closed near the surface, except in
          // entrance zone cores where the falloff is cancelled.
          const surfaceCloseness = clamp01(1 - depthBelowSurface * invSurfaceFalloff)
          const opening = surfaceCloseness * (1 - entranceFactorSq)
          const floorFade = clamp01((worldY - params.minY) * invFloorFade)

          // Cheese caverns. Inside entrance cores the surface term goes
          // negative, opening craters that are guaranteed to breach.
          if (!carve && cheeseActive) {
            const iy = (worldY - latY0) / LATTICE_STEP
            const iyBase = Math.floor(iy)
            const ty = iy - iyBase
            const cheese = colCheese[iyBase] + (colCheese[iyBase + 1] - colCheese[iyBase]) * ty
            const threshold =
              params.cheeseThreshold +
              surfaceCloseness * cheeseSurfaceTerm +
              (1 - floorFade) * FLOOR_TIGHTEN +
              cheeseStrengthPenalty
            if (cheese > threshold) {
              carve = true
            }
          }

          // Spaghetti tunnels.
          if (!carve && spagBaseThickness > 0) {
            const iy = (worldY - latY0) / LATTICE_STEP
            const iyBase = Math.floor(iy)
            const ty = iy - iyBase
            const s1 = Math.abs(colSpag1[iyBase] + (colSpag1[iyBase + 1] - colSpag1[iyBase]) * ty)
            const s2 = Math.abs(colSpag2[iyBase] + (colSpag2[iyBase + 1] - colSpag2[iyBase]) * ty)
            const sMax = s1 > s2 ? s1 : s2
            const thickness = spagBaseThickness * (1 - opening) * floorFade
            if (sMax < thickness) {
              carve = true
            }
          }

          if (!carve) continue

          // Never carve liquids (preserves lakes, lava pools, prior floods).
          if (isLiquidBlock(blockId)) continue

          const floodId = params.floodBlockId
          if (floodId !== 0 && floodId !== BlockIds.AIR && worldY <= params.floodLevel) {
            blocks.setBlockId(localX, storageY, localZ, floodId)
          } else {
            blocks.setBlockId(localX, storageY, localZ, BlockIds.AIR)
          }
        }
      }
    }
  }
}
