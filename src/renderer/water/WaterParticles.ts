import * as THREE from 'three'
import { daylightUniform } from '../worldLightShader.ts'

/**
 * The water's little effects in one GPU point cloud (one draw call): splash
 * droplets thrown up and falling back, bubbles wobbling up to the surface and
 * popping there, and foam rings spreading on the surface (wakes, landings).
 * Particles are written into a ring buffer when emitted (the CPU touches only
 * the new ones); the vertex shader flies them from their start, velocity and
 * birth time. Pixel-art points: hard-edged drops, ring bubbles, speckled foam.
 *
 * Lit by daylight (dim at night), fogged by distance in the shader, drawn
 * after the water (renderOrder 3), no depth write.
 */

export const WATER_PARTICLE_COUNT = 1400

const KIND_DROPLET = 0
const KIND_BUBBLE = 1
const KIND_FOAM = 2

const VERTEX_SHADER = /* glsl */ `
attribute vec4 aStart;  // xyz start, w kind (0 droplet, 1 bubble, 2 foam)
attribute vec4 aVel;    // xyz velocity (bubbles: y = the surface they pop at), w size (blocks)
attribute vec2 aLife;   // born, lifetime (seconds on uTime)
uniform float uTime;
uniform float uPixelScale;
varying float vKind;
varying float vFade;
varying float vAge;

void main() {
  float age = uTime - aLife.x;
  float t = age / max( aLife.y, 1e-3 );
  vKind = aStart.w;
  vAge = t;
  vec3 p = aStart.xyz;
  float size = aVel.w;
  vFade = 0.0;
  if ( t >= 0.0 && t < 1.0 ) {
    if ( aStart.w < 0.5 ) {
      // A droplet: thrown, falls under gravity, shrinks a little
      p += aVel.xyz * age + vec3( 0.0, -16.0, 0.0 ) * age * age * 0.5;
      size *= 1.0 - 0.4 * t;
      vFade = 1.0 - t * t;
    } else if ( aStart.w < 1.5 ) {
      // A bubble: wobbles up and pops at the surface
      float rise = min( aStart.y + age * 1.4, aVel.y - 0.05 );
      p = vec3( aStart.x + sin( age * 9.0 + aStart.x * 7.0 ) * 0.05, rise, aStart.z + cos( age * 8.0 + aStart.z * 5.0 ) * 0.05 );
      vFade = rise >= aVel.y - 0.06 ? 0.0 : 1.0;
    } else {
      // Foam: spreads on the surface and fades
      p += aVel.xyz * age;
      size *= 0.6 + 1.6 * sqrt( t );
      vFade = ( 1.0 - t ) * ( 1.0 - t );
    }
  }
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  // Fade with distance: these are small things
  vFade *= 1.0 - smoothstep( 40.0, 60.0, -mvPosition.z );
  // (capped: a drop flying past the eye stays a drop, not a white square over the view)
  gl_PointSize = vFade > 0.002 ? clamp( uPixelScale * size / max( -mvPosition.z, 0.1 ), 1.5, aStart.w < 0.5 ? 18.0 : 40.0 ) : 0.0;
}
`

const FRAGMENT_SHADER = /* glsl */ `
uniform float uDaylight;
varying float vKind;
varying float vFade;
varying float vAge;

void main() {
  if ( vFade <= 0.002 ) discard;
  // Pixel-art points: snap the point coordinate to a small grid
  vec2 c = floor( gl_PointCoord * 8.0 ) / 7.0 * 2.0 - 1.0;
  float r = length( c );
  vec3 color;
  float alpha;
  if ( vKind < 0.5 ) {
    if ( r > 1.0 ) discard;
    color = mix( vec3( 0.86, 0.94, 1.0 ), vec3( 0.55, 0.75, 0.95 ), r );
    alpha = 0.85;
  } else if ( vKind < 1.5 ) {
    // A ring with a highlight
    if ( r > 1.0 || r < 0.55 ) discard;
    color = vec3( 0.82, 0.93, 1.0 );
    alpha = 0.7;
    if ( c.x < -0.2 && c.y > 0.2 ) color = vec3( 1.0 );
  } else {
    // Speckled foam, thinning to its rim as it spreads
    if ( r > 1.0 ) discard;
    float speck = fract( sin( dot( floor( gl_PointCoord * 8.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    if ( speck < 0.35 + 0.45 * vAge ) discard;
    color = vec3( 0.94, 0.97, 1.0 );
    alpha = 0.75;
  }
  gl_FragColor = vec4( color * ( 0.15 + 0.85 * uDaylight ), alpha * vFade );
  #include <colorspace_fragment>
}
`

export class WaterParticles {
  readonly object: THREE.Points
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly start: Float32Array
  private readonly velocity: Float32Array
  private readonly life: Float32Array
  private next = 0
  private time = 0
  private dirtyFrom = Infinity
  private dirtyTo = -1

