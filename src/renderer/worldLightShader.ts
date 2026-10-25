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
/**
 * God rays light the air up to about the cloud base (world Y), how much shadowed haze darkens (half: the sky
 * still lights air in cloud shadow - at 1.0 every view under broken cloud read a little dim) and lit haze glows.
 */
const GOD_RAY_TOP_Y = 430
const GOD_RAY_SHADOW = '0.5'
const GOD_RAY_GLOW = '0.9'
const GOD_RAY_DENSITY = '3.5'

function whiteTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  texture.needsUpdate = true
  return texture
}

/** x = 1 / the map's span (blocks), y = strength (0 none), zw = the light's direction xz / its y. */
export const cloudShadowParams = { x: 1 / 2048, y: 0, z: 0, w: 0 }
/** The light god rays shine with: direction (xyz, toward it) and its colour (rgb in x/y/z of the second). */
export const godRaySun = { x: 0, y: 1, z: 0, w: 0 }
export const godRaySunColor = { x: 1, y: 1, z: 1 }
/**
 * x = the air's scattering per block (its haze), y = 0-1 how much (none in caves or under water),
 * zw = 1 / the screen's size (pixels), for reading the god ray map.
 */
export const godRayParams = { x: 1 / 1500, y: 0, z: 1, w: 1 }
export const cloudShadowUniforms: Record<string, THREE.IUniform> = {
  uCloudShadow: { value: whiteTexture() },
  uCloudShadowParams: { value: cloudShadowParams },
  uGodRaySun: { value: godRaySun },
  uGodRaySunColor: { value: godRaySunColor },
  uGodRayParams: { value: godRayParams },
  // The god rays along each pixel's view (VolumetricClouds: r = the share of the ray's haze in sunlight, g = all
  // its haze), from the last frame on the land (it is rendered after the land draws)
  uGodRayMap: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
}
;(cloudShadowUniforms.uGodRayMap.value as THREE.DataTexture).needsUpdate = true

/** Hand this frame's god ray map (screen space) to the land and the sky. */
export function setGodRayMap(texture: THREE.Texture, screenWidth: number, screenHeight: number): void {
  cloudShadowUniforms.uGodRayMap.value = texture
  godRayParams.z = 1 / Math.max(1, screenWidth)
  godRayParams.w = 1 / Math.max(1, screenHeight)
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
export const CLOUD_LIGHT_GLSL = /* glsl */ `
#define SLOP_CLOUD_SHADOW
#ifndef SLOP_CAMERA
  #define SLOP_CAMERA cameraPosition
#endif
#ifndef SLOP_JITTER
  #define SLOP_JITTER 0.0
#endif
uniform sampler2D uCloudShadow;
uniform sampler2D uGodRayMap;
uniform vec4 uCloudShadowParams;
uniform vec4 uGodRaySun;
uniform vec3 uGodRaySunColor;
uniform vec4 uGodRayParams;
// Sunlight let through by the clouds at world position wp (slid along the light to the map's height), fading
// out with distance (the map reaches about a kilometre)
float slopCloudShadow( vec3 wp ) {
  if ( uCloudShadowParams.y <= 0.0 ) return 1.0;
  vec2 xz = wp.xz + uCloudShadowParams.zw * ( ${CLOUD_SHADOW_REF_Y}.0 - wp.y );
  float through = texture2D( uCloudShadow, xz * uCloudShadowParams.x ).r;
  float reach = 1.0 - smoothstep( 750.0, 980.0, length( wp.xz - SLOP_CAMERA.xz ) );
  return mix( 1.0, through, uCloudShadowParams.y * reach );
}
// God rays: the air along a view ray (up to \`dist\`, below the clouds) scatters the sunlight that reaches it.
// x = haze lit by the sun, y = all the haze (both as the share of the view they cover).
vec2 slopGodRays( vec3 cam, vec3 dir, float dist ) {
  float strength = uGodRaySun.w * uGodRayParams.y;
  if ( strength <= 0.0 ) return vec2( 0.0 );
  float end = min( dist, 1500.0 );
  if ( dir.y > 0.0 ) end = min( end, ( ${GOD_RAY_TOP_Y}.0 - cam.y ) / dir.y );
  if ( end <= 0.0 ) return vec2( 0.0 );
  const int steps = 10;
  float ds = end / float( steps );
  float jitter = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) + SLOP_JITTER );
  // (the shafts scatter as if the air were hazier than it looks: clear air alone barely shows them)
  float stepTrans = exp( - uGodRayParams.x * ${GOD_RAY_DENSITY} * ds );
  float trans = 1.0;
  float lit = 0.0;
  float total = 0.0;
  for ( int i = 0; i < steps; i++ ) {
    float w = trans * ( 1.0 - stepTrans );
    lit += w * slopCloudShadow( cam + dir * ( ( float( i ) + jitter ) * ds ) );
    total += w;
    trans *= stepTrans;
  }
  return vec2( lit, total ) * strength;
}
// The god rays seen along this pixel up to \`dist\` blocks: the god ray map's sunlit share of the ray (smooth,
// rendered at low resolution with temporal accumulation), applied to the haze up to that distance
vec2 slopGodRaysAt( float dist ) {
  vec4 map = texture2D( uGodRayMap, gl_FragCoord.xy * uGodRayParams.zw );
  if ( map.g <= 1e-4 ) return vec2( 0.0 );
  float haze = 1.0 - exp( - uGodRayParams.x * ${GOD_RAY_DENSITY} * min( dist, 1500.0 ) );
  float total = min( haze * uGodRaySun.w * uGodRayParams.y, map.g );
  return vec2( total * map.r / map.g, total );
}
// Haze in cloud shadow is darker (only the sky lights it); sunlit haze glows toward the sun, so the gaps between
// clouds pour shafts of light through the air
// \`amount\` = how much of \`color\` is haze (the fog's aerial haze on the land; the sky low down is all haze)
vec3 slopApplyGodRays( vec3 color, vec3 haze, float amount, vec3 dir, vec2 rays ) {
  if ( rays.y <= 0.0 ) return color;
  // A forward glow: a bright beam within ~15° of the sun over a soft wide one
  float c = max( dot( dir, uGodRaySun.xyz ), 0.0 );
  float c2 = c * c;
  float c8 = c2 * c2 * c2 * c2;
  float glow = c8 * c8 * 1.1 + c2 * c2 * 0.25;
  color -= haze * amount * ( 1.0 - rays.x / rays.y ) * ${GOD_RAY_SHADOW};
  color += uGodRaySunColor * glow * rays.x * ${GOD_RAY_GLOW};
  return max( color, vec3( 0.0 ) );
}
`

export const WORLD_LIGHT_FRAGMENT_PARS = /* glsl */ `
uniform float uDaylight;
uniform vec3 uLightFloor;
${CLOUD_LIGHT_GLSL}
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
 * lights. Diffuse terms are multiplied by `ao`; emissive is untouched. The
 * direct (sun/moon) light is dimmed where clouds shade the ground, and the
 * sky's a little (the cloud overhead hides some of it) - slopCloudShadow;
 * needs the fog's world offset, so fogged materials only.
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
  reflectedLight.indirectDiffuse *= worldSky * worldAo * ( 0.72 + 0.28 * worldCloud );
  reflectedLight.directSpecular *= worldSky * worldCloud;
  reflectedLight.indirectSpecular *= worldSky;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * ( BLOCK_LIGHT_COLOR * ( ${flicker} ) * worldBlock + uLightFloor * ( 1.0 - worldSky ) ) * worldAo;
}
`
}
