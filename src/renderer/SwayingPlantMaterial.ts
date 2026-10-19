import type * as THREE from 'three'
import { glowTimeUniform } from './glowClock.ts'

export interface SwayOptions {
  /** Largest sideways drift (blocks). */
  readonly amplitude: number
  /** Radians per second of the sway. */
  readonly speed: number
}

/**
 * Water plants that wave in the current (glowkelp, lanternweed): a vertex
 * patch on instanced draws that drifts each vertex sideways by a slow wave
 * of its world height and its column - so a strand of stacked kelp segments
 * bends as one (the joints meet, the wave travels up the strand). The drift
 * is applied in world space (undone through the instance's rotation), so a
 * placed segment facing any way sways with the rest. Display meshes (icons,
 * held item) stay still. Chain-safe with other material patches; call once,
 * when the material is created.
 */
export function makeSwayInCurrent(material: THREE.Material, options: SwayOptions): void {
  const previous = material.onBeforeCompile
  const previousKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey
    : null
  const amplitude = options.amplitude.toFixed(3)
  const speed = options.speed.toFixed(3)
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    // In every variant: three keeps one uniforms object per material
    shader.uniforms.uSwayTime = glowTimeUniform
    if (!shader.instancing) return
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSwayTime;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
{
  float swayHeight = ( instanceMatrix * vec4( transformed, 1.0 ) ).y;
  vec2 swayColumn = instanceMatrix[3].xz;
  float swayPhase = uSwayTime * ${speed} + swayHeight * 0.55 + dot( swayColumn, vec2( 0.37, 0.61 ) );
  vec3 swayDrift = vec3( sin( swayPhase ), 0.0, 0.6 * cos( swayPhase * 0.83 + 1.7 ) ) * ${amplitude};
  transformed += transpose( mat3( instanceMatrix ) ) * swayDrift;
}`)
  }
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|sway-${amplitude}-${speed}`
}
