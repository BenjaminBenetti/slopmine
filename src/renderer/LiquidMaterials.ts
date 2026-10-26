import * as THREE from 'three'
import { CRISP_TEXEL_SAMPLING_GLSL } from './crispTexelSampling.ts'
import { LIGHT_CURVE_DEFINES } from './lightCurve.ts'
import { loadBlockTexture } from './TextureLoader.ts'
import { SKY_HORIZON_HEX } from './skybox/BiomeAtmosphere.ts'
import { daylightUniform, cloudShadowUniforms, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment } from './worldLightShader.ts'
import { DARK_GLOW_GLSL } from './EmissiveTextures.ts'
import { glowTimeUniform } from './glowClock.ts'
import { windUniform } from './WindUniform.ts'

/**
 * Shared liquid surface materials. Each liquid family (water, lava, swamp
 * water) uses ONE material + texture for all of its levels; the texture
 * drifts slowly (RepeatWrapping + animated offset, see updateLiquidMaterials).
 * A small shader patch makes the Phong sun highlight glitter (only the
 * texture's bright ripple pixels catch it) and adds a Fresnel reflection of
 * the horizon sky, so glancing and distant surfaces read as water and blend
 * into the distance fog.
 *
 * vertexColors is on because chunk liquid meshes carry per-face light LEVELS
 * in their vertex colors, (sky / 15, block / 15, 1); the shader lights them
 * with the shared world light model (worldLightShader.ts) like terrain: dark
 * water in caves, warm near torches, dimmed by the daylight uniform. Every
 * other geometry drawn with these materials (block icons) must carry white
 * vertex colors (= full light) - build it with withWhiteVertexColors() or
 * use liquidCubeGeometry.
 *
 * Chunk liquid meshes also carry LIQUID_GLOW_ATTRIBUTE: the light glowing
 * plants below scatter up through the water (linear RGB per vertex, from the
 * mesh worker's corner glow), shown on the surface after dark like the
 * plants' own dark-only glow. Every geometry drawn with these materials
 * carries it (zeros), so no stale default attribute value can leak in.
 *
 * And LIQUID_DEPTH_ATTRIBUTE / LIQUID_SHORE_ATTRIBUTE: the water depth under
 * a TOP face's 4 corners and each corner's share of bank around it (from the
 * mesh worker; all four corners on every vertex, blended bilinearly over the
 * face by its uv). Water families (`depthLook` > 0) show them: clear shallows
 * where the bed shows through, dark and nearly opaque deep water, and foam
 * washing up and down the shore along a smooth line - a stepped diagonal
 * bank gets a straight one, coves round off. On top of that the surface
 * ripples (drifting wave trains, stronger with the wind), reflects the sky
 * from the horizon colour to the zenith by the ripple's reflection angle, and
 * glints with the sun (dimmed under cloud shadow). Icons carry a mid depth.
 */

/** Vertex attribute: scatter glow of submerged plants (normalized RGB bytes). */
export const LIQUID_GLOW_ATTRIBUTE = 'liquidGlow'
/** Vertex attribute: water depth below the TOP face's 4 corners (x0z0, x1z0, x1z1, x0z1; normalized bytes, ×255/16 = blocks). */
export const LIQUID_DEPTH_ATTRIBUTE = 'liquidDepth'
/** Vertex attribute: the share of bank around the TOP face's 4 corners (0 open water, 0.5 on a straight bank, up to 0.75). */
export const LIQUID_SHORE_ATTRIBUTE = 'liquidShore'

export interface LiquidMaterialOptions {
  readonly opacity: number
  /** Texture drift in texture widths per second along U and V. */
  readonly flowU: number
  readonly flowV: number
  readonly specular: number
  readonly shininess: number
  /** Strength of the Fresnel sky reflection at glancing angles (0-1). */
  readonly reflectivity: number
  /**
   * Linear texel luminance range over which the sun highlight fades in
   * (glitter: only the texture's bright ripple texels catch the sun). Tune it
   * to the family's texture - the brightest ~half of its texels - since
   * textures differ widely in brightness. Default [0.25, 0.6]; lo < hi.
   */
  readonly glitterLuma?: readonly [number, number]
  readonly emissive?: number
  readonly emissiveIntensity?: number
  /** Emissive intensity swing (+/-) for a slow glow pulse, e.g. lava. */
  readonly emissivePulse?: number
  /** Glows blue after dark in a glowing tide (weather: setTideGlow). */
  readonly tideGlow?: boolean
  /**
   * How much the water's depth shows (0-1; 0 = none - lava): clear shallows,
   * dark deep water, shore foam, ripples, the sky gradient and the sun's glint.
   */
  readonly depthLook?: number
  /** Deep water's colour as a multiplier of the lit surface (linear). */
  readonly deepTint?: readonly [number, number, number]
}

