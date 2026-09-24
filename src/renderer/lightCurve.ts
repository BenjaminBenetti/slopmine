/**
 * Light level (0-15) → brightness mapping. Single source of truth for every
 * surface lit by world light: greedy chunk meshes (via the GLSL mirror below),
 * instanced blocks, liquids, the held item and entities. A surface lit
 * outside the chunk shader uses worldLightTerms (shaded by the scene lights,
 * e.g. the held item and mobs) or lightLevelsToColor (one flat tint), always
 * with the live daylight and light floor (worldLightShader's
 * getWorldDaylight / getWorldLightFloor) - never the bare curve.
 *
 * Light semantics are Minecraft's: skylight 15 under open sky, −1 per block of
 * travel. The curve follows Minecraft's lightmap: its hyperbolic world
 * brightness table `x / (4 - 3x)` (already halved at level 12, so shade under
 * canopies and overhangs stays visible), lifted halfway toward
 * `1 - (1 - b)^4` like MC's default "brightness 50%" slider. That curve lives
 * in display (sRGB-like) space, so it is linearised with LIGHT_GAMMA before it
 * scales linear shading. There is deliberately no knee: every level from 15
 * down is a visible step.
 *
 * Pure math, no three.js import: the greedy mesh worker imports this file.
 */

/** Minecraft-style brightness slider: 0 = "Moody", 0.5 = MC default, 1 = "Bright". */
export const LIGHT_LIFT = 0.5

/**
 * The same slider for block light (torches, lava, glowing blocks). Lifted
 * further than sky light so a torch fills a small room with warm light
 * (4 blocks away ≈ 36% instead of 21%) while unlit caves stay as dark as
 * the sky curve makes them.
 */
export const BLOCK_LIGHT_LIFT = 0.8

/** Display gamma used to linearise the perceptual curve. */
export const LIGHT_GAMMA = 2.2

/**
 * Non-directional brightness floor (linear) so a pitch-black cave still shows
 * its shape. Applied on top of the curve, never scaled by the sun, and fading
 * out as sky light rises so level 15 in full daylight stays exactly 1.0.
 */
export const LIGHT_FLOOR = 0.025

/** Warm torch/lava tint for block light (linear RGB; ≈ sRGB #ffdaab). */
export const BLOCK_LIGHT_COLOR: readonly [number, number, number] = [1.0, 0.7, 0.42]

/**
 * Strength of block light relative to albedo. Block light is added as its own
 * non-directional term (a torch lights every face of a cave equally); at full
 * strength a torch-lit face reads about as bright as a sunlit top face (the
 * warm tint keeps its luminance near the sun rig's 0.83).
 */
export const BLOCK_LIGHT_STRENGTH = 1.0

/**
 * Ambient-occlusion brightness per vertex AO level (0 = both edge neighbours
 * solid … 3 = unoccluded). Linear multipliers, interpolated across the face.
 */
export const AO_BRIGHTNESS: readonly [number, number, number, number] = [0.35, 0.55, 0.78, 1.0]

/**
 * Curve shape for a (possibly fractional, smooth-lit) light level, 0 at level
 * 0 and 1 at level 15 (sky light by default; `lift` selects the slider).
 * Mirrors `slopLightShape` in LIGHT_CURVE_GLSL.
 */
export function lightShape(level: number, lift: number = LIGHT_LIFT): number {
  const x = Math.min(Math.max(level / 15, 0), 1)
  const base = x / (4 - 3 * x)
  const inv = 1 - base
  const lifted = base + (1 - inv * inv * inv * inv - base) * lift
  return Math.pow(lifted, LIGHT_GAMMA)
}

/** Block-light curve shape (lightShape with BLOCK_LIGHT_LIFT); mirrors `slopBlockLightShape`. */
export function blockLightShape(level: number): number {
  return lightShape(level, BLOCK_LIGHT_LIFT)
}

const DEFAULT_FLOOR = { r: LIGHT_FLOOR, g: LIGHT_FLOOR, b: LIGHT_FLOOR }

/** A linear RGB light colour (read-only view). */
type LightRgb = { readonly r: number; readonly g: number; readonly b: number }

