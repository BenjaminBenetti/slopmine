import * as THREE from 'three'
import { getBlockTextureArray } from './BlockTextureArray.ts'
import { CRISP_TEXEL_SAMPLING_GLSL } from './crispTexelSampling.ts'
import { buildLayerGlowTexture, EMISSIVE_MAX_STRENGTH_GLSL } from './EmissiveTextures.ts'
import { LIGHT_CURVE_DEFINES } from './lightCurve.ts'
import {
  daylightUniform, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment,
} from './worldLightShader.ts'
import { CHUNK_LIGHT_SCALE } from './ChunkVertexFormat.ts'

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
 *   dark instead of being lit only by their neighbours' light.
 *
 * Curve constants come from lightCurve.ts (injected as defines).
 */

const CHUNK_PROGRAM_KEY = 'slopmine-chunk-v4'

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
`

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2DArray uBlockTextures;
uniform sampler2D uLayerGlow;
varying vec3 vBlockUv;
varying vec3 vBlockLight;
${CRISP_TEXEL_SAMPLING_GLSL}
${WORLD_LIGHT_FRAGMENT_PARS}
`

// Emissive texels: glow strength/threshold per texture layer. Hot texels add
// their own colour as light; open daylight washes the glow out by half.
const FRAGMENT_GLOW = /* glsl */ `
#include <emissivemap_fragment>
{
  vec4 slopGlow = texelFetch( uLayerGlow, ivec2( int( vBlockUv.z + 0.5 ), 0 ), 0 );
  if ( slopGlow.r > 0.0 ) {
    float slopHot = smoothstep( slopGlow.g, slopGlow.g + 0.25, max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) );
    float slopDay = slopLightShape( vBlockLight.x ) * uDaylight;
    totalEmissiveRadiance += diffuseColor.rgb * ( slopGlow.r * ${EMISSIVE_MAX_STRENGTH_GLSL} * slopHot * ( 1.0 - 0.5 * slopDay ) );
  }
}
`

const FRAGMENT_LIGHT = /* glsl */ `
#include <aomap_fragment>
${worldLightFragment('vBlockLight.x', 'vBlockLight.y', 'vBlockLight.z')}
`

function patchChunkShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  texture: THREE.Texture,
  glowTexture: THREE.Texture
): void {
  shader.uniforms.uBlockTextures = { value: texture }
  shader.uniforms.uLayerGlow = { value: glowTexture }
  shader.uniforms.uDaylight = daylightUniform
  shader.uniforms.uLightFloor = lightFloorUniform

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

function createChunkMaterial(texture: THREE.Texture, glowTexture: THREE.Texture, cutout: boolean): THREE.MeshLambertMaterial {
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
  material.onBeforeCompile = (shader) => patchChunkShader(shader, texture, glowTexture)
  material.customProgramCacheKey = () => CHUNK_PROGRAM_KEY
  return material
}

/**
 * Get the shared chunk material (null until the block texture array is built).
 */
export function getChunkMaterial(cutout: boolean): THREE.Material | null {
  const textureArray = getBlockTextureArray()
  if (!textureArray) return null
  layerGlowTexture ??= buildLayerGlowTexture(textureArray.layers, textureArray.texture.image.depth)
  if (cutout) {
    cutoutMaterial ??= createChunkMaterial(textureArray.texture, layerGlowTexture, true)
    return cutoutMaterial
  }
  opaqueMaterial ??= createChunkMaterial(textureArray.texture, layerGlowTexture, false)
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
