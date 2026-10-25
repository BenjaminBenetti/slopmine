import * as THREE from 'three'
import { CRISP_TEXEL_SAMPLING_GLSL } from './crispTexelSampling.ts'
import { LIGHT_CURVE_DEFINES } from './lightCurve.ts'
import { loadBlockTexture } from './TextureLoader.ts'
import { SKY_HORIZON_HEX } from './skybox/BiomeAtmosphere.ts'
import { daylightUniform, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment } from './worldLightShader.ts'
import { DARK_GLOW_GLSL } from './EmissiveTextures.ts'

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
 */

/** Vertex attribute: scatter glow of submerged plants (normalized RGB bytes). */
export const LIQUID_GLOW_ATTRIBUTE = 'liquidGlow'

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
const FRESNEL_REFLECTION = /* glsl */ `
float liquidFresnel = gl_FrontFacing ? pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 5.0 ) * liquidReflectivity : 0.0;
// Sky light level only: the reflected colour is the displayed horizon, which
// already carries the biome's sky brightness (no second daylight factor)
float liquidSkyLight = slopLightShape( vColor.r * 15.0 );
outgoingLight = mix( outgoingLight, liquidReflectColor * liquidSkyLight, liquidFresnel );
diffuseColor.a = mix( diffuseColor.a, 1.0, liquidFresnel );
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
  const glitterLuma = { value: new THREE.Vector2(...(options.glitterLuma ?? DEFAULT_GLITTER_LUMA)) }
  const tideAmount = { value: options.tideGlow ? 1 : 0 }
  material.defines = { ...LIGHT_CURVE_DEFINES }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.liquidReflectColor = reflectionColor
    shader.uniforms.liquidReflectivity = reflectivity
    shader.uniforms.liquidGlitterLuma = glitterLuma
    shader.uniforms.uDaylight = daylightUniform
    shader.uniforms.uLightFloor = lightFloorUniform
    shader.uniforms.uTideGlow = tideGlowUniform
    shader.uniforms.liquidTideAmount = tideAmount
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 ${LIQUID_GLOW_ATTRIBUTE};\nvarying vec3 vLiquidGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLiquidGlow = ${LIQUID_GLOW_ATTRIBUTE};`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 liquidReflectColor;\nuniform float liquidReflectivity;\nuniform vec2 liquidGlitterLuma;\nuniform float uTideGlow;\nuniform float liquidTideAmount;\nvarying vec3 vLiquidGlow;\n${WORLD_LIGHT_FRAGMENT_PARS}\n${DARK_GLOW_GLSL}`)
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${CRISP_TEXEL_SAMPLING_GLSL}`)
      .replace('#include <map_fragment>', CRISP_MAP)
      .replace('#include <color_fragment>', '')
      .replace('#include <specularmap_fragment>', SPECULAR_GLITTER)
      .replace('#include <aomap_fragment>', WORLD_LIGHT)
      .replace('#include <opaque_fragment>', FRESNEL_REFLECTION)
  }
  // Same patch for every liquid; per-family values live in uniforms
  material.customProgramCacheKey = () => 'liquid-surface-v5'

  animatedLiquids.push({ material, texture, options })
  return material
}

/** Set the sky color liquids reflect at glancing angles (linear; normally the fog/horizon color). */
export function setLiquidReflectionColor(color: THREE.Color): void {
  reflectionColor.value.copy(color)
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
 * at full light (and an empty scatter glow).
 */
export function withWhiteVertexColors(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3))
  geometry.setAttribute(LIQUID_GLOW_ATTRIBUTE, new THREE.BufferAttribute(new Uint8Array(count * 3), 3, true))
  return geometry
}

/** Full-height liquid block geometry (unit cube with white vertex colors). */
export const liquidCubeGeometry = withWhiteVertexColors(new THREE.BoxGeometry(1, 1, 1))
