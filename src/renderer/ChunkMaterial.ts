import * as THREE from 'three'
import { getBlockTextureArray } from './BlockTextureArray.ts'
import { CRISP_TEXEL_SAMPLING_GLSL } from './crispTexelSampling.ts'
import { buildLayerGlowTexture, DARK_GLOW_GLSL, EMISSIVE_MAX_STRENGTH_GLSL } from './EmissiveTextures.ts'
import { LIGHT_CURVE_DEFINES } from './lightCurve.ts'
import {
  daylightUniform, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment,
} from './worldLightShader.ts'
import { CHUNK_LIGHT_SCALE } from './ChunkVertexFormat.ts'
import { glowTimeUniform } from './glowClock.ts'
import { FLICKER_GLSL, flickerSourcesUniform } from './FlickerLights.ts'

/**
 * Materials for greedy chunk meshes (chunk-only; never shared with item
 * displays). MeshLambertMaterial patched via onBeforeCompile so three's
 * lights, shadows and fog keep working, with:
 *
 * - the block texture array sampled at (u, v, layer) from the vertex format
 *   (UVs in block units, tiled by RepeatWrapping) instead of `map`, snapped
 *   to texel centres so magnification is pixel-crisp on every backend
 *   (crispTexelSampling.ts);
 * - the face normal derived from the vertex face index;
 * - every quad grown by ~1/8 pixel in its plane (scaled with view depth) so
 *   greedy T-junctions and chunk borders can't open hairline cracks;
 * - per-vertex smooth sky / block light and AO shaded in the fragment shader
 *   by the shared world light model (worldLightShader.ts): sky light scales
 *   the scene's lights, block light adds a warm non-directional term, a small
 *   floor keeps caves from pure black, all multiplied by AO;
 * - emissive textures (EmissiveTextures.ts: magma, ember veins, glowing caps)
 *   adding their hot texels as light of their own, so emitters glow in the
 *   dark instead of being lit only by their neighbours' light; bioluminescent
 *   ones pulse (twinkling specks, drifting waves) on the shared glow clock
 *   (glowClock.ts).
 *
 * Curve constants come from lightCurve.ts (injected as defines).
 */

const CHUNK_PROGRAM_KEY = 'slopmine-chunk-v6'

/**
 * In-plane quad growth per unit of view depth (world units). Greedy quads meet
 * smaller quads at T-junctions whose vertices land a hair off the long edge
 * after projection/rasterizer snapping, leaving sub-pixel cracks that sparkle
 * with the sky. 0.0004 ≈ 1/8 pixel at 720p with the 100° FOV: closes them
 * while staying invisible (and texture-continuous) at any distance.
 */
const SEAM_EXPANSION = 0.0004

let opaqueMaterial: THREE.MeshLambertMaterial | null = null
let cutoutMaterial: THREE.MeshLambertMaterial | null = null
let cutoutDepthMaterial: THREE.MeshDepthMaterial | null = null
let layerGlowTexture: THREE.DataTexture | null = null

// Face order: TOP, BOTTOM, NORTH, SOUTH, EAST, WEST (BlockFace). U/V are the
// in-plane axes the mesher's corner bits refer to.
const VERTEX_PARS = /* glsl */ `
attribute vec4 aTex;
attribute vec4 aLight;
varying vec3 vBlockUv;
varying vec3 vBlockLight;
varying vec3 vSlopWorld;
varying vec3 vSlopNormal;
varying vec3 vSlopFlicker;
${FLICKER_GLSL}
const vec3 SLOP_FACE_NORMALS[ 6 ] = vec3[ 6 ](
  vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, -1.0, 0.0 ),
  vec3( 0.0, 0.0, -1.0 ), vec3( 0.0, 0.0, 1.0 ),
  vec3( 1.0, 0.0, 0.0 ), vec3( -1.0, 0.0, 0.0 )
);
const vec3 SLOP_FACE_U[ 6 ] = vec3[ 6 ](
  vec3( 1.0, 0.0, 0.0 ), vec3( 1.0, 0.0, 0.0 ), vec3( 1.0, 0.0, 0.0 ),
  vec3( 1.0, 0.0, 0.0 ), vec3( 0.0, 0.0, 1.0 ), vec3( 0.0, 0.0, 1.0 )
);
const vec3 SLOP_FACE_V[ 6 ] = vec3[ 6 ](
  vec3( 0.0, 0.0, 1.0 ), vec3( 0.0, 0.0, 1.0 ), vec3( 0.0, 1.0, 0.0 ),
  vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, 1.0, 0.0 )
);
`

