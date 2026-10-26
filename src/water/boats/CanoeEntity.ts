import * as THREE from 'three'
import { optimizeEntityMesh } from '../../entities/EntityMeshOptimizer.ts'
import { playSound } from '../../audio/SoundHooks.ts'
import { waterSplash } from '../WaterEffects.ts'
import { BoatEntity, type BoatConfig, type BoatDrive, type BoatHandling } from './BoatEntity.ts'

const S = 0.0625 // 1 "pixel" = 1/16 block

// Colours: red cedar strips, darker gunwales, a pale ash paddle
const CEDAR = 0xa8653c
const CEDAR_DARK = 0x7c4527
const GUNWALE = 0x5c321c
const ASH = 0xc9a874
const BLADE = 0xb08a58

/** Paddling (W) and backing (S), blocks/s: twice the first sailboat in a breeze, whatever the wind. */
const PADDLE_SPEED = 9.5
const BACK_SPEED = -3
/** Seconds (time constants) to get up to speed, to back water, and to glide to rest. */
const SPEED_UP = 1.6
const BACKING = 1
const GLIDE = 2.6
/** Paddle strokes per second (one side, then the other). */
const STROKES = 1.4

const HANDLING: BoatHandling = {
  draft: 0.2,
  bob: 0.035,
  // Nimble: a paddle stroke on one side turns it on the spot
  turnBase: 1.5,
  turnPerSpeed: 0.04,
  turnMax: 1.9,
  hullPoints: [[1.45, 0], [-1.45, 0], [0, 0.42], [0, -0.42], [0.85, 0.3], [0.85, -0.3], [-0.85, 0.3], [-0.85, -0.3]],
  sternOffset: 1.4,
  hitsToBreak: 3,
  seatForward: -0.45,
  seatUp: 0.18,
}

/**
 * A cedar canoe: a long narrow hull, all wood - the quick craft to make and
 * the steady way across a lake. Paddled at about twice the first sailboat's
 * speed in a breeze, whatever the wind (the sailboat outruns it with the
 * wind across her). The rider strokes the paddle on one side, then the
 * other; A/D turn it, even at rest. Three hits break it into a canoe item.
 */
export class CanoeEntity extends BoatEntity {
  readonly type = 'canoe'
  protected readonly handling = HANDLING

  /** Stroke cycle (radians: 0-pi the left side, pi-2pi the right). */
  private stroke = 0
  private strokeHalf = -1
  private paddleSide = 0
  private paddleSweep = 0
  /** 0 = the paddle lies along the canoe, 1 = held up, paddling. */
  private paddling = 0
  private roll = 0

  // Model parts
  private hull: THREE.Group | null = null
  private paddle: THREE.Group | null = null

  constructor(config: BoatConfig) {
    super('canoe', config, new THREE.Vector3(1.3, 0.7, 1.3))
  }

