import * as THREE from 'three'

/**
 * Drifting spores around the player in the Ember Grove: a few hundred faint
 * teal and ember motes in a box around the camera, rising and swaying,
 * wrapped as the player moves. One THREE.Points draw call; fades in and out
 * with the biome. Plain PointsMaterial (no custom shader), fogged like the
 * world.
 */
const COUNT = 220
const HALF_W = 18
const BELOW = 5
const ABOVE = 13
const TEAL = new THREE.Color(0x5ae6cc)
const EMBER = new THREE.Color(0xff9a40)

export class SporeDriftEffect {
  private readonly points: THREE.Points
  private readonly material: THREE.PointsMaterial
  private readonly offsets: Float32Array
  private readonly speeds: Float32Array
  private readonly phases: Float32Array
  private readonly positions: Float32Array
  private opacity = 0
  private time = 0
  private seeded = false

  constructor(scene: THREE.Scene) {
    this.offsets = new Float32Array(COUNT * 3)
    this.speeds = new Float32Array(COUNT)
    this.phases = new Float32Array(COUNT)
    this.positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      this.offsets[i * 3] = (Math.random() * 2 - 1) * HALF_W
      this.offsets[i * 3 + 1] = -BELOW + Math.random() * (BELOW + ABOVE)
      this.offsets[i * 3 + 2] = (Math.random() * 2 - 1) * HALF_W
      this.speeds[i] = 0.15 + Math.random() * 0.35
      this.phases[i] = Math.random() * Math.PI * 2
      const c = Math.random() < 0.7 ? TEAL : EMBER
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.material = new THREE.PointsMaterial({
      map: createMoteTexture(),
      size: 0.11,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.points.visible = false
    this.points.renderOrder = 510 // after the sky dome (500): it does not write depth
    scene.add(this.points)
  }

  /**
   * @param active True while the camera is in the Ember Grove
   */
  update(dt: number, camera: THREE.Vector3, active: boolean): void {
    const target = active ? 0.85 : 0
    this.opacity += (target - this.opacity) * Math.min(1, dt * 1.5)
    if (this.opacity < 0.01) {
      this.points.visible = false
      return
    }
    this.points.visible = true
    this.material.opacity = this.opacity
    this.time += dt

    // Motes live in world space (offsets hold world X/Y/Z once seeded) and
    // wrap around the camera's box, so walking through them reads as motion
    if (!this.seeded) {
      for (let i = 0; i < COUNT; i++) {
        this.offsets[i * 3] += camera.x
        this.offsets[i * 3 + 1] += camera.y
        this.offsets[i * 3 + 2] += camera.z
      }
      this.seeded = true
    }
    const span = BELOW + ABOVE
    for (let i = 0; i < COUNT; i++) {
      const o = i * 3
      this.offsets[o + 1] += this.speeds[i] * dt
      this.offsets[o] = wrap(this.offsets[o], camera.x, HALF_W)
      this.offsets[o + 2] = wrap(this.offsets[o + 2], camera.z, HALF_W)
      const dy = this.offsets[o + 1] - camera.y
      if (dy > ABOVE) this.offsets[o + 1] -= span
      else if (dy < -BELOW) this.offsets[o + 1] += span
      // Gentle sway on a per-mote phase (render only)
      this.positions[o] = this.offsets[o] + Math.sin(this.time * 0.6 + this.phases[i]) * 0.35
      this.positions[o + 1] = this.offsets[o + 1]
      this.positions[o + 2] = this.offsets[o + 2] + Math.cos(this.time * 0.5 + this.phases[i]) * 0.35
    }
    ;(this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }
}

function wrap(v: number, center: number, half: number): number {
  const size = half * 2
  let d = v - center
  d = ((d + half) % size + size) % size - half
  return center + d
}

/** Soft round mote (16×16 radial falloff, white: tinted by vertex colours). */
function createMoteTexture(): THREE.DataTexture {
  const size = 16
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const d = Math.min(1, Math.hypot(dx, dy) * 2)
      const a = Math.pow(1 - d, 1.6)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = Math.round(a * 255)
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}