const VERTEX_SEAM_EXPANSION = /* glsl */ `
#include <project_vertex>
{
  int slopFace = int( aTex.w + 0.5 );
  vec2 slopCorner = vec2( mod( aLight.w, 2.0 ), floor( aLight.w * 0.5 + 0.25 ) ) * 2.0 - 1.0;
  vec3 slopGrow = SLOP_FACE_U[ slopFace ] * slopCorner.x + SLOP_FACE_V[ slopFace ] * slopCorner.y;
  mvPosition.xyz += ( modelViewMatrix * vec4( slopGrow, 0.0 ) ).xyz * ( ${SEAM_EXPANSION} * max( - mvPosition.z, 0.0 ) );
  gl_Position = projectionMatrix * mvPosition;
}
`

const VERTEX_VARYINGS = /* glsl */ `
vBlockUv = aTex.xyz;
vBlockLight = vec3( aLight.xy * ${(1 / CHUNK_LIGHT_SCALE).toFixed(6)}, aLight.z * ${(1 / 255).toFixed(8)} );
vSlopWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vSlopFlicker = slopFlicker( vSlopWorld );
vSlopNormal = SLOP_FACE_NORMALS[ int( aTex.w + 0.5 ) ];
`

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2DArray uBlockTextures;
uniform sampler2D uLayerGlow;
uniform sampler2DArray uGlowMaps;
uniform float uGlowTime;
varying vec3 vBlockUv;
varying vec3 vBlockLight;
varying vec3 vSlopWorld;
varying vec3 vSlopNormal;
varying vec3 vSlopFlicker;
float slopHash13( vec3 p3 ) {
  p3 = fract( p3 * 0.1031 );
  p3 += dot( p3, p3.zyx + 31.32 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
${DARK_GLOW_GLSL}
${CRISP_TEXEL_SAMPLING_GLSL}
${WORLD_LIGHT_FRAGMENT_PARS}
`

// Emissive texels: glow parameters per texture layer (EmissiveTextures.ts).
// Hot texels add their own colour as light - or, for a layer with a glow map,
// the map's colour - and open daylight washes the glow out by half; dark-only
// (bioluminescent) layers fade out completely in daylight. Pulsing layers
// (B = amount) dip and recover: per texel with its own rate (A = 1, speck: the
// cell is the texel just inside the face) or in slow waves drifting across the
// world (A = 0, wave); with a glow map only its bright texels pulse.
const FRAGMENT_GLOW = /* glsl */ `
#include <emissivemap_fragment>
{
  int slopLayer = int( vBlockUv.z + 0.5 );
  vec4 slopGlow = texelFetch( uLayerGlow, ivec2( slopLayer, 0 ), 0 );
  vec4 slopGlowMap = texelFetch( uLayerGlow, ivec2( slopLayer, 1 ), 0 );
  // Derivatives in uniform control flow, for the glow map sample below
  vec2 slopUvDx = dFdx( vBlockUv.xy );
  vec2 slopUvDy = dFdy( vBlockUv.xy );
  if ( slopGlow.r > 0.0 ) {
    vec3 slopGlowColour = diffuseColor.rgb;
    float slopHot;
    float slopBright = 1.0;
    if ( slopGlowMap.r > 0.0 ) {
      vec2 slopTexels = vec2( textureSize( uGlowMaps, 0 ).xy );
      vec2 slopUv = ( floor( vBlockUv.xy * slopTexels ) + 0.5 ) / slopTexels;
      slopGlowColour = textureGrad( uGlowMaps, vec3( slopUv, floor( slopGlowMap.r * 255.0 + 0.5 ) ), slopUvDx, slopUvDy ).rgb;
      slopHot = 1.0;
      slopBright = smoothstep( 0.05, 0.4, max( slopGlowColour.r, max( slopGlowColour.g, slopGlowColour.b ) ) );
    } else {
      slopHot = smoothstep( slopGlow.g, slopGlow.g + 0.25, max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) );
    }
    float slopDay = slopLightShape( vBlockLight.x ) * uDaylight;
    float slopDaylight = slopGlowMap.g > 0.5 ? slopDarkGlow( slopDay ) : 1.0 - 0.5 * slopDay;
    float slopPulse = 1.0;
    if ( slopGlow.b > 0.0 ) {
      float slopWave;
      if ( slopGlow.a > 0.5 ) {
        float slopTexelCount = float( textureSize( uBlockTextures, 0 ).x );
        vec3 slopCell = mod( floor( ( vSlopWorld - vSlopNormal * 0.01 ) * slopTexelCount ), 4096.0 );
        float slopSeed = slopHash13( slopCell );
        float slopRate = 0.25 + 0.5 * fract( slopSeed * 7.31 );
        slopWave = 0.5 + 0.5 * sin( 6.2832 * ( uGlowTime * slopRate + slopSeed ) );
        slopWave *= slopWave;
      } else {
        float slopPhase = dot( vSlopWorld, vec3( 0.21, 0.13, 0.17 ) ) + 0.6 * sin( dot( vSlopWorld.xz, vec2( 0.07, -0.05 ) ) );
        slopWave = 0.5 + 0.5 * sin( uGlowTime * 0.9 + slopPhase );
      }
      slopPulse = 1.0 - slopGlow.b * ( 1.0 - slopWave ) * slopBright;
    }
    totalEmissiveRadiance += slopGlowColour * ( slopGlow.r * ${EMISSIVE_MAX_STRENGTH_GLSL} * slopHot * slopPulse * slopDaylight );
  }
}
`

const FRAGMENT_LIGHT = /* glsl */ `
#include <aomap_fragment>
${worldLightFragment('vBlockLight.x', 'vBlockLight.y', 'vBlockLight.z', 'vSlopFlicker')}
`

function patchChunkShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  texture: THREE.Texture,
  glowTexture: THREE.Texture,
  glowMaps: THREE.Texture
): void {
  shader.uniforms.uBlockTextures = { value: texture }
  shader.uniforms.uLayerGlow = { value: glowTexture }
  shader.uniforms.uGlowMaps = { value: glowMaps }
  shader.uniforms.uGlowTime = glowTimeUniform
  shader.uniforms.uDaylight = daylightUniform
  shader.uniforms.uLightFloor = lightFloorUniform
  shader.uniforms.uFlickerSources = flickerSourcesUniform

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = SLOP_FACE_NORMALS[ int( aTex.w + 0.5 ) ];')
    .replace('#include <project_vertex>', VERTEX_SEAM_EXPANSION)
    .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERTEX_VARYINGS}`)

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <map_fragment>', 'diffuseColor *= slopCrispTexel( uBlockTextures, vBlockUv );')
    .replace('#include <emissivemap_fragment>', FRAGMENT_GLOW)
    .replace('#include <aomap_fragment>', FRAGMENT_LIGHT)
}

