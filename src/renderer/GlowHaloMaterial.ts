import * as THREE from 'three'
import { LIGHT_CURVE_DEFINES, LIGHT_CURVE_GLSL } from './lightCurve.ts'
import { daylightUniform } from './worldLightShader.ts'
import { DARK_GLOW_GLSL } from './EmissiveTextures.ts'
import type { IBlockMeshPart } from '../world/interfaces/IBlock.ts'

export interface GlowHaloOptions {
  /**
   * Halo colour at its centre, added to the framebuffer as is (display
   * values: dozens overlap along a ray through a kelp forest, so keep each
   * faint - a few hundredths).
   */
  readonly color: readonly [number, number, number]
  /** Radius in blocks. */
  readonly radius: number
  /** Height of the halo's centre in the cell (block-local, -0.5 floor .. 0.5 top). */
  readonly lift: number
}

/** Halos fade out between these distances (blocks): murky water hides them beyond. */
const FADE_START = 14
const FADE_END = 30

const VERTEX_SHADER = /* glsl */ `
uniform float uDaylight;
uniform float uHaloRadius;
uniform float uHaloLift;
varying vec2 vHaloUv;
varying float vHaloStrength;
${LIGHT_CURVE_GLSL}
${DARK_GLOW_GLSL}

void main() {
  vHaloUv = position.xy / uHaloRadius;
  vHaloStrength = 0.0;
  gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); // off screen unless shown
#if defined( USE_INSTANCING ) && defined( USE_INSTANCING_COLOR )
  // instanceColor carries the cell's light levels (InstancedBlockLight): a
  // halo shows only in the dark, like the plant's own glow
  float dark = slopDarkGlow( slopLightShape( instanceColor.x ) * uDaylight );
  vec4 centre = viewMatrix * modelMatrix * instanceMatrix * vec4( 0.0, uHaloLift, 0.0, 1.0 );
  float dist = length( centre.xyz );
  vHaloStrength = dark * ( 1.0 - smoothstep( ${FADE_START.toFixed(1)}, ${FADE_END.toFixed(1)}, dist ) );
  if ( vHaloStrength > 0.001 ) {
    // A camera-facing disc pulled to the sphere's front: the bed and stems
    // it sits among cut less of it
    centre.xyz *= ( dist - clamp( dist - 0.3, 0.0, uHaloRadius ) ) / max( dist, 0.0001 );
    gl_Position = projectionMatrix * ( centre + vec4( position.xy, 0.0, 0.0 ) );
  }
#endif
}
`

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uHaloColor;
varying vec2 vHaloUv;
varying float vHaloStrength;

void main() {
  // Soft sphere of light (no discard, so depth-hidden halos reject early)
  float glow = max( 1.0 - dot( vHaloUv, vHaloUv ), 0.0 );
  glow *= glow * glow;
  // Display values, no colour-space conversion: sRGB-encoding each faint
  // halo before they add up would make dozens of them blow out to white
  gl_FragColor = vec4( uHaloColor * glow * vHaloStrength, 1.0 );
}
`

/**
 * A glow halo for a glowing water plant (IGlowHaloBlock): one additive
 * camera-facing disc per instance, a soft sphere of light in the water around
 * the plant, so its glow fills the water seen from any side - not just the
 * surface (scatterGlow) or the plant itself. Dark-only, faded with distance.
 * Chunk meshes draw it after the liquids (renderOrder 2) with depth test and
 * no depth write: under water it shows in full, from above the water surface
 * hides it (the surface glow speaks for it there), a crown's halo rising
 * above the surface glows over the water. Shared by every chunk: one
 * geometry and material per plant block.
 */
export function createGlowHalo(options: GlowHaloOptions): IBlockMeshPart {
  const geometry = new THREE.PlaneGeometry(options.radius * 2, options.radius * 2)
  const material = new THREE.ShaderMaterial({
    name: 'GlowHaloMaterial',
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    defines: { ...LIGHT_CURVE_DEFINES },
    uniforms: {
      uDaylight: daylightUniform,
      uHaloRadius: { value: options.radius },
      uHaloLift: { value: options.lift },
      uHaloColor: { value: new THREE.Color(...options.color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  return { geometry, material }
}