  // --- Model ---

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const lit = (color: number): THREE.MeshLambertMaterial => {
      const material = new THREE.MeshLambertMaterial({ color })
      this.registerMaterialForLighting(material)
      return material
    }
    const cedar = lit(CEDAR)
    const cedarDark = lit(CEDAR_DARK)
    const gunwale = lit(GUNWALE)
    const ash = lit(ASH)
    const blade = lit(BLADE)
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rotY = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.rotation.y = rotY
      parent.add(mesh)
      return mesh
    }

    const hull = new THREE.Group()
    root.add(hull)
    this.hull = hull
    // Bottom: wide amidships, tapering to both ends (+Z is the bow)
    box(9, 1.5, 28, cedarDark, 0, 0.75, 0, hull)
    for (const end of [-1, 1]) {
      box(6, 1.5, 7, cedarDark, 0, 1.25, end * 17.5, hull)
      box(3, 1.5, 5, cedarDark, 0, 2, end * 22.5, hull)
    }
    for (const side of [-1, 1]) {
      // Sides amidships, then sweeping in to the stems
      box(1.4, 6, 28, cedar, side * 5, 3.5, 0, hull)
      box(1.6, 1, 28, gunwale, side * 5, 6.8, 0, hull)
      for (const end of [-1, 1]) {
        const angle = side * end * -0.42
        box(1.4, 6, 12, cedar, side * 2.7, 4, end * 19.2, hull, angle)
        box(1.6, 1, 12, gunwale, side * 2.7, 7.3, end * 19.2, hull, angle)
      }
    }
    // Stems: the ends rise a little
    for (const end of [-1, 1]) {
      box(1.6, 9, 1.6, gunwale, 0, 4.5, end * 24.5, hull)
      box(1.6, 1.6, 2.4, gunwale, 0, 9.2, end * 24, hull)
    }
    // Seats (thwarts)
    box(9, 1, 3, cedarDark, 0, 4.5, HANDLING.seatForward / S, hull)
    box(8, 1, 2.5, cedarDark, 0, 4.5, 10, hull)

    // The paddle, pivoting at the rider's hands: grip, shaft, blade
    const paddle = new THREE.Group()
    paddle.position.set(0, 5 * S, HANDLING.seatForward + 5 * S)
    box(3, 1.2, 1.2, ash, 0, 3, 0, paddle)
    box(1, 24, 1, ash, 0, -9, 0, paddle)
    box(4.5, 8, 0.8, blade, 0, -24, 0, paddle)
    hull.add(paddle)
    this.paddle = paddle

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [hull, paddle],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    // Keep the water out of the hull: inside the walls, 2 pixels above the waterline (3.2)
    this.addWaterMask(hull, [[4.1, -13.4], [4.1, 13.4], [0.8, 21.5], [-0.8, 21.5], [-4.1, 13.4], [-4.1, -13.4], [-0.8, -21.5], [0.8, -21.5]], 5.2, S)
    return root
  }

  // --- Paddling ---

  protected drive(_deltaTime: number, surface: number | null, out: BoatDrive): void {
    out.seconds = GLIDE
    if (surface === null || !this.ridden) return
    if (this.input.forward) {
      out.target = PADDLE_SPEED
      out.seconds = SPEED_UP
    } else if (this.input.back) {
      out.target = BACK_SPEED
      out.seconds = BACKING
    }
  }

  protected animate(deltaTime: number, surface: number | null): void {
    const input = this.input
    const paddling = this.ridden && surface !== null && (input.forward || input.back || input.left || input.right)
    let side = 0
    let sweep = 0
    if (paddling) {
      this.stroke = (this.stroke + deltaTime * STROKES * Math.PI) % (Math.PI * 2)
      // Each half of the cycle is one stroke: the blade dips in on that side and
      // pulls from the bow back, then crosses over (out of the water) to the other
      const half = this.stroke < Math.PI ? 0 : 1
      const t = (this.stroke % Math.PI) / Math.PI
      side = (half === 0 ? 1 : -1) * 0.95 * Math.sin(Math.PI * t)
      sweep = t < 0.15 ? -0.6 * t / 0.15 : t < 0.85 ? -0.6 + (t - 0.15) / 0.7 * 1.2 : 0.6 - (t - 0.85) / 0.15 * 0.6
      if (input.back) sweep = -sweep
      // A splash and a stroke sound as each blade bites
      if (half !== this.strokeHalf && t > 0.3) {
        this.strokeHalf = half
        if (surface !== null) {
          const sideX = Math.cos(this.yaw) * (half === 0 ? 1 : -1)
          const sideZ = -Math.sin(this.yaw) * (half === 0 ? 1 : -1)
          waterSplash(this.position.x + sideX * 0.9, surface, this.position.z + sideZ * 0.9, 0.15)
        }
        this.setSoundPos()
        playSound('player.swim', this.soundPos, { volume: 0.35, pitch: 1.2 })
      }
    }
    const ease = Math.min(1, deltaTime * 14)
    this.paddleSide += (side - this.paddleSide) * ease
    this.paddleSweep += (sweep - this.paddleSweep) * ease
    this.paddling += ((paddling ? 1 : 0) - this.paddling) * Math.min(1, deltaTime * 5)
    // Rolls a touch with each stroke and into its turns
    this.roll += ((paddling ? this.paddleSide * 0.04 : 0) + this.rudder * Math.min(Math.abs(this.speed), 6) * 0.01 - this.roll) * Math.min(1, deltaTime * 3)

    if (this.hull) {
      this.hull.rotation.z = this.roll
      this.hull.rotation.x = Math.sin(this.time * 1.5 + 0.4) * 0.015
    }
    if (this.paddle) {
      // At rest it lies along the canoe toward the bow; held up, the blade leans
      // out over one side (z, applied first) and sweeps fore and aft there (x)
      const a = this.paddling
      this.paddle.position.y = (5 + 8 * a) * S
      this.paddle.rotation.x = -1.45 * (1 - a) + this.paddleSweep * a
      this.paddle.rotation.z = this.paddleSide * a
    }
  }

  protected onHit(): void {
    if (this.hull) this.hull.rotation.z += 0.15
  }

  dispose(): void {
    this.hull = null
    this.paddle = null
    super.dispose()
  }
}
