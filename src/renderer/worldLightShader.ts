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
 * Cloud shadows (renderer/clouds/VolumetricClouds.ts): a world-anchored,
 * repeat-wrapped map of how much sunlight gets through the clouds to the
 * ground (transmittance, r), at CLOUD_SHADOW_REF_Y. Only the direct light
 * (sun or moon) is dimmed: the sky still lights a shadowed field. Shared by
 * every world-lit material (attach `cloudShadowUniforms` next to the
 * daylight uniform - a material whose shader has the sampler but not the
 * uniform would leave it on texture unit 0).
 */
export const CLOUD_SHADOW_REF_Y = 260

function whiteTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  texture.needsUpdate = true
  return texture
}

/** x = 1 / the map's span (blocks), y = strength (0 none), zw = the light's direction xz / its y. */
export const cloudShadowParams = { x: 1 / 2048, y: 0, z: 0, w: 0 }
export const cloudShadowUniforms: Record<string, THREE.IUniform> = {
  uCloudShadow: { value: whiteTexture() },
  uCloudShadowParams: { value: cloudShadowParams },
}

/** Hand the cloud shadow map to every world-lit material. */
export function setCloudShadowMap(texture: THREE.Texture, invSpan: number): void {
  cloudShadowUniforms.uCloudShadow.value = texture
  cloudShadowParams.x = invSpan
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
uniform sampler2D uCloudShadow;
uniform vec4 uCloudShadowParams;
${LIGHT_CURVE_GLSL}
// Sunlight let through by the clouds at world position wp (slid along the light to the map's height), fading
// out with distance (the map reaches about a kilometre)
float slopCloudShadow( vec3 wp ) {
  if ( uCloudShadowParams.y <= 0.0 ) return 1.0;
  vec2 xz = wp.xz + uCloudShadowParams.zw * ( ${CLOUD_SHADOW_REF_Y}.0 - wp.y );
  float through = texture2D( uCloudShadow, xz * uCloudShadowParams.x ).r;
  float reach = 1.0 - smoothstep( 700.0, 950.0, length( wp.xz - cameraPosition.xz ) );
  return mix( 1.0, through, uCloudShadowParams.y * reach );
}
`

/**
 * GLSL block for a lit material's fragment shader, inserted after
 * `#include <aomap_fragment>` (three's reflected light is complete there):
 * the scene's sun/hemisphere/ambient lighting is scaled by the sky light curve
 * × uDaylight (a sun-facing cave wall stays dark), block light adds its own
 * warm, non-directional term where the sky leaves headroom, and a small floor
 * keeps caves from pure black. The floor fades out as sky light rises, so
 * open sky (level 15, full daylight) shades exactly like the plain scene
 * lights. Diffuse terms are multiplied by `ao`; emissive is untouched. The
 * direct (sun/moon) light is dimmed where clouds shade the ground
 * (slopCloudShadow; needs the fog's world offset, so fogged materials only).
 *
 * @param sky GLSL expression: sky light level (0-15, may be fractional)
 * @param block GLSL expression: block light level (0-15, may be fractional)
 * @param ao GLSL expression: ambient-occlusion multiplier (0-1)
 * @param flicker GLSL expression: block-light colour multiplier, float or vec3 (FlickerLights.ts: firelight)
 */
export function worldLightFragment(sky: string, block: string, ao: string, flicker = '1.0'): string {
  return /* glsl */ `
{
  float worldAo = ${ao};
  float worldSky = slopLightShape( ${sky} ) * uDaylight;
  float worldBlock = min( slopBlockLightShape( ${block} ), 1.0 - worldSky ) * BLOCK_LIGHT_STRENGTH;
  #ifdef USE_FOG
    float worldCloud = slopCloudShadow( cameraPosition + vFogOffset );
  #else
    float worldCloud = 1.0;
  #endif
  reflectedLight.directDiffuse *= worldSky * worldAo * worldCloud;
  reflectedLight.indirectDiffuse *= worldSky * worldAo;
  reflectedLight.directSpecular *= worldSky * worldCloud;
  reflectedLight.indirectSpecular *= worldSky;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * ( BLOCK_LIGHT_COLOR * ( ${flicker} ) * worldBlock + uLightFloor * ( 1.0 - worldSky ) ) * worldAo;
}
`
}