interface AnimatedLiquid {
  readonly material: THREE.MeshPhongMaterial
  readonly texture: THREE.Texture
  readonly options: LiquidMaterialOptions
}

/** Default glitter luminance range (LiquidMaterialOptions.glitterLuma). */
const DEFAULT_GLITTER_LUMA: readonly [number, number] = [0.25, 0.6]

/** Emissive pulse frequency in Hz. */
const PULSE_FREQUENCY = 0.35

const animatedLiquids: AnimatedLiquid[] = []
let elapsedSeconds = 0

/** Sky color reflected at glancing angles (linear), shared by all liquids. */
const reflectionColor = { value: new THREE.Color(SKY_HORIZON_HEX) }
/** The sky overhead (linear): water reflects it where the ripples tip the reflection upward. */
const zenithColor = { value: new THREE.Color(SKY_HORIZON_HEX) }

/** The sky colours water reflects, for other water surfaces to match (far terrain - LodMaterial). */
export const liquidSkyUniforms = { liquidReflectColor: reflectionColor, liquidZenithColor: zenithColor }

/**
 * Phong fragment patch. map_fragment: sampled at texel centres
 * (crispTexelSampling.ts) so the linearly magnified texture stays pixel-crisp
 * while three.js applies its anisotropy (liquids are mostly seen at grazing
 * angles). color_fragment: vertex colors are light levels, not a
 * tint (skip three's multiply). specularmap_fragment: highlight strength from
 * the map's luminance (glitter). aomap_fragment: the world light model
 * (sky light scales the scene lights and specular, warm block light, floor).
 * opaque_fragment: Fresnel blend toward the sky color on front faces, scaled
 * by the sky light level so water in caves doesn't glow (not by daylight:
 * the reflected horizon colour is already as bright as the displayed sky),
 * and more opaque where it reflects.
 */
