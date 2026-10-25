import * as THREE from 'three'

/**
 * Lightning bolts and falling stars: camera-facing ribbons along jagged
 * polylines, additive, self-lit (a white-hot core in a coloured glow). Each
 * bolt is its own small mesh that lives about half a second, flickering the
 * way real strokes do (a return stroke, a dim gap, restrikes). Falling stars
 * are a short glowing streak sliding down to where they land.
 */

/** How long a bolt is drawn (seconds) and its brightness over that time. */
const BOLT_LIFE = 0.55
const BOLT_FLICKER: readonly [number, number][] = [[0, 1], [0.06, 1], [0.08, 0.25], [0.13, 0.25], [0.15, 1], [0.22, 0.85], [0.25, 0.35], [0.3, 0.7], [0.55, 0]]
/** Ribbon width of the main channel (blocks; the glow fills most of it, the core is a sliver). */
const BOLT_WIDTH = 2.6
const BRANCH_WIDTH = 1.1
/** Falling star: travel time (s), streak length (blocks), ribbon width. */
const STAR_TRAVEL = 1.5
const STAR_TAIL = 14
const STAR_WIDTH = 1.6

const VERTEX = /* glsl */ `
attribute vec3 aOther;
attribute float aSide;
attribute float aWidth;
varying float vAcross;
void main() {
  vec3 dir = normalize( aOther - position );
  vec3 toCam = normalize( cameraPosition - position );
  vec3 side = normalize( cross( dir, toCam ) + vec3( 1e-5 ) );
  vec3 world = position + side * aSide * aWidth * 0.5;
  vAcross = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vAcross;
void main() {
  float x = abs( vAcross );
  float core = 1.0 - smoothstep( 0.04, 0.16, x );
  float glow = pow( 1.0 - x, 2.5 );
  vec3 color = uColor * glow * 0.9 + vec3( 1.0 ) * core * 1.4;
  gl_FragColor = vec4( color * uAlpha, 1.0 );
  #include <colorspace_fragment>
}
`

interface Effect {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  age: number
  kind: 'bolt' | 'star'
  /** Star: start and end of its fall. */
  from?: THREE.Vector3
  to?: THREE.Vector3
  onLand?: () => void
}

/** Brightness of a bolt at an age (0 when gone). */
export function boltBrightness(age: number): number {
  if (age >= BOLT_LIFE) return 0
  for (let i = 1; i < BOLT_FLICKER.length; i++) {
    const [t1, b1] = BOLT_FLICKER[i]
    if (age <= t1) {
      const [t0, b0] = BOLT_FLICKER[i - 1]
      return b0 + ((b1 - b0) * (age - t0)) / Math.max(1e-6, t1 - t0)
    }
  }
  return 0
}

export class LightningRenderer {
  private readonly group = new THREE.Group()
  private readonly effects: Effect[] = []

  addTo(scene: THREE.Scene): void {
    scene.add(this.group)
  }

  /**
   * A bolt from `top` down to `ground` (world positions), with branches.
   * Returns the bolt's polyline (the main channel) for anything else that
   * wants it.
   */
  strike(top: THREE.Vector3, ground: THREE.Vector3, color: THREE.Color): void {
    const strips: { points: THREE.Vector3[]; width: number }[] = []
    const main = jaggedPath(top, ground, 7, 0.32)
    strips.push({ points: main, width: BOLT_WIDTH })
    const branches = 2 + Math.floor(Math.random() * 4)
    for (let b = 0; b < branches; b++) {
      const at = Math.floor(main.length * (0.15 + Math.random() * 0.6))
      const start = main[at]
      const drop = top.distanceTo(ground) * (0.12 + Math.random() * 0.25)
      const end = start.clone().add(new THREE.Vector3((Math.random() - 0.5) * drop * 1.2, -drop, (Math.random() - 0.5) * drop * 1.2))
      strips.push({ points: jaggedPath(start, end, 5, 0.38), width: BRANCH_WIDTH })
    }
    this.add('bolt', strips, color)
  }

  /** A falling star from `from` to `to`; `onLand` runs when it arrives. */
  fallingStar(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, onLand: () => void): void {
    const effect = this.add('star', [{ points: [from.clone(), from.clone()], width: STAR_WIDTH }], color)
    effect.from = from.clone()
    effect.to = to.clone()
    effect.onLand = onLand
  }

