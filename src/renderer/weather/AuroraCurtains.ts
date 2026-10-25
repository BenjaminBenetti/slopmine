import * as THREE from 'three'

/**
 * Prism Lights (the Crystal Abyss's cavern weather): folded curtains of
 * coloured light hanging under the cavern ceiling around the player - the
 * Hell cousin of the overworld aurora, which the sky dome draws. Two rings of
 * vertical ribbons, additive, self-lit; the rock in front hides them.
 */

const SEGMENTS = 96
const RINGS: readonly { radius: number; bottom: number; top: number; phase: number }[] = [
  { radius: 64, bottom: 108, top: 134, phase: 0 },
  { radius: 96, bottom: 112, top: 138, phase: 2.7 },
]

const VERTEX = /* glsl */ `
attribute float aAngle;
attribute float aHeight;
attribute float aRing;
uniform vec3 uCenter;
uniform float uTime;
uniform vec4 uRings[ ${RINGS.length} ];
varying float vHeight;
varying float vAngle;
varying float vPhase;
void main() {
  vec4 ring = uRings[ int( aRing ) ];
  float wobble = sin( aAngle * 5.0 + uTime * 0.21 + ring.w ) * 7.0 + sin( aAngle * 11.0 - uTime * 0.37 ) * 3.0;
  float r = ring.x + wobble;
  vec3 world = vec3( uCenter.x + cos( aAngle ) * r, mix( ring.y, ring.z, aHeight ), uCenter.z + sin( aAngle ) * r );
  vHeight = aHeight;
  vAngle = aAngle;
  vPhase = ring.w;
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uStrength;
varying float vHeight;
varying float vAngle;
varying float vPhase;
void main() {
  // Bright along the lower hem, fading up into the dark
  float hem = smoothstep( 0.0, 0.08, vHeight ) * exp( -vHeight * 2.6 );
  float rays = 0.55 + 0.45 * sin( vAngle * 160.0 + sin( vAngle * 9.0 + uTime * 0.4 ) * 6.0 + uTime * 0.5 );
  float fold = 0.5 + 0.5 * sin( vAngle * 3.0 + uTime * 0.13 + vPhase );
  vec3 a = vec3( 0.95, 0.25, 1.0 );
  vec3 b = vec3( 0.2, 0.95, 1.0 );
  vec3 c = vec3( 1.0, 0.75, 0.35 );
  vec3 color = mix( mix( a, b, fold ), c, smoothstep( 0.3, 0.9, vHeight ) * 0.6 );
  float alpha = hem * rays * ( 0.4 + 0.6 * fold ) * uStrength * 0.5;
  gl_FragColor = vec4( color * alpha, 1.0 );
  #include <colorspace_fragment>
}
`

export class AuroraCurtains {
  readonly mesh: THREE.Mesh
  private readonly material: THREE.ShaderMaterial
  private time = 0

  constructor() {
    const angles: number[] = []
    const heights: number[] = []
    const rings: number[] = []
    const index: number[] = []
    for (let r = 0; r < RINGS.length; r++) {
      const base = angles.length
      for (let i = 0; i <= SEGMENTS; i++) {
        const a = (i / SEGMENTS) * Math.PI * 2
        for (const h of [0, 1]) {
          angles.push(a)
          heights.push(h)
          rings.push(r)
        }
        if (i > 0) {
          const v = base + i * 2
          index.push(v - 2, v - 1, v, v - 1, v + 1, v)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    // three needs a position attribute to draw; the shader builds the real one
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(angles.length * 3), 3))
    geometry.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1))
    geometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1))
    geometry.setAttribute('aRing', new THREE.Float32BufferAttribute(rings, 1))
    geometry.setIndex(index)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uRings: { value: RINGS.map((r) => new THREE.Vector4(r.radius, r.bottom, r.top, r.phase)) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    this.mesh.visible = false
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.mesh)
  }

  /** @param strength 0-1 (0 hides it) */
  update(dt: number, camera: THREE.Vector3, strength: number): void {
    this.mesh.visible = strength > 0.01
    if (!this.mesh.visible) return
    this.time = (this.time + dt) % 1000
    const u = this.material.uniforms
    ;(u.uCenter.value as THREE.Vector3).copy(camera)
    u.uTime.value = this.time
    u.uStrength.value = strength
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
