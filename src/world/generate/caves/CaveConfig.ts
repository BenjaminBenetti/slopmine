/**
 * Configuration for the noise-density cave system.
 *
 * Caves are carved from a continuous 3D density field instead of traced worm
 * paths, so generation is purely local per block: deterministic across chunk
 * seams with no cross-chunk bookkeeping. Three carving layers combine:
 *
 * - Cheese: 3D fractal noise above a threshold carves large open caverns.
 * - Spaghetti: two independent 3D noises; blocks where both are near zero
 *   form long winding tunnels whose thickness swells and pinches.
 * - Ravines: 2D ridge noise cuts deep tapered canyons open to the sky.
 *
 * Near the surface, caves pinch closed over `surfaceFalloffDepth` blocks —
 * except inside entrance zones (low-frequency 2D noise), where the falloff is
 * cancelled and carving is boosted so cave mouths open naturally onto the
 * surface and connect straight into the network below.
 *
 * All values are plain serializable scalars so biome configs pass to the
 * generation worker unchanged, and numeric parameters blend smoothly across
 * biome borders (see resolveCaveParams / lerpCaveParams).
 */

/** Large cavern carving via thresholded 3D fractal noise. */
export interface CheeseCaveConfig {
  readonly enabled: boolean
  /**
   * Noise threshold (-1..1) above which blocks are carved.
   * Lower values produce more and larger caverns. Typical: 0.35-0.6
   */
  readonly threshold: number
  /** Horizontal noise frequency per block. Lower = larger caverns. Typical: 0.008-0.02 */
  readonly scale: number
  /**
   * Vertical frequency multiplier. Values above 1 squash caverns into wide,
   * flat halls; below 1 stretches them into tall chambers. Typical: 1.0-2.0
   */
  readonly verticalScale: number
}

/** Winding tunnel carving via the intersection of two near-zero noise sheets. */
export interface SpaghettiCaveConfig {
  readonly enabled: boolean
  /**
   * Base tunnel half-thickness in noise units. Larger = wider tunnels.
   * Typical: 0.05-0.12
   */
  readonly thickness: number
  /**
   * How strongly tunnel thickness varies along the path (0-1).
   * 0 = uniform tubes, 1 = dramatic swells and pinches. Typical: 0.4-0.8
   */
  readonly thicknessVariance: number
  /** Noise frequency per block. Lower = longer, straighter tunnels. Typical: 0.008-0.02 */
  readonly scale: number
  /**
   * Vertical frequency multiplier. Values above 1 bias tunnels toward
   * horizontal passages (easier to walk). Typical: 1.0-2.0
   */
  readonly verticalSquash: number
}

/** Canyon carving via 2D ridge noise, open to the sky. */
export interface RavineConfig {
  readonly enabled: boolean
  /** 2D noise frequency. Lower = rarer, longer ravines. Typical: 0.002-0.005 */
  readonly scale: number
  /** Half-width of the carved band in noise units. Typical: 0.02-0.06 */
  readonly width: number
  /** Maximum depth in blocks below the surface. Typical: 40-80 */
  readonly depth: number
  /** How strongly the ravine narrows toward its floor (0-1). Typical: 0.6-0.85 */
  readonly taper: number
  /**
   * Fraction of potential ravine lines that actually form (normalized mask
   * threshold, 0-1). A low-frequency mask culls whole ravines rather than
   * thinning them: ~0.3 keeps roughly a quarter of the lines, 1 keeps all.
   */
  readonly density: number
  /**
   * Multiplier on `density` (0-1) applied only in liquid-guarded columns
   * (surface at or below liquidSurfaceGuardY — lake and pool beds). Guarded
   * columns require mask < density * poolCrossDensity while open land keeps
   * mask < density, so a ravine that would slice under a pool is culled
   * unless its mask is in the strongest poolCrossDensity fraction.
   *
   * WHY this seals ~(1 - poolCrossDensity) of pool crossings cleanly: the
   * mask is low-frequency (it culls whole lines, not individual columns), so
   * a given ravine's mask value is nearly constant along its length. Tightening
   * the threshold under pools therefore removes the ENTIRE under-pool segment
   * of most crossing ravines — terrain stays intact beneath the water — while
   * the strongest-mask fraction still crosses fully, leaving the occasional
   * intentional draining waterfall. Default ~0.25 (a quarter still cross).
   */
  readonly poolCrossDensity?: number
}