function createChunkMaterial(
  texture: THREE.Texture,
  glowTexture: THREE.Texture,
  glowMaps: THREE.Texture,
  cutout: boolean
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    // Cutout faces (leaves) are alpha-tested, rendered in the opaque pass
    // (no sorting), double-sided so canopies read from inside too. With MSAA
    // on, alpha-to-coverage turns the hard alpha-test edge into coverage.
    side: cutout ? THREE.DoubleSide : THREE.FrontSide,
    alphaTest: cutout ? 0.5 : 0,
    alphaToCoverage: cutout,
  })
  material.name = cutout ? 'ChunkCutoutMaterial' : 'ChunkOpaqueMaterial'
  material.defines = { ...LIGHT_CURVE_DEFINES }
  material.onBeforeCompile = (shader) => patchChunkShader(shader, texture, glowTexture, glowMaps)
  material.customProgramCacheKey = () => CHUNK_PROGRAM_KEY
  return material
}

/**
 * Get the shared chunk material (null until the block texture array is built).
 */
export function getChunkMaterial(cutout: boolean): THREE.Material | null {
  const textureArray = getBlockTextureArray()
  if (!textureArray) return null
  layerGlowTexture ??= buildLayerGlowTexture(textureArray.layers, textureArray.texture.image.depth, textureArray.glowMaps.layers)
  const glowMaps = textureArray.glowMaps.texture
  if (cutout) {
    cutoutMaterial ??= createChunkMaterial(textureArray.texture, layerGlowTexture, glowMaps, true)
    return cutoutMaterial
  }
  opaqueMaterial ??= createChunkMaterial(textureArray.texture, layerGlowTexture, glowMaps, false)
  return opaqueMaterial
}

/**
 * Shadow-pass material for cutout chunk meshes: discards transparent texels so
 * leaves cast dappled shadows (three's default depth material would need `map`).
 */
export function getChunkCutoutDepthMaterial(): THREE.MeshDepthMaterial | null {
  const textureArray = getBlockTextureArray()
  if (!textureArray) return null
  if (!cutoutDepthMaterial) {
    const texture = textureArray.texture
    const material = new THREE.MeshDepthMaterial()
    material.name = 'ChunkCutoutDepthMaterial'
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBlockTextures = { value: texture }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aTex;\nvarying vec3 vBlockUv;')
        .replace('#include <clipping_planes_vertex>', '#include <clipping_planes_vertex>\nvBlockUv = aTex.xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform sampler2DArray uBlockTextures;\nvarying vec3 vBlockUv;\n${CRISP_TEXEL_SAMPLING_GLSL}`)
        .replace('#include <alphatest_fragment>', 'if ( slopCrispTexel( uBlockTextures, vBlockUv ).a < 0.5 ) discard;')
    }
    material.customProgramCacheKey = () => `${CHUNK_PROGRAM_KEY}-cutout-depth`
    cutoutDepthMaterial = material
  }
  return cutoutDepthMaterial
}