  constructor() {
    this.start = new Float32Array(WATER_PARTICLE_COUNT * 4)
    this.velocity = new Float32Array(WATER_PARTICLE_COUNT * 4)
    this.life = new Float32Array(WATER_PARTICLE_COUNT * 2)
    // Unborn: dead long ago
    for (let i = 0; i < WATER_PARTICLE_COUNT; i++) this.life[i * 2] = -1000
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WATER_PARTICLE_COUNT * 3), 3))
    this.geometry.setAttribute('aStart', new THREE.BufferAttribute(this.start, 4).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('aVel', new THREE.BufferAttribute(this.velocity, 4).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.life, 2).setUsage(THREE.DynamicDrawUsage))
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPixelScale: { value: 300 },
        uDaylight: daylightUniform,
      },
      transparent: true,
      depthWrite: false,
    })
    this.object = new THREE.Points(this.geometry, this.material)
    this.object.frustumCulled = false
    this.object.renderOrder = 3
  }

  private emit(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, lifetime: number): void {
    const i = this.next
    this.next = (this.next + 1) % WATER_PARTICLE_COUNT
    this.start[i * 4] = x
    this.start[i * 4 + 1] = y
    this.start[i * 4 + 2] = z
    this.start[i * 4 + 3] = kind
    this.velocity[i * 4] = vx
    this.velocity[i * 4 + 1] = vy
    this.velocity[i * 4 + 2] = vz
    this.velocity[i * 4 + 3] = size
    this.life[i * 2] = this.time
    this.life[i * 2 + 1] = lifetime
    if (i < this.dirtyFrom) this.dirtyFrom = i
    if (i > this.dirtyTo) this.dirtyTo = i
  }

  /** Something hit the water at (x, surfaceY, z): droplets thrown up and a ring of foam (`strength` 0-1+). */
  splash(x: number, surfaceY: number, z: number, strength: number): void {
    const count = Math.round(6 + 22 * Math.min(1.5, strength))
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const out = (0.6 + Math.random() * 1.8) * (0.6 + strength * 0.6)
      this.emit(KIND_DROPLET, x + Math.cos(a) * 0.25, surfaceY + 0.05, z + Math.sin(a) * 0.25,
        Math.cos(a) * out, 2.5 + Math.random() * 4 * Math.min(1.5, strength + 0.3), Math.sin(a) * out,
        0.035 + Math.random() * 0.035, 0.45 + Math.random() * 0.4)
    }
    for (let k = 0; k < 4 + Math.round(strength * 4); k++) {
      const a = Math.random() * Math.PI * 2
      this.emit(KIND_FOAM, x + Math.cos(a) * 0.2, surfaceY + 0.02, z + Math.sin(a) * 0.2,
        Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9, 0.35 + strength * 0.25, 1.1 + Math.random() * 0.6)
    }
  }

  /** Bubbles from (x, y, z) up to the surface at `surfaceY`. */
  bubbles(x: number, y: number, z: number, surfaceY: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const delay = k * 0.06
      this.emit(KIND_BUBBLE, x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.2 - delay * 1.4, z + (Math.random() - 0.5) * 0.3,
        0, surfaceY, 0, 0.05 + Math.random() * 0.05, Math.max(0.3, (surfaceY - y) / 1.4 + delay + 0.1))
    }
  }

  /** Foam behind something moving on the surface (a boat's wake): `dirX/Z` is the way it moves. */
  wake(x: number, surfaceY: number, z: number, dirX: number, dirZ: number, speed: number): void {
    const sideX = -dirZ
    const sideZ = dirX
    for (const side of [-1, 1]) {
      this.emit(KIND_FOAM, x + sideX * side * 0.5, surfaceY + 0.03, z + sideZ * side * 0.5,
        sideX * side * 0.6 - dirX * 0.2, 0, sideZ * side * 0.6 - dirZ * 0.2, 0.3 + Math.min(0.4, speed * 0.04), 1.6)
    }
    if (speed > 5 && Math.random() < 0.5) {
      // Spray off the bow at speed
      this.emit(KIND_DROPLET, x + dirX * 2.6, surfaceY + 0.1, z + dirZ * 2.6,
        dirX * speed * 0.5 + sideX * (Math.random() - 0.5) * 2, 2 + Math.random() * 2, dirZ * speed * 0.5 + sideZ * (Math.random() - 0.5) * 2,
        0.04, 0.5)
    }
  }

  /** Advance the clock and upload what was emitted. `pixelScale`: drawing-buffer height / (2·tan(fov/2)). */
  update(deltaTime: number, pixelScale: number): void {
    this.time += deltaTime
    this.material.uniforms.uTime.value = this.time
    this.material.uniforms.uPixelScale.value = pixelScale
    if (this.dirtyTo < 0) return
    const from = this.dirtyFrom
    const to = this.dirtyTo
    for (const [name, size] of [['aStart', 4], ['aVel', 4], ['aLife', 2]] as const) {
      const attribute = this.geometry.getAttribute(name) as THREE.BufferAttribute
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(from * size, (to - from + 1) * size)
      attribute.needsUpdate = true
    }
    this.dirtyFrom = Infinity
    this.dirtyTo = -1
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
