import * as THREE from 'three'
import { LIGHT_CURVE_DEFINES } from '../lightCurve.ts'
import { daylightUniform, cloudShadowUniforms, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment } from '../worldLightShader.ts'
import { LOD_REGION_SLOTS } from '../../world/lod/LodTypes.ts'
import { liquidSkyUniforms } from '../LiquidMaterials.ts'

/**
 * Every region material compiles to this one program (only uniform values
 * differ), instead of three's default key (the onBeforeCompile source).
 */
const PROGRAM_CACHE_KEY = 'lod-terrain-v3'

const VERTEX_DECLARATIONS = /* glsl */ `
attribute vec4 lodColor;
uniform uvec2 lodHiddenMask;
uniform vec4 lodSlotSky[ ${LOD_REGION_SLOTS / 4} ];
varying vec3 vLodColor;
varying float vLodSky;
varying vec2 vLodWater;
`

const VERTEX_MAIN = /* glsl */ `
  // Palette colours are sRGB; light them in linear space like textures
  // (srgbToLinearChannel in src/world/lod/srgb.ts)
  vec3 lodSrgb = lodColor.rgb;
  vLodColor = mix(
    lodSrgb * 0.0773993808,
    pow(lodSrgb * 0.9478672986 + 0.0521327014, vec3(2.4)),
    step(vec3(0.04045), lodSrgb)
  );
  // Chunk slot (0-63) rides in alpha, with the water flags above it (LodMesher:
  // 64 open water, 128 deep). A hidden slot's triangles are moved outside the
  // clip volume and dropped - full detail draws there instead.
  uint lodByte = uint(lodColor.a * 255.0 + 0.5);
  uint lodSlot = lodByte & 63u;
  vLodWater = vec2( float( ( lodByte >> 6u ) & 1u ), float( lodByte >> 7u ) );
  uint lodBits = lodSlot < 32u ? lodHiddenMask.x : lodHiddenMask.y;
  if (((lodBits >> (lodSlot & 31u)) & 1u) == 1u) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
  // Open-sky light level of the slot's chunk (its biome's skylight cap)
  int lodSlotIndex = int( lodSlot );
  vLodSky = lodSlotSky[ lodSlotIndex >> 2 ][ lodSlotIndex & 3 ];
`

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying vec3 vLodColor;
varying float vLodSky;
varying vec2 vLodWater;
uniform vec3 liquidReflectColor;
uniform vec3 liquidZenithColor;
${WORLD_LIGHT_FRAGMENT_PARS}
`

const FRAGMENT_COLOR = /* glsl */ `
  diffuseColor.rgb *= vLodColor;
`

/**
 * LOD surfaces are open-sky tops and walls: sky light = the chunk's biome cap,
 * no block light, no AO (the palette's face colours carry the average AO /
 * canopy darkening instead, see LodPalette).
 */
const FRAGMENT_LIGHT = /* glsl */ `
#include <aomap_fragment>
${worldLightFragment('vLodSky', '0.0', '1.0')}
`

/**
 * Far water matches the near water's look (LiquidMaterials, depth look): deep
 * water darker and bluer, the sky reflected at glancing angles (horizon to
 * zenith - far water is always glancing), and a broad sun path where the
 * many small ripples catch the sun.
 */
const FRAGMENT_WATER = /* glsl */ `
if ( vLodWater.x > 0.5 ) {
  vec3 lodV = normalize( vViewPosition );
  vec3 lodN = normalize( normal );
  outgoingLight = mix( outgoingLight, outgoingLight * vec3( 0.3, 0.5, 0.82 ), vLodWater.y * 0.75 );
  float lodFresnel = pow( 1.0 - saturate( dot( lodN, lodV ) ), 5.0 ) * 0.75;
  vec3 lodUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  vec3 lodR = reflect( -lodV, lodN );
  float lodSkyLight = slopLightShape( vLodSky );
  vec3 lodSky = mix( liquidReflectColor, liquidZenithColor, smoothstep( 0.03, 0.55, dot( lodR, lodUp ) ) );
  outgoingLight = mix( outgoingLight, lodSky * lodSkyLight, lodFresnel );
  vec3 lodSun = normalize( ( viewMatrix * vec4( uGodRaySun.xyz, 0.0 ) ).xyz );
  float lodGlint = pow( max( dot( lodR, lodSun ), 0.0 ), 60.0 ) * 0.6;
  #ifdef USE_FOG
    lodGlint *= slopCloudShadow( cameraPosition + vFogOffset );
  #endif
  outgoingLight += uGodRaySunColor * lodGlint * uGodRaySun.w * lodSkyLight;
}
#include <opaque_fragment>
`

/**
 * Material of one LOD region mesh: Lambert with flat shading (the mesh has
 * no normals - faces are axis-aligned, so derivative normals are exact),
 * per-vertex palette colours from the `lodColor` attribute, and a per-region
 * 64-bit mask of chunk slots to hide. Lit and fogged like full-detail chunks:
 * the scene's lights and fog, shaded by the shared world light model
 * (worldLightShader.ts) at each chunk's open-sky light level, so a biome
 * with a skylight cap is as dim as its full detail, and the daylight and
 * light-floor uniforms apply. No shadows.
 *
 * The only shader code of the LOD system lives here.
 */
export class LodTerrainMaterial extends THREE.MeshLambertMaterial {
  /** Hidden chunk slots: bits for slots 0-31 / 32-63 (uploaded as uvec2). */
  readonly hiddenMask = new Uint32Array(2)
  private readonly hiddenMaskUniform = { value: this.hiddenMask }
  /** Open-sky light level (0-15) per chunk slot, 4 slots per vec4. */
  private readonly slotSkyUniform = {
    value: Array.from({ length: LOD_REGION_SLOTS / 4 }, () => new THREE.Vector4(15, 15, 15, 15)),
  }

  constructor() {
    super({ flatShading: true, fog: true })
    this.defines = { ...LIGHT_CURVE_DEFINES }
  }

  /** Set a chunk slot's open-sky light level (its biome's skylight cap, 0-15). */
  setSlotSkyLight(slot: number, level: number): void {
    this.slotSkyUniform.value[slot >> 2].setComponent(slot & 3, level)
  }

  override onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
    shader.uniforms.lodHiddenMask = this.hiddenMaskUniform
    shader.uniforms.lodSlotSky = this.slotSkyUniform
    shader.uniforms.uDaylight = daylightUniform
    shader.uniforms.uLightFloor = lightFloorUniform
    Object.assign(shader.uniforms, cloudShadowUniforms)
    Object.assign(shader.uniforms, liquidSkyUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
      .replace('#include <aomap_fragment>', FRAGMENT_LIGHT)
      .replace('#include <opaque_fragment>', FRAGMENT_WATER)
  }

  override customProgramCacheKey(): string {
    return PROGRAM_CACHE_KEY
  }
}