/** Surface entrance zones where cave carving is allowed to breach the surface. */
export interface EntranceConfig {
  readonly enabled: boolean
  /** 2D noise frequency for zone placement. Lower = larger, rarer zones. Typical: 0.003-0.008 */
  readonly scale: number
  /**
   * Normalized zone threshold (0-1). The 2D noise must exceed this for a
   * column to be an entrance zone; higher = rarer entrances. Typical: 0.55-0.7
   */
  readonly threshold: number
  /**
   * Cheese-threshold ease at the surface inside entrance zone cores,
   * fading with depth on the same curve as the surface falloff (so boosted
   * carving is always easiest AT the surface and craters can never form
   * sealed under a lid). Carves open mouths and craters. Typical: 0.3-0.7
   */
  readonly boost: number
  /**
   * How deep (blocks below surface) an entrance pipe can descend. Strong
   * entrance cores carve a guaranteed crater-and-throat shaft down to this
   * depth, connecting the mouth to the cave network regardless of what the
   * cave fields happen to do underneath. Typical: 40-60; 0 disables pipes.
   */
  readonly depth: number
}

/** One candidate lining block with its per-wall-block conversion chance. */
export interface CaveLiningEntry {
  readonly blockId: number
  /** Deterministic per-block conversion probability (0-1). */
  readonly chance: number
  /**
   * Optional world-Y band restriction: the entry only converts blocks at
   * minY <= worldY <= maxY (either bound may be omitted). Out-of-band the
   * entry still occupies its slice of the cumulative roll (it just places
   * nothing), so restricting one entry never shifts the deterministic
   * placement of the others. Used to keep e.g. sulfur near the surface
   * while obsidian lines the deep caves.
   */
  readonly minY?: number
  readonly maxY?: number
}

/**
 * Optional post-carve cave wall lining (e.g. volcanic obsidian/sulfur).
 *
 * Block identities cannot be interpolated, so lining is deliberately NOT part
 * of the blended CaveParams: the pass runs only in chunks whose PRIMARY biome
 * declares it, reading this config directly (slight under-lining at biome and
 * chunk borders is acceptable). Rolls use a coordinate hash of world position
 * and seed, never Math.random, so results are stable across regeneration.
 */
export interface CaveLiningConfig {
  /** Solid blocks eligible for conversion (already-placed ore veins survive). */
  readonly replaceableBlocks: readonly number[]
  /**
   * Candidates for solid blocks face-adjacent to carved cave air. A single
   * roll walks the cumulative chances, so entry chances should sum to < 1.
   */
  readonly wallBlocks: readonly CaveLiningEntry[]
  /** Rolled for solid blocks face-adjacent to lava (flood lava, lava lake beds). */
  readonly lavaContactBlock?: CaveLiningEntry
}

/**
 * Per-biome cave generation configuration.
 * Attach to BiomeProperties.caves. All fields are plain data (worker-safe).
 */
export interface CaveConfig {
  readonly enabled: boolean
  /** Lowest world Y where caves may exist. Keep above the terrain stone floor. */
  readonly minY: number
  /** Highest world Y where caves may exist. Set above max terrain height to let entrances breach. */
  readonly maxY: number
  /** Blocks over which caves pinch closed approaching minY (prevents flat clipped floors). */
  readonly floorFadeDepth: number
  /** Depth below the surface where caves start closing up, outside entrance zones. */
  readonly surfaceFalloffDepth: number
  readonly cheese: CheeseCaveConfig
  readonly spaghetti: SpaghettiCaveConfig
  readonly ravine: RavineConfig
  readonly entrance: EntranceConfig
  /**
   * Carved blocks at or below this world Y are flooded with a liquid instead
   * of air. Set to minY or lower to disable. Default: disabled.
   */
  readonly floodLevel?: number
  /** Block ID used for flooding below floodLevel (e.g. lava or swamp water). */
  readonly floodBlockId?: number
  /**
   * Columns whose surface height is at or below this Y suppress entrances and
   * ravines, so caves don't tear open the beds of lakes and pools.
   * Set to the biome's waterLevel + 2. Default: disabled.
   */
  readonly liquidSurfaceGuardY?: number
  /**
   * Optional mineral lining sprinkled on cave walls after carving and
   * features (see CaveLiningConfig). Non-blended: applied only in chunks
   * whose primary biome sets it. Default: no lining.
   */
  readonly lining?: CaveLiningConfig
}

/**
 * Fully-resolved flat numeric parameters used by the carver.
 * Every field is a plain number so parameters can be blended per-column
 * across biome borders with simple lerps. `enabled` booleans become 0/1
 * strength multipliers that fade layers in and out smoothly.
 */