const CRISP_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = slopCrispTexel( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`
const SPECULAR_GLITTER = /* glsl */ `
float specularStrength = smoothstep( liquidGlitterLuma.x, liquidGlitterLuma.y, dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
`
const WORLD_LIGHT = /* glsl */ `
#include <aomap_fragment>
${worldLightFragment('vColor.r * 15.0', 'vColor.g * 15.0', '1.0')}
`
const LIQUID_SURFACE_FUNCTIONS = /* glsl */ `
// A TOP face's corners (x0z0, x1z0, x1z1, x0z1) blended bilinearly at its uv
float liquidCorners( vec4 c, vec2 f ) {
  return mix( mix( c.x, c.y, f.x ), mix( c.w, c.z, f.x ), f.y );
}
// (no sine: GPUs lose sin's precision on large arguments, and the hash turns into patterns)
float liquidHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
// Smooth value noise, 0-1
float liquidNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( liquidHash( i ), liquidHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( liquidHash( i + vec2( 0.0, 1.0 ) ), liquidHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`
const FRESNEL_REFLECTION = /* glsl */ `
vec3 liquidV = normalize( vViewPosition );
float liquidTop = step( 0.5, vLiquidUp );
vec2 liquidCellUv = clamp( vLiquidCell, 0.0, 1.0 );
float liquidDepthBlocks = liquidCorners( vLiquidDepth, liquidCellUv ) * 15.94;
float liquidWater = gl_FrontFacing ? liquidDepthLook : 0.0;
// Ripples: a few drifting wave trains in world space on the open surface, stronger with the wind
vec3 liquidN = normal;
if ( liquidWater > 0.0 ) {
  vec2 rp = vLiquidWorld.xz;
  float rt = uGlowTime;
  vec2 slope = vec2( 0.8, 0.6 ) * cos( dot( rp, vec2( 0.8, 0.6 ) ) * 1.3 + rt * 1.6 );
  slope += vec2( -0.5, 0.86 ) * cos( dot( rp, vec2( -0.5, 0.86 ) ) * 2.1 + rt * 2.3 ) * 0.6;
  slope += vec2( 0.95, -0.31 ) * cos( dot( rp, vec2( 0.95, -0.31 ) ) * 3.7 + rt * 3.1 ) * 0.35;
  slope += vec2( -0.2, -0.98 ) * cos( dot( rp, vec2( -0.2, -0.98 ) ) * 5.3 + rt * 3.9 + sin( rp.x * 0.7 ) * 2.0 ) * 0.22;
  // (calmer with distance: far ripples would only shimmer into a moire, and far terrain's water is flat)
  float amplitude = ( 0.035 + 0.1 * uWind.z ) * liquidTop * liquidWater * ( 1.0 - 0.8 * smoothstep( 20.0, 110.0, length( vViewPosition ) ) );
  liquidN = normalize( normal + ( viewMatrix * vec4( slope.x * amplitude, 0.0, slope.y * amplitude, 0.0 ) ).xyz );
}
float liquidFresnel = gl_FrontFacing ? pow( 1.0 - saturate( dot( liquidN, liquidV ) ), 5.0 ) * liquidReflectivity : 0.0;
// Sky light level only: the reflected colour is the displayed horizon, which
// already carries the biome's sky brightness (no second daylight factor)
float liquidSkyLight = slopLightShape( vColor.r * 15.0 );
vec3 liquidSky = liquidReflectColor;
vec3 liquidR = reflect( -liquidV, liquidN );
if ( liquidWater > 0.0 ) {
  // The reflected sky: the horizon colour low, the zenith where a ripple tips the reflection up
  vec3 liquidUpView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  liquidSky = mix( liquidReflectColor, liquidZenithColor, smoothstep( 0.03, 0.55, dot( liquidR, liquidUpView ) ) );
  // Depth: clear in the shallows (the bed shows through), dark and nearly opaque out deep
  float liquidDeep = smoothstep( 0.6, 9.0, liquidDepthBlocks ) * liquidTop * liquidWater;
  outgoingLight = mix( outgoingLight, outgoingLight * liquidDeepTint, liquidDeep * 0.8 );
  diffuseColor.a = mix( diffuseColor.a, mix( diffuseColor.a * 0.55, 0.94, liquidDeep ), liquidTop * liquidWater );
}
outgoingLight = mix( outgoingLight, liquidSky * liquidSkyLight, liquidFresnel );
diffuseColor.a = mix( diffuseColor.a, 1.0, liquidFresnel );
if ( liquidWater > 0.0 ) {
  // The sun's glint on the ripples, dimmed where a cloud's shadow lies on the water
  vec3 liquidSunView = normalize( ( viewMatrix * vec4( uGodRaySun.xyz, 0.0 ) ).xyz );
  float liquidSunDot = max( dot( liquidR, liquidSunView ), 0.0 );
  float liquidGlint = pow( liquidSunDot, 900.0 ) * 5.0 + pow( liquidSunDot, 80.0 ) * 0.22;
  #ifdef USE_FOG
    liquidGlint *= slopCloudShadow( cameraPosition + vFogOffset );
  #endif
  outgoingLight += uGodRaySunColor * liquidGlint * uGodRaySun.w * liquidSkyLight * liquidTop * liquidWater;
  // Foam along the shore, read per texel (pixel art). The bank is the
  // corners' share of land blended over the face: 0.5 on a straight bank,
  // falling to 0 a block out. The foam washes up and back out of step along
  // the shore, its edge wandering: a broken leading line, lacy behind it,
  // nearly solid against the bank but lacy in the corners between the
  // bank's steps (solid wedges there drew the steps' sawtooth), and a sparse
  // fringe left out to the wash's furthest reach; a few specks out over the
  // shallows.
  vec2 liquidTexel = ( floor( liquidCellUv * 15.999 ) + 0.5 ) / 16.0;
  float liquidShore = liquidCorners( vLiquidShore, liquidTexel );
  float liquidShallows = 1.0 - smoothstep( 0.3, 1.0, liquidDepthBlocks );
  if ( ( liquidShore > 0.04 || liquidShallows > 0.0 ) && liquidTop * liquidWater > 0.0 ) {
    vec2 liquidTexelId = floor( vLiquidWorld.xz * 16.0 );
    float liquidWander = liquidNoise( liquidTexelId * ( 0.6 / 16.0 ) ) - 0.5;
    // Each stretch of shore washes on its own beat (patches of noise - a phase
    // ramp across the world swept straight bands along every shore)
    float liquidPhase = liquidNoise( liquidTexelId * ( 0.22 / 16.0 ) + 31.7 ) * 6.2832 + liquidWander * 5.0;
    float liquidWash = 0.5 + 0.5 * sin( uGlowTime * 0.9 + liquidPhase );
    float liquidEdge = liquidShore - ( 0.36 - 0.2 * liquidWash + 0.1 * liquidWander );
    // Each texel re-rolls its speck at its own moment (re-rolling on a smooth
    // field's beat swept lines of change across the foam, like scan lines)
    vec2 liquidTexelKey = mod( liquidTexelId, 4096.0 );
    float liquidTwinkle = liquidHash( liquidTexelKey + 17.3 );
    float liquidSpeck = liquidHash( liquidTexelKey + mod( floor( uGlowTime * 1.1 + liquidTwinkle ), 512.0 ) * vec2( 37.1, 17.9 ) );
    float liquidIn = step( 0.0, liquidEdge );
    float liquidFoam = max( liquidIn * ( 1.0 - step( 0.04, liquidEdge ) ) * step( 0.18, liquidSpeck ), liquidIn * step( max( 0.1 + 1.8 * max( 0.0, liquidShore - 0.5 ), 0.62 - 3.0 * liquidEdge ), liquidSpeck ) );
    liquidFoam = max( liquidFoam, ( 1.0 - liquidIn ) * step( 0.14 + 0.1 * liquidWander, liquidShore ) * step( 0.86, liquidSpeck ) * 0.8 );
    liquidFoam = max( liquidFoam, liquidShallows * step( 0.93, liquidSpeck ) * 0.7 ) * liquidTop * liquidWater;
    vec3 liquidFoamLight = vec3( 0.93, 0.97, 1.0 ) * ( liquidSkyLight * uDaylight * 0.9 + 0.08 );
    outgoingLight = mix( outgoingLight, liquidFoamLight, liquidFoam * 0.85 );
    diffuseColor.a = mix( diffuseColor.a, 1.0, liquidFoam );
  }
}
// Light scattered up from glowing plants below: after the Fresnel mix (it
// comes out of the water, it isn't reflected), only in the dark, shimmering
// with the drifting ripple texels (the glitter mask) like light through water,
// and stronger at glancing angles (a longer path through the lit water)
float liquidGlowPath = min( 2.2, 1.0 / max( abs( dot( normal, normalize( vViewPosition ) ) ), 0.01 ) );
outgoingLight += vLiquidGlow * liquidGlowPath * ( 0.6 + 0.8 * specularStrength ) * slopDarkGlow( slopLightShape( vColor.r * 15.0 ) * uDaylight );
// Glowing tide (weather): plankton light the water blue after dark, brightest on the ripples
outgoingLight += vec3( 0.08, 0.5, 1.0 ) * ( uTideGlow * liquidTideAmount ) * ( 0.12 + 0.4 * specularStrength * specularStrength ) * liquidGlowPath * slopDarkGlow( slopLightShape( vColor.r * 15.0 ) * uDaylight );
#include <opaque_fragment>
`

/** The glowing tide (weather): 0-1, shared by every liquid program (families without tideGlow ignore it). */
const tideGlowUniform = { value: 0 }

/** Set how strongly water glows after dark (the coast's Glowing Tide weather). */
export function setTideGlow(amount: number): void {
  tideGlowUniform.value = amount
}

/** Create a family's shared liquid material and register it for animation. */
export function createLiquidMaterial(textureUrl: string, options: LiquidMaterialOptions): THREE.MeshPhongMaterial {
  const texture = loadBlockTexture(textureUrl)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Crisp up close through the shader (CRISP_MAP), so three.js applies the
  // anisotropy on every backend
  texture.magFilter = THREE.LinearFilter

  const material = new THREE.MeshPhongMaterial({
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: options.opacity,
    side: THREE.DoubleSide,
    // Writing depth keeps overlapping faces of the same liquid from stacking
    // their tint (only the nearest surface blends over what's behind it).
    depthWrite: true,
    specular: options.specular,
    shininess: options.shininess,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
  })

  const reflectivity = { value: options.reflectivity }
  const depthLook = { value: options.depthLook ?? 0 }
  const deepTint = { value: new THREE.Color(...(options.deepTint ?? [0.34, 0.52, 0.8])) }
  const glitterLuma = { value: new THREE.Vector2(...(options.glitterLuma ?? DEFAULT_GLITTER_LUMA)) }
  const tideAmount = { value: options.tideGlow ? 1 : 0 }
  material.defines = { ...LIGHT_CURVE_DEFINES }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.liquidReflectColor = reflectionColor
    shader.uniforms.liquidReflectivity = reflectivity
    shader.uniforms.liquidGlitterLuma = glitterLuma
    shader.uniforms.uDaylight = daylightUniform
    shader.uniforms.uLightFloor = lightFloorUniform
    Object.assign(shader.uniforms, cloudShadowUniforms)
    shader.uniforms.uTideGlow = tideGlowUniform
    shader.uniforms.liquidTideAmount = tideAmount
    shader.uniforms.liquidZenithColor = zenithColor
    shader.uniforms.liquidDepthLook = depthLook
    shader.uniforms.liquidDeepTint = deepTint
    shader.uniforms.uGlowTime = glowTimeUniform
    shader.uniforms.uWind = windUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 ${LIQUID_GLOW_ATTRIBUTE};\nattribute vec4 ${LIQUID_DEPTH_ATTRIBUTE};\nattribute vec4 ${LIQUID_SHORE_ATTRIBUTE};\nvarying vec3 vLiquidGlow;\nvarying vec4 vLiquidDepth;\nvarying vec4 vLiquidShore;\nvarying vec2 vLiquidCell;\nvarying float vLiquidUp;\nvarying vec3 vLiquidWorld;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nvLiquidUp = objectNormal.y;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLiquidGlow = ${LIQUID_GLOW_ATTRIBUTE};\nvLiquidDepth = ${LIQUID_DEPTH_ATTRIBUTE};\nvLiquidShore = ${LIQUID_SHORE_ATTRIBUTE};\nvLiquidCell = uv;\nvLiquidWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 liquidReflectColor;\nuniform vec3 liquidZenithColor;\nuniform float liquidReflectivity;\nuniform vec2 liquidGlitterLuma;\nuniform float uTideGlow;\nuniform float liquidTideAmount;\nuniform float liquidDepthLook;\nuniform vec3 liquidDeepTint;\nuniform float uGlowTime;\nuniform vec3 uWind;\nvarying vec3 vLiquidGlow;\nvarying vec4 vLiquidDepth;\nvarying vec4 vLiquidShore;\nvarying vec2 vLiquidCell;\nvarying float vLiquidUp;\nvarying vec3 vLiquidWorld;\n${WORLD_LIGHT_FRAGMENT_PARS}\n${DARK_GLOW_GLSL}\n${LIQUID_SURFACE_FUNCTIONS}`)
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${CRISP_TEXEL_SAMPLING_GLSL}`)
      .replace('#include <map_fragment>', CRISP_MAP)
      .replace('#include <color_fragment>', '')
      .replace('#include <specularmap_fragment>', SPECULAR_GLITTER)
      .replace('#include <aomap_fragment>', WORLD_LIGHT)
      .replace('#include <opaque_fragment>', FRESNEL_REFLECTION)
  }
  // Same patch for every liquid; per-family values live in uniforms
  material.customProgramCacheKey = () => 'liquid-surface-v7'

  animatedLiquids.push({ material, texture, options })
  return material
}

/** Set the sky color liquids reflect at glancing angles (linear; normally the fog/horizon color). */
export function setLiquidReflectionColor(color: THREE.Color): void {
  reflectionColor.value.copy(color)
}

/** Set the sky overhead the water reflects where ripples tip it up (linear; the dome's zenith as displayed). */
export function setLiquidZenithColor(color: THREE.Color): void {
  zenithColor.value.copy(color)
}

/** Advance liquid surface animation (texture drift, glow pulse). Call once per frame. */
export function updateLiquidMaterials(deltaTime: number): void {
  elapsedSeconds += deltaTime
  const pulsePhase = Math.sin(elapsedSeconds * PULSE_FREQUENCY * Math.PI * 2)
  for (const { material, texture, options } of animatedLiquids) {
    // Wrap to [0, 1): the texture repeats, and small offsets keep precision
    texture.offset.set(
      (texture.offset.x + options.flowU * deltaTime) % 1,
      (texture.offset.y + options.flowV * deltaTime) % 1
    )
    if (options.emissivePulse) {
      material.emissiveIntensity = (options.emissiveIntensity ?? 1) + options.emissivePulse * pulsePhase
    }
  }
}

/**
 * Add an all-white vertex color attribute so the liquid materials render it
 * at full light (and an empty scatter glow, water ~4 blocks deep, no shore).
 */
export function withWhiteVertexColors(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3))
  geometry.setAttribute(LIQUID_GLOW_ATTRIBUTE, new THREE.BufferAttribute(new Uint8Array(count * 3), 3, true))
  geometry.setAttribute(LIQUID_DEPTH_ATTRIBUTE, new THREE.BufferAttribute(new Uint8Array(count * 4).fill(64), 4, true))
  geometry.setAttribute(LIQUID_SHORE_ATTRIBUTE, new THREE.BufferAttribute(new Uint8Array(count * 4), 4, true))
  return geometry
}

/** Full-height liquid block geometry (unit cube with white vertex colors). */
export const liquidCubeGeometry = withWhiteVertexColors(new THREE.BoxGeometry(1, 1, 1))
