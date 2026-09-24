import * as THREE from 'three'
import { LIGHT_CURVE_DEFINES, LIGHT_CURVE_GLSL, LIGHT_FLOOR } from './lightCurve.ts'

/**
 * Shader side of the world light model, shared by every surface lit by world
 * light levels (greedy chunk meshes, instanced blocks): the daylight uniform
 * and the GLSL that turns (sky, block) light levels into lighting, mirroring
 * lightLevelsToColor() in lightCurve.ts.
 */

/** Shared uniform: sky brightness 0-1 (1 = full day). One object for all programs. */
export const daylightUniform = { value: 1.0 }

/**
 * Set how bright the sky is (0-1). Scales everything lit by skylight; block
 * light is unaffected. Ready for a day/night cycle.
 */
export function setWorldDaylight(value: number): void {
  daylightUniform.value = value
}

/** Current sky brightness (for CPU-side lighting: held item, entities). */
export function getWorldDaylight(): number {
  return daylightUniform.value
}

/**
 * Shared uniform: the light floor - linear RGB light that remains where no sky
 * or block light reaches (fading out as sky light rises). LIGHT_FLOOR grey by
 * default (caves barely show their shape); the atmosphere raises and tints it
 * where the darkness is ambient, e.g. Hell's red glow. One object for all
 * programs.
 */
export const lightFloorUniform = { value: new THREE.Color(LIGHT_FLOOR, LIGHT_FLOOR, LIGHT_FLOOR) }

/** Set the light floor (linear RGB). Cheap - call every frame with the eased value. */
export function setWorldLightFloor(color: THREE.Color): void {
  lightFloorUniform.value.copy(color)
}

/** Current light floor (for CPU-side lighting: held item, entities). */
export function getWorldLightFloor(): THREE.Color {
  return lightFloorUniform.value
}

/**
 * LIGHT_CURVE_DEFINES as `#define` lines, for patches that can't use
 * `material.defines` (shared materials: defines would reach every variant).
 */
export const LIGHT_CURVE_DEFINES_GLSL = Object.entries(LIGHT_CURVE_DEFINES)
  .map(([name, value]) => `#define ${name} ${value}`)
  .join('\n')

/**
 * Fragment declarations for worldLightFragment(). Requires the light curve
 * defines (material.defines = LIGHT_CURVE_DEFINES, or LIGHT_CURVE_DEFINES_GLSL).
 */
export const WORLD_LIGHT_FRAGMENT_PARS = /* glsl */ `
uniform float uDaylight;
uniform vec3 uLightFloor;
${LIGHT_CURVE_GLSL}
`

/**
 * GLSL block for a lit material's fragment shader, inserted after
 * `#include <aomap_fragment>` (three's reflected light is complete there):
 * the scene's sun/hemisphere/ambient lighting is scaled by the sky light curve
 * × uDaylight (a sun-facing cave wall stays dark), block light adds its own
 * warm, non-directional term where the sky leaves headroom, and a small floor
 * keeps caves from pure black. The floor fades out as sky light rises, so
 * open sky (level 15, full daylight) shades exactly like the plain scene
 * lights. Diffuse terms are multiplied by `ao`; emissive is untouched.
 *
 * @param sky GLSL expression: sky light level (0-15, may be fractional)
 * @param block GLSL expression: block light level (0-15, may be fractional)
 * @param ao GLSL expression: ambient-occlusion multiplier (0-1)
 */
export function worldLightFragment(sky: string, block: string, ao: string): string {
  return /* glsl */ `
{
  float worldAo = ${ao};
  float worldSky = slopLightShape( ${sky} ) * uDaylight;
  float worldBlock = min( slopBlockLightShape( ${block} ), 1.0 - worldSky ) * BLOCK_LIGHT_STRENGTH;
  reflectedLight.directDiffuse *= worldSky * worldAo;
  reflectedLight.indirectDiffuse *= worldSky * worldAo;
  reflectedLight.directSpecular *= worldSky;
  reflectedLight.indirectSpecular *= worldSky;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * ( BLOCK_LIGHT_COLOR * worldBlock + uLightFloor * ( 1.0 - worldSky ) ) * worldAo;
}
`
}
