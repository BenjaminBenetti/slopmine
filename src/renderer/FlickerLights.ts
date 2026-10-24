import * as THREE from 'three'
import { glowTimeUniform } from './glowClock.ts'

/**
 * Firelight (campfires): block light is baked into light levels (one warm
 * colour for every emitter), so a fire's flicker and its oranger light are a
 * shader effect - the world light shader multiplies its block-light colour by
 * `slopFlicker(world position)`: brightness 1 plus each nearby fire's current
 * swing, faded out over the light's reach, times a tint toward orange near
 * the fires. Every frame the sources nearest the camera get a slot with their
 * own slow swing (a sum of sines seeded by position, so neighbouring fires
 * never pulse in step). Costs no light work; other block light inside a
 * fire's reach (a torch beside it) flickers and warms with it.
 *
 * Applied to chunk faces, instanced blocks and foliage - what surrounds a fire.
 * Mobs and the held item keep steady light.
 *
 * Sources: blocks with `properties.lightFlicker`, registered by the chunk mesh
 * that draws them (GreedyChunkMesh: on build, removed on dispose).
 */

/** Sources that flicker at once (the nearest to the camera). */
export const FLICKER_SLOTS = 6

/** Blocks over which a source's flicker fades to nothing (a light level 14 emitter's reach). */
const FLICKER_REACH = 14

/** Largest swing of a source's block light (fraction). Play feedback: ±22% at twice the speed was flashy. */
const FLICKER_AMOUNT = 0.11

/** Block-light colour multiplier near a fire (more orange than the shared BLOCK_LIGHT_COLOR). */
const FIRE_TINT: readonly [number, number, number] = [1.1, 0.92, 0.7]

/** Sources farther than this from the camera don't get a slot. */
const MAX_DISTANCE = 64

/** Per slot: xyz = the source's cell centre, w = its current swing (0 = unused). */
export const flickerSourcesUniform = {
  value: Array.from({ length: FLICKER_SLOTS }, () => new THREE.Vector4(0, -1e4, 0, 0)),
}

/**
 * GLSL: the uniform and `vec3 slopFlicker( vec3 worldPosition )`, the
 * block-light colour multiplier (use in a vertex shader, pass on as a varying).
 * The tint holds near a fire and fades out over the last ~60% of its reach.
 */
export const FLICKER_GLSL = /* glsl */ `
uniform vec4 uFlickerSources[ ${FLICKER_SLOTS} ];
vec3 slopFlicker( vec3 p ) {
  float f = 1.0;
  float near = 0.0;
  for ( int i = 0; i < ${FLICKER_SLOTS}; i++ ) {
    vec4 s = uFlickerSources[ i ];
    float fade = clamp( 1.0 - distance( p, s.xyz ) * ${(1 / FLICKER_REACH).toFixed(5)}, 0.0, 1.0 );
    f += s.w * fade;
    near = max( near, fade );
  }
  vec3 tint = vec3( ${FIRE_TINT.map((c) => c.toFixed(3)).join(', ')} );
  return max( f, 0.0 ) * mix( vec3( 1.0 ), tint, min( near * 1.6, 1.0 ) );
}
`

/** Cell centres (xyz triples) of each owner's flickering sources. */
const sources = new Map<object, Float32Array>()

/** Register an owner's sources (cell centres, xyz triples), or remove them (null). */
export function setFlickerLights(owner: object, positions: Float32Array | null): void {
  if (positions && positions.length > 0) sources.set(owner, positions)
  else sources.delete(owner)
}

const nearest: Array<{ d: number; x: number; y: number; z: number }> = Array.from(
  { length: FLICKER_SLOTS }, () => ({ d: Infinity, x: 0, y: 0, z: 0 })
)

/** Give the sources nearest the camera their slots and swings. Once per frame. */
export function updateFlickerLights(camera: THREE.Vector3): void {
  for (const slot of nearest) slot.d = Infinity
  const maxD2 = MAX_DISTANCE * MAX_DISTANCE
  for (const positions of sources.values()) {
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]
      const z = positions[i + 2]
      const d = (x - camera.x) ** 2 + (y - camera.y) ** 2 + (z - camera.z) ** 2
      if (d > maxD2 || d >= nearest[FLICKER_SLOTS - 1].d) continue
      // Insert in order, dropping the farthest
      let j = FLICKER_SLOTS - 1
      while (j > 0 && nearest[j - 1].d > d) {
        const prev = nearest[j - 1]
        const cur = nearest[j]
        cur.d = prev.d; cur.x = prev.x; cur.y = prev.y; cur.z = prev.z
        j--
      }
      const slot = nearest[j]
      slot.d = d; slot.x = x; slot.y = y; slot.z = z
    }
  }
  const t = glowTimeUniform.value
  for (let i = 0; i < FLICKER_SLOTS; i++) {
    const slot = nearest[i]
    const target = flickerSourcesUniform.value[i]
    if (slot.d === Infinity) {
      target.w = 0
      continue
    }
    const seed = Math.abs(Math.sin(slot.x * 12.9898 + slot.y * 4.1414 + slot.z * 78.233)) * 100
    const swing = 0.55 * Math.sin(t * 2.3 + seed) + 0.3 * Math.sin(t * 5.1 + seed * 1.9) + 0.15 * Math.sin(t * 8.7 + seed * 2.7)
    target.set(slot.x, slot.y, slot.z, swing * FLICKER_AMOUNT)
  }
}