/**
 * The world light model split the way the chunk shader applies it
 * (worldLightFragment): `sky` scales the scene's lights (sun, hemisphere,
 * ambient - so a surface still shades by its normal), and (r, g, b) is
 * non-directional light added on top at full strength (no /π, no normal):
 * warm block light where the sky leaves headroom plus the light floor.
 * Lighting a surface outside the chunk shader (held item, mobs) must keep the
 * two apart - folding the non-directional part into the scene lights shades
 * torch-lit faces 24-59% darker than the terrain beside them.
 *
 * @param daylight 0-1 sky brightness (1 = full day)
 * @param out Receives sky (0-1 scale for the scene lights) and r, g, b
 * @param floor Light floor (linear RGB, default LIGHT_FLOOR grey), the
 *   shader's uLightFloor - see worldLightShader.getWorldLightFloor()
 */
export function worldLightTerms(
  skyLevel: number,
  blockLevel: number,
  daylight: number,
  out: { sky: number; r: number; g: number; b: number },
  floor: LightRgb = DEFAULT_FLOOR
): void {
  const sky = lightShape(skyLevel) * daylight
  const block = Math.min(blockLightShape(blockLevel), 1 - sky) * BLOCK_LIGHT_STRENGTH
  const dark = 1 - sky
  out.sky = sky
  out.r = floor.r * dark + BLOCK_LIGHT_COLOR[0] * block
  out.g = floor.g * dark + BLOCK_LIGHT_COLOR[1] * block
  out.b = floor.b * dark + BLOCK_LIGHT_COLOR[2] * block
}

const terms = { sky: 0, r: 0, g: 0, b: 0 }

/**
 * Linear RGB multiplier for separate sky and block light levels: the sum of
 * worldLightTerms (sky light plus the non-directional block light and
 * floor). Block light adds warm light only where the sky leaves headroom
 * (Minecraft's lightmap saturates the same way, so torches barely show in
 * daylight). Right for anything tinted by one colour regardless of its
 * normal (e.g. the underwater haze); surfaces shaded by the scene lights
 * need worldLightTerms.
 *
 * @param daylight 0-1 sky brightness (1 = full day)
 * @param out Receives r, g, b
 * @param floor Light floor (linear RGB, default LIGHT_FLOOR grey), the
 *   shader's uLightFloor - see worldLightShader.getWorldLightFloor()
 */
export function lightLevelsToColor(
  skyLevel: number,
  blockLevel: number,
  daylight: number,
  out: { r: number; g: number; b: number },
  floor: LightRgb = DEFAULT_FLOOR
): void {
  worldLightTerms(skyLevel, blockLevel, daylight, terms, floor)
  out.r = terms.sky + terms.r
  out.g = terms.sky + terms.g
  out.b = terms.sky + terms.b
}

function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

/**
 * Shader defines carrying the constants above (inject via `material.defines`
 * so GLSL and TypeScript can't drift apart).
 */
export const LIGHT_CURVE_DEFINES: Readonly<Record<string, string>> = {
  LIGHT_LIFT: glslFloat(LIGHT_LIFT),
  BLOCK_LIGHT_LIFT: glslFloat(BLOCK_LIGHT_LIFT),
  LIGHT_GAMMA: glslFloat(LIGHT_GAMMA),
  LIGHT_FLOOR: glslFloat(LIGHT_FLOOR),
  BLOCK_LIGHT_STRENGTH: glslFloat(BLOCK_LIGHT_STRENGTH),
  BLOCK_LIGHT_COLOR: `vec3( ${BLOCK_LIGHT_COLOR.map(glslFloat).join(', ')} )`,
}

/** GLSL mirror of lightShape() / blockLightShape(); requires LIGHT_CURVE_DEFINES. */
export const LIGHT_CURVE_GLSL = /* glsl */ `
float slopLightShapeLift( float level, float lift ) {
  float x = clamp( level / 15.0, 0.0, 1.0 );
  float base = x / ( 4.0 - 3.0 * x );
  float inv = 1.0 - base;
  inv *= inv;
  float lifted = mix( base, 1.0 - inv * inv, lift );
  return pow( lifted, LIGHT_GAMMA );
}
float slopLightShape( float level ) {
  return slopLightShapeLift( level, LIGHT_LIFT );
}
float slopBlockLightShape( float level ) {
  return slopLightShapeLift( level, BLOCK_LIGHT_LIFT );
}
`