export interface CaveParams {
  /** Master strength 0-1 (0 disables all carving). */
  strength: number
  minY: number
  maxY: number
  floorFadeDepth: number
  surfaceFalloffDepth: number
  cheeseStrength: number
  cheeseThreshold: number
  cheeseScale: number
  cheeseVerticalScale: number
  spaghettiStrength: number
  spaghettiThickness: number
  spaghettiThicknessVariance: number
  spaghettiScale: number
  spaghettiVerticalSquash: number
  ravineStrength: number
  ravineScale: number
  ravineWidth: number
  ravineDepth: number
  ravineTaper: number
  ravineDensity: number
  ravinePoolCrossDensity: number
  entranceStrength: number
  entranceScale: number
  entranceThreshold: number
  entranceBoost: number
  entranceDepth: number
  floodLevel: number
  floodBlockId: number
  liquidSurfaceGuardY: number
}

/** Sensible baseline: balanced caverns, tunnels, occasional ravines and entrances. */
export const DEFAULT_CAVE_CONFIG: CaveConfig = {
  enabled: true,
  minY: 146,
  maxY: 320,
  floorFadeDepth: 10,
  surfaceFalloffDepth: 16,
  cheese: {
    enabled: true,
    threshold: 0.42,
    scale: 0.012,
    verticalScale: 1.5,
  },
  spaghetti: {
    enabled: true,
    thickness: 0.08,
    thicknessVariance: 0.6,
    scale: 0.012,
    verticalSquash: 1.5,
  },
  ravine: {
    enabled: true,
    scale: 0.003,
    width: 0.035,
    depth: 55,
    taper: 0.75,
    density: 0.3,
    poolCrossDensity: 0.25,
  },
  entrance: {
    enabled: true,
    scale: 0.005,
    threshold: 0.8,
    boost: 0.55,
    depth: 50,
  },
}

/**
 * One contributing biome in a per-column blend: its fully-resolved params
 * and its blend weight. Weights across a component list sum to 1.
 *
 * Frequency-like parameters (noise scales, vertical scale/squash) must NEVER
 * be interpolated directly: evaluating noise at position * lerp(scaleA, scaleB)
 * makes the phase x*s(x), whose effective frequency grows without bound with
 * distance from the origin. Instead the carver evaluates each component's
 * noise field at that component's own constant scales and blends the FIELD
 * VALUES by weight — the same approach terrain height blending uses.
 */
export interface CaveParamsComponent {
  params: CaveParams
  weight: number
}

/**
 * Per-column blend sample: `params` holds scalar (scale-free) parameters
 * already mixed by weight; `components` carries the per-biome params and
 * weights for value-blending the noise fields.
 */
export interface CaveSample {
  params: CaveParams
  components: readonly CaveParamsComponent[]
}

/**
 * Getter for the blended cave sample at a world position.
 * Returned objects (and their component arrays) are scratch space, only
 * guaranteed valid until the next invocation.
 */
export type CaveSampleGetter = (worldX: number, worldZ: number) => CaveSample

const DISABLED_PARAMS: CaveParams = Object.freeze({
  strength: 0,
  minY: 0,
  maxY: 0,
  floorFadeDepth: 1,
  surfaceFalloffDepth: 1,
  cheeseStrength: 0,
  cheeseThreshold: 1,
  cheeseScale: 0.012,
  cheeseVerticalScale: 1.5,
  spaghettiStrength: 0,
  spaghettiThickness: 0,
  spaghettiThicknessVariance: 0,
  spaghettiScale: 0.012,
  spaghettiVerticalSquash: 1.5,
  ravineStrength: 0,
  ravineScale: 0.003,
  ravineWidth: 0,
  ravineDepth: 0,
  ravineTaper: 0.75,
  ravineDensity: 0,
  ravinePoolCrossDensity: 0.25,
  entranceStrength: 0,
  entranceScale: 0.005,
  entranceThreshold: 1,
  entranceBoost: 0,
  entranceDepth: 0,
  floodLevel: -1,
  floodBlockId: 0,
  liquidSurfaceGuardY: -1,
})

/**
 * Resolve a (possibly missing) biome cave config into flat carver parameters.
 * A missing or disabled config resolves to zero strength, which blends
 * smoothly against enabled neighbors at biome borders.
 */
