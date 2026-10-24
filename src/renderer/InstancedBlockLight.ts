import type * as THREE from 'three'
import {
  daylightUniform, LIGHT_CURVE_DEFINES_GLSL, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment,
} from './worldLightShader.ts'
import { FLICKER_GLSL, flickerSourcesUniform } from './FlickerLights.ts'

/**
 * World light for instanced (non-greedy) blocks: torches, plants, doors,
 * slabs, stairs, glass, ladders, ...
 *
 * Each instance's `instanceColor` carries its light levels, (sky, block, 0)
 * in 0-15, instead of a tint. The block's material is patched so that, for
 * instanced draws only, those levels feed the same light model as terrain
 * (worldLightShader.ts): sky light scales the scene's lights, block light adds
 * warm non-directional light, plus the floor. Unlit parts (MeshBasicMaterial,
 * e.g. torch embers) ignore world light and stay full-bright.
 *
 * SHARED MATERIALS: `block.getInstanceMaterial()` materials are also used by
 * block icons, the held item, dropped items and shelves (see
 * renderer/itemdisplay). The patch only touches program variants compiled with
 * `instancingColor` (every vertex edit is additionally under
 * `#ifdef USE_INSTANCING_COLOR`), so every non-instanced use compiles exactly
 * the shader it did before. The only uniforms added are the global daylight,
 * light-floor and flicker (FlickerLights.ts) objects, identical for every chunk.
 */

const PROGRAM_KEY = 'slopmine-instanced-world-light-v1'

/** Materials whose shaders run three's lighting (reflectedLight + aomap). */
const LIT_SHADER_IDS: ReadonlySet<string> = new Set(['lambert', 'phong', 'standard', 'physical', 'toon'])

const VERTEX_PARS = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
varying vec2 vWorldLight;
varying vec3 vWorldFlicker;
${FLICKER_GLSL}
#endif
`

// instanceColor holds light levels, not a tint: rebuild vColor without it
// (keeping any vertex colours) and hand the levels to the fragment shader.
const VERTEX_COLOR = /* glsl */ `
#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vWorldLight = instanceColor.xy;
  vWorldFlicker = slopFlicker( ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz );
  vColor.xyz = vec3( 1.0 );
  #ifdef USE_COLOR
    vColor.xyz *= color.xyz;
  #endif
#endif
`

const FRAGMENT_PARS = /* glsl */ `
varying vec2 vWorldLight;
varying vec3 vWorldFlicker;
${LIGHT_CURVE_DEFINES_GLSL}
${WORLD_LIGHT_FRAGMENT_PARS}
`

const FRAGMENT_LIGHT = /* glsl */ `
#include <aomap_fragment>
${worldLightFragment('vWorldLight.x', 'vWorldLight.y', '1.0', 'vWorldFlicker')}
`

const prepared = new WeakSet<THREE.Material>()

function patchShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  // Present in every variant: three keeps one uniforms object per material
  // (from the most recently compiled variant), so a uniform added to one
  // variant only could go missing from another.
  shader.uniforms.uDaylight = daylightUniform
  shader.uniforms.uLightFloor = lightFloorUniform
  shader.uniforms.uFlickerSources = flickerSourcesUniform

  if (!shader.instancingColor) return

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <color_vertex>', VERTEX_COLOR)

  if (LIT_SHADER_IDS.has(shader.shaderID)) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <aomap_fragment>', FRAGMENT_LIGHT)
  }
}

function prepareMaterial(material: THREE.Material): void {
  if (prepared.has(material)) return
  prepared.add(material)

  // Chain any patch the block already installs. three's default cache key is
  // the onBeforeCompile source, so capture the block's own before replacing it.
  const previousCompile = material.onBeforeCompile
  const ownKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey
    : null
  const baseKey = ownKey ? '' : previousCompile.toString()
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer)
    patchShader(shader)
  }
  material.customProgramCacheKey = () => `${ownKey ? ownKey.call(material) : baseKey}|${PROGRAM_KEY}`
  // Re-resolve programs already compiled for other surfaces (same output)
  material.needsUpdate = true
}

/**
 * Make a block instance material (or material array) interpret instanceColor
 * as world light levels. Idempotent; call before rendering it instanced.
 */
export function prepareInstancedBlockMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) prepareMaterial(m)
  } else {
    prepareMaterial(material)
  }
}

/**
 * Write one instance's light into an instanceColor array (3 floats per
 * instance) from a packed light byte (sky << 4 | block).
 */
export function writeInstanceLight(target: Float32Array, instance: number, packedLight: number): void {
  const o = instance * 3
  target[o] = packedLight >> 4
  target[o + 1] = packedLight & 15
  target[o + 2] = 0
}
