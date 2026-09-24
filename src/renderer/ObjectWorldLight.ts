import * as THREE from 'three'
import {
  daylightUniform, LIGHT_CURVE_DEFINES_GLSL, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment,
} from './worldLightShader.ts'

/**
 * World light for the lit materials of a single object in the main scene
 * (mobs): the material's shader is patched to shade with the shared world
 * light model exactly as terrain does (worldLightFragment) - the scene's
 * lights scaled by the object's sky light × daylight, plus warm block light
 * and the light floor as non-directional light - driven by one per-material
 * uniform holding the (sky, block) light levels at the object.
 *
 * Daylight and the light floor are the shared global uniforms, so they are
 * always current (no per-object refresh needed when they ease).
 *
 * Only for materials owned by one object: the light-level uniform belongs to
 * the material, so a material shared across objects (block instance
 * materials, item displays) must not be patched here.
 */

const PROGRAM_KEY = 'slopmine-object-world-light-v1'

/** Materials whose shaders run three's lighting (reflectedLight + aomap). */
const LIT_SHADER_IDS: ReadonlySet<string> = new Set(['lambert', 'phong', 'standard', 'physical', 'toon'])

const FRAGMENT_PARS = /* glsl */ `
uniform vec2 uObjectLight;
${LIGHT_CURVE_DEFINES_GLSL}
${WORLD_LIGHT_FRAGMENT_PARS}
`

const FRAGMENT_LIGHT = /* glsl */ `
#include <aomap_fragment>
${worldLightFragment('uObjectLight.x', 'uObjectLight.y', '1.0')}
`

/** Uniform holding an object's (sky, block) light levels, 0-15. */
export type ObjectLightUniform = { value: THREE.Vector2 }

/**
 * Patch a lit material (Lambert, Phong, ...) to shade with the world light
 * model at the levels in the returned uniform (initially open sky, 15 / 0).
 * Chains any onBeforeCompile the material already has.
 */
export function applyObjectWorldLight(material: THREE.Material): ObjectLightUniform {
  const uniform: ObjectLightUniform = { value: new THREE.Vector2(15, 0) }
  const previousCompile = material.onBeforeCompile
  const ownKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey
    : null
  const baseKey = ownKey ? '' : previousCompile.toString()
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer)
    shader.uniforms.uObjectLight = uniform
    shader.uniforms.uDaylight = daylightUniform
    shader.uniforms.uLightFloor = lightFloorUniform
    if (!LIT_SHADER_IDS.has(shader.shaderID)) return
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <aomap_fragment>', FRAGMENT_LIGHT)
  }
  material.customProgramCacheKey = () => `${ownKey ? ownKey.call(material) : baseKey}|${PROGRAM_KEY}`
  material.needsUpdate = true
  return uniform
}

/** Set the light levels an applyObjectWorldLight material is shaded with. */
export function setObjectLight(uniform: ObjectLightUniform, packedLight: number): void {
  uniform.value.set(packedLight >> 4, packedLight & 15)
}