  private add(kind: Effect['kind'], strips: { points: THREE.Vector3[]; width: number }[], color: THREE.Color): Effect {
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(buildRibbons(strips), material)
    mesh.frustumCulled = false
    mesh.renderOrder = 6
    this.group.add(mesh)
    const effect: Effect = { mesh, material, age: 0, kind }
    this.effects.push(effect)
    return effect
  }

  /** Brightest bolt now (0-1) and where it is, for the sky and world flash. */
  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]
      e.age += dt
      if (e.kind === 'bolt') {
        const b = boltBrightness(e.age)
        e.material.uniforms.uAlpha.value = b
        if (e.age >= BOLT_LIFE) this.remove(i)
      } else {
        const k = Math.min(1, e.age / STAR_TRAVEL)
        const head = e.from!.clone().lerp(e.to!, k * k * (0.4 + 0.6 * k) / (0.4 + 0.6))
        const dir = e.to!.clone().sub(e.from!).normalize()
        const tail = head.clone().addScaledVector(dir, -STAR_TAIL * (0.4 + 0.6 * (1 - k)))
        updateRibbon(e.mesh.geometry as THREE.BufferGeometry, tail, head)
        e.material.uniforms.uAlpha.value = 0.4 + 0.6 * Math.min(1, e.age * 4)
        if (k >= 1) {
          e.onLand?.()
          this.remove(i)
        }
      }
    }
  }

  private remove(i: number): void {
    const e = this.effects[i]
    this.group.remove(e.mesh)
    e.mesh.geometry.dispose()
    e.material.dispose()
    this.effects.splice(i, 1)
  }
}

/** A jagged path from a to b: midpoint displacement, `levels` deep, offsets `rough` × segment length. */
function jaggedPath(a: THREE.Vector3, b: THREE.Vector3, levels: number, rough: number): THREE.Vector3[] {
  let points = [a.clone(), b.clone()]
  for (let level = 0; level < levels; level++) {
    const next: THREE.Vector3[] = [points[0]]
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1]
      const p1 = points[i]
      const len = p0.distanceTo(p1)
      const mid = p0.clone().add(p1).multiplyScalar(0.5)
      mid.x += (Math.random() - 0.5) * len * rough
      mid.z += (Math.random() - 0.5) * len * rough
      mid.y += (Math.random() - 0.5) * len * rough * 0.3
      next.push(mid, p1)
    }
    points = next
  }
  return points
}

/** Ribbon geometry for polylines: two vertices per point, facing the camera in the shader. */
function buildRibbons(strips: { points: THREE.Vector3[]; width: number }[]): THREE.BufferGeometry {
  const positions: number[] = []
  const others: number[] = []
  const sides: number[] = []
  const widths: number[] = []
  const index: number[] = []
  let base = 0
  for (const { points, width } of strips) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      // The neighbour that gives the segment direction (the previous one, mirrored, at the end)
      const o = i < points.length - 1 ? points[i + 1] : p.clone().multiplyScalar(2).sub(points[i - 1])
      // Thin toward the tip
      const w = width * (1 - (0.6 * i) / points.length)
      for (const side of [-1, 1]) {
        positions.push(p.x, p.y, p.z)
        others.push(o.x, o.y, o.z)
        sides.push(side)
        widths.push(w)
      }
      if (i > 0) {
        const v = base + i * 2
        index.push(v - 2, v - 1, v, v - 1, v + 1, v)
      }
    }
    base += points.length * 2
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aOther', new THREE.Float32BufferAttribute(others, 3))
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1))
  geometry.setAttribute('aWidth', new THREE.Float32BufferAttribute(widths, 1))
  geometry.setIndex(index)
  return geometry
}

/** Move a two-point ribbon (a falling star) to tail → head. */
function updateRibbon(geometry: THREE.BufferGeometry, tail: THREE.Vector3, head: THREE.Vector3): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const other = geometry.getAttribute('aOther') as THREE.BufferAttribute
  const ahead = head.clone().multiplyScalar(2).sub(tail)
  position.setXYZ(0, tail.x, tail.y, tail.z)
  position.setXYZ(1, tail.x, tail.y, tail.z)
  position.setXYZ(2, head.x, head.y, head.z)
  position.setXYZ(3, head.x, head.y, head.z)
  other.setXYZ(0, head.x, head.y, head.z)
  other.setXYZ(1, head.x, head.y, head.z)
  other.setXYZ(2, ahead.x, ahead.y, ahead.z)
  other.setXYZ(3, ahead.x, ahead.y, ahead.z)
  position.needsUpdate = true
  other.needsUpdate = true
}
