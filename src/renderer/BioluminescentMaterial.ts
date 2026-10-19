import type * as THREE from 'three'
import { DARK_GLOW_GLSL } from './EmissiveTextures.ts'

/**
 * Bioluminescent instanced blocks (glimmercap, lumen fern, glowkelp): the
 * material's emissive glow shows only in the dark - at night, in deep shade,
 * underground, deep under water - and fades out wherever the instance's sky
 * light × daylight is bright, like a dark-only emissive chunk texture
 * (EmissiveTextures `darkOnly`).
 *
 * Patches instanced draws only: it relies on InstancedBlockLight's
 * declarations (vWorldLight, slopLightShape, uDaylight). This patch runs
 * first (InstancedBlockLight chains it) and appends after
 * `#include <aomap_fragment>`, which InstancedBlockLight then expands to the
 * world light block - so the darkness factor applies after it. Block icons,
 * the held item and dropped items always glow. (The instanced check is made
 * here, not with `#ifdef USE_INSTANCING_COLOR`: three defines that in the
 * vertex shader only.)
 *
 * Call once, when the material is created.
 */
export function makeGlowDarkOnly(material: THREE.Material): void {
  const previous = material.onBeforeCompile
  const previousKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey
    : null
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    if (!shader.instancingColor) return
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DARK_GLOW_GLSL}`)
      .replace('#include <aomap_fragment>', /* glsl */ `#include <aomap_fragment>
  totalEmissiveRadiance *= slopDarkGlow( slopLightShape( vWorldLight.x ) * uDaylight );`)
  }
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|slopmine-dark-only-glow-v2`
}