export function resolveCaveParams(config: CaveConfig | undefined): CaveParams {
  if (!config || !config.enabled) {
    return { ...DISABLED_PARAMS }
  }
  return {
    strength: 1,
    minY: config.minY,
    maxY: config.maxY,
    floorFadeDepth: Math.max(1, config.floorFadeDepth),
    surfaceFalloffDepth: Math.max(1, config.surfaceFalloffDepth),
    cheeseStrength: config.cheese.enabled ? 1 : 0,
    cheeseThreshold: config.cheese.threshold,
    cheeseScale: config.cheese.scale,
    cheeseVerticalScale: config.cheese.verticalScale,
    spaghettiStrength: config.spaghetti.enabled ? 1 : 0,
    spaghettiThickness: config.spaghetti.thickness,
    spaghettiThicknessVariance: config.spaghetti.thicknessVariance,
    spaghettiScale: config.spaghetti.scale,
    spaghettiVerticalSquash: config.spaghetti.verticalSquash,
    ravineStrength: config.ravine.enabled ? 1 : 0,
    ravineScale: config.ravine.scale,
    ravineWidth: config.ravine.width,
    ravineDepth: config.ravine.depth,
    ravineTaper: config.ravine.taper,
    ravineDensity: config.ravine.density,
    ravinePoolCrossDensity: config.ravine.poolCrossDensity ?? 0.25,
    entranceStrength: config.entrance.enabled ? 1 : 0,
    entranceScale: config.entrance.scale,
    entranceThreshold: config.entrance.threshold,
    entranceBoost: config.entrance.boost,
    entranceDepth: config.entrance.depth,
    floodLevel: config.floodLevel ?? -1,
    floodBlockId: config.floodBlockId ?? 0,
    liquidSurfaceGuardY: config.liquidSurfaceGuardY ?? -1,
  }
}

/** Fields blended as plain weighted means. Scale-like fields are included:
 * the mixed value is only used for scalar math (never fed to noise — the
 * carver uses per-component scales for field evaluation). */
const MIXED_FIELDS = [
  'strength',
  'minY',
  'maxY',
  'floorFadeDepth',
  'surfaceFalloffDepth',
  'cheeseStrength',
  'cheeseThreshold',
  'cheeseScale',
  'cheeseVerticalScale',
  'spaghettiStrength',
  'spaghettiThickness',
  'spaghettiThicknessVariance',
  'spaghettiScale',
  'spaghettiVerticalSquash',
  'ravineStrength',
  'ravineScale',
  'ravineWidth',
  'ravineDepth',
  'ravineTaper',
  'ravineDensity',
  'ravinePoolCrossDensity',
  'entranceStrength',
  'entranceThreshold',
  'entranceScale',
  'entranceBoost',
  'entranceDepth',
] as const

/**
 * Mix resolved param sets by weight into `out` (no allocation).
 *
 * Special fields:
 * - floodBlockId: block identity can't be interpolated — the dominant
 *   (max-weight) component's block is used.
 * - floodLevel: weighted mean, floored to a whole block so flood surfaces
 *   are flat; when components disagree on the flood block, the minimum
 *   level wins so mismatched liquids only meet deep down and rarely.
 * - liquidSurfaceGuardY: the strictest (max) guard wins rather than lerping
 *   toward "disabled" — pools protected by the chunk's primary biome still
 *   generate throughout the blend zone.
 */
export function mixCaveParams(components: readonly CaveParamsComponent[], out: CaveParams): CaveParams {
  if (components.length === 1) {
    Object.assign(out, components[0].params)
    return out
  }

  for (const field of MIXED_FIELDS) {
    let sum = 0
    for (const c of components) {
      sum += c.params[field] * c.weight
    }
    out[field] = sum
  }

  let dominant = components[0]
  let guard = -1
  let floodLevel = 0
  let minActiveFloodLevel = Infinity
  for (const c of components) {
    if (c.weight > dominant.weight) dominant = c
    if (c.weight > 0.001) {
      if (c.params.liquidSurfaceGuardY > guard) guard = c.params.liquidSurfaceGuardY
      if (c.params.floodLevel < minActiveFloodLevel) minActiveFloodLevel = c.params.floodLevel
    }
    floodLevel += c.params.floodLevel * c.weight
  }
  let floodDisagreement = false
  for (const c of components) {
    if (
      c.weight > 0.001 &&
      c.params.floodBlockId !== 0 &&
      dominant.params.floodBlockId !== 0 &&
      c.params.floodBlockId !== dominant.params.floodBlockId
    ) {
      floodDisagreement = true
      break
    }
  }
  out.floodBlockId = dominant.params.floodBlockId
  out.floodLevel = Math.floor(floodDisagreement ? minActiveFloodLevel : floodLevel)
  out.liquidSurfaceGuardY = guard
  return out
}

/** Allocate a mutable params object for use as mix scratch space. */
export function cloneCaveParams(params: CaveParams): CaveParams {
  return { ...params }
}

/**
 * Sample getter for unblended contexts (single-biome paths): every column
 * resolves to the same single-component sample.
 */
export function createConstantCaveSampleGetter(config: CaveConfig | undefined): CaveSampleGetter {
  const params = resolveCaveParams(config)
  const sample: CaveSample = { params, components: [{ params, weight: 1 }] }
  return () => sample
}
