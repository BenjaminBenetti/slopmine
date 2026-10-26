import * as THREE from 'three'
import { optimizeEntityMesh } from '../../entities/EntityMeshOptimizer.ts'
import { windUniform } from '../../renderer/WindUniform.ts'
import { playSound } from '../../audio/SoundHooks.ts'
import { BoatEntity, type BoatConfig, type BoatDrive, type BoatHandling } from './BoatEntity.ts'

const S = 0.0625 // 1 "pixel" = 1/16 block

// Colours: weathered oak planks, a tarred keel, sailcloth
const PLANK = 0xb48c56
const PLANK_DARK = 0x8c683a
const TRIM = 0x6e5030
const KEEL = 0x4f3a24
const MAST = 0x9a7446
const CLOTH = 0xefe6d2
const PENNANT = 0xc8423a
const ROPE = 0xc9b48a

/** Paddling (no useful wind, or W into it) and backing (S). */
const PADDLE_SPEED = 2.4
const BACK_SPEED = -1.6
/**
 * Speed on a beam reach: SAIL_BASE plus SAIL_PER_WIND per unit of wind up to
 * SAIL_WIND_CAP - a breeze (~0.15) makes ~19 b/s, a fresh wind (0.3) ~24, a
 * gale 30. (The first sailboat made ~4.6 in a breeze: Ben wanted it 5x as fast
 * - the seas are big, and hemp and rope are work to come by.)
 */
const SAIL_BASE = 14
const SAIL_PER_WIND = 32
const SAIL_WIND_CAP = 0.5
/** Seconds (time constants) to pick up way as the sail fills, to spill it bearing away, to glide to rest, to back water. */
const PICK_UP = 4.5
const SPILL = 2.2
const GLIDE = 5
const BACKING = 1.2
/** A hard turn bleeds this share of the sail's speed. */
const TURN_BLEED = 0.3
/** Head-to-wind dead zone (radians from the wind's eye): the sail only flaps. */
const IN_IRONS = 0.6

const HANDLING: BoatHandling = {
  draft: 0.28,
  bob: 0.05,
  // (at most 1.4 rad/s: carving a ~14-block turn at 20 b/s)
  turnBase: 0.55,
  turnPerSpeed: 0.11,
  turnMax: 1.4,
  hullPoints: [[1.45, 0], [-1.2, 0], [0, 0.65], [0, -0.65], [0.9, 0.45], [0.9, -0.45]],
  sternOffset: 1.3,
  hitsToBreak: 4,
  seatForward: -0.55,
  seatUp: 0.32,
}

/**
 * A small wooden sailing dinghy - not a rowing tub: it sails on the game's
 * wind (the weather's windUniform). Its speed follows the points of sail:
 * nothing head to wind (the sail only flaps), best with the wind across it
 * (a beam reach), a little less running before it - so the player tacks
 * upwind and flies downwind in a gale. It picks up way slowly as the sail
 * fills, and a hard turn spills some of it. The sail swings out to the
 * downwind side and fills with the wind, the pennant at the masthead streams
 * with it, and the hull heels and bobs. With no useful wind, W paddles.
 *
 * Controls (setupBoats feeds them while ridden): W sail (or paddle), S back
 * water, A/D steer. Four hits break it back into a sailboat item.
 */
export class SailboatEntity extends BoatEntity {
  readonly type = 'sailboat'
  protected readonly handling = HANDLING

  private sinceCreak = 0

  // The wind on the boat (drive), for the sail (animate)
  private offWind = Math.PI / 2
  private pull = 0
  private leeward = 1
  private strength = 0

  // Sail state (eased)
  private fill = 0
  private boomAngle = 0
  private heel = 0

  // Model parts
  private hull: THREE.Group | null = null
  private boom: THREE.Group | null = null
  private sailMesh: THREE.Mesh | null = null
  private pennant: THREE.Group | null = null
  private tiller: THREE.Group | null = null
  private sailBase: Float32Array | null = null
  private sailShape = { fill: -1, flap: -1 }

  constructor(config: BoatConfig) {
    super('sailboat', config, new THREE.Vector3(1.6, 0.9, 1.6))
  }

  // --- Model ---

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const lit = (color: number): THREE.MeshLambertMaterial => {
      const material = new THREE.MeshLambertMaterial({ color })
      this.registerMaterialForLighting(material)
      return material
    }
    const plank = lit(PLANK)
    const plankDark = lit(PLANK_DARK)
    const trim = lit(TRIM)
    const keel = lit(KEEL)
    const mast = lit(MAST)
    const rope = lit(ROPE)
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
    // Bottom, keel, sides (+Z is the bow)
    box(16, 2, 32, plankDark, 0, 1, -2, hull)
    box(10, 2, 10, plankDark, 0, 1, 17, hull)
    box(3, 2, 44, keel, 0, -0.5, 0, hull)
    for (const side of [-1, 1]) {
      box(2, 8, 30, plank, side * 9, 5, -3, hull)
      box(2.2, 1.2, 30, trim, side * 9, 9.4, -3, hull) // gunwale
      // The bow: planks sweeping in to the stem
      box(2, 8, 13, plank, side * 5.6, 5, 16.5, hull, side * -0.5)
      box(2.2, 1.2, 13, trim, side * 5.6, 9.4, 16.5, hull, side * -0.5)
    }
    box(3, 10, 3, keel, 0, 5, 23, hull) // stem
    box(20, 8, 2, plank, 0, 5, -18.5, hull) // transom
    box(20.4, 1.2, 2.4, trim, 0, 9.4, -18.5, hull)
    // Thwarts (seats) and the mast step
    box(16, 1.4, 4, plankDark, 0, 6.5, -5, hull)
    box(12, 1.4, 3.5, plankDark, 0, 6.5, 8, hull)
    // Mast with shrouds
    box(1.8, 58, 1.8, mast, 0, 34, 9, hull)
    for (const side of [-1, 1]) {
      const shroud = box(0.4, 50, 0.4, rope, side * 5, 32, 9, hull)
      shroud.rotation.z = side * 0.17
    }
    // Tiller at the transom
    const tiller = new THREE.Group()
    tiller.position.set(0, 8 * S, -19 * S)
    box(1.2, 1.2, 9, mast, 0, 0, 4, tiller)
    box(1, 10, 4, keel, 0, -6, -1, tiller) // rudder blade
    hull.add(tiller)
    this.tiller = tiller

    // Boom: pivots on the mast just above the thwart; the sail rides it
    const boom = new THREE.Group()
    boom.position.set(0, 14 * S, 9 * S)
    box(1.4, 1.4, 30, mast, 0, 0, -15, boom)
    hull.add(boom)
    this.boom = boom
    const sailMaterial = new THREE.MeshLambertMaterial({ color: CLOTH, side: THREE.DoubleSide })
    this.registerMaterialForLighting(sailMaterial)
    const sail = new THREE.Mesh(this.buildSailGeometry(), sailMaterial)
    sail.frustumCulled = false
    boom.add(sail)
    this.sailMesh = sail

    // Pennant at the masthead: streams downwind
    const pennant = new THREE.Group()
    pennant.position.set(0, 63 * S, 9 * S)
    const flagMaterial = new THREE.MeshLambertMaterial({ color: PENNANT, side: THREE.DoubleSide })
    this.registerMaterialForLighting(flagMaterial)
    const flag = new THREE.Mesh(new THREE.BufferGeometry(), flagMaterial)
    flag.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.5 * S, 0, 0, -1.5 * S, 0, 0, 0, -9 * S], 3))
    flag.geometry.computeVertexNormals()
    pennant.add(flag)
    hull.add(pennant)
    this.pennant = pennant

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [hull, boom, tiller, pennant, sail],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    // Keep the water out of the hull: inside the walls, 3 pixels above the waterline (4.5)
    this.addWaterMask(hull, [[-7.7, -17.2], [7.7, -17.2], [7.7, 10.4], [1.8, 21], [-1.8, 21], [-7.7, 10.4]], 7.5, S)
    return root
  }

  /**
   * The mainsail, a triangle in the boom's frame: luff up the mast, foot
   * along the boom to the clew, leech from the clew to the head. A grid of
   * vertices so it can belly out with the wind.
   */
  private buildSailGeometry(): THREE.BufferGeometry {
    const n = 6
    const height = 46 * S
    const foot = 28 * S
    const positions: number[] = []
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const s = i / n // up the luff
        const t = n - i > 0 ? j / (n - i) : 0 // across toward the leech
        positions.push(0, 0.6 * S + s * height, -t * (1 - s) * foot)
      }
    }
    const index: number[] = []
    let row = 0
    for (let i = 0; i < n; i++) {
      const count = n - i + 1
      const next = row + count
      for (let j = 0; j < count - 1; j++) {
        index.push(row + j, next + j, row + j + 1)
        if (j < count - 2) index.push(row + j + 1, next + j, next + j + 1)
      }
      row = next
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    this.sailBase = new Float32Array(positions)
    return geometry
  }

  /** Belly the sail out to one side (`fill` signed, -1..1), rippling when it flaps. */
  private shapeSail(fill: number, flap: number): void {
    const mesh = this.sailMesh
    const base = this.sailBase
    if (!mesh || !base) return
    if (Math.abs(fill - this.sailShape.fill) < 0.01 && flap === 0 && this.sailShape.flap === 0) return
    this.sailShape.fill = fill
    this.sailShape.flap = flap
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const array = position.array as Float32Array
    const height = 46 * S
    const foot = 28 * S
    for (let v = 0; v < base.length; v += 3) {
      const y = base[v + 1]
      const z = base[v + 2]
      const s = Math.min(1, Math.max(0, (y - 0.6 * S) / height))
      const width = (1 - s) * foot
      const t = width > 1e-4 ? -z / width : 0
      const belly = Math.sin(Math.PI * t) * (1 - 0.55 * s) * 5 * S
      const ripple = flap * Math.sin(this.time * 18 + s * 9 + t * 5) * 1.6 * S * t
      array[v] = fill * belly + ripple
    }
    position.needsUpdate = true
    mesh.geometry.computeVertexNormals()
  }

  // --- Sailing ---

  protected drive(_deltaTime: number, surface: number | null, out: BoatDrive): void {
    // The wind: blowing toward (wx, wz), strength 0-1
    const wind = windUniform.value
    const windLen = Math.hypot(wind.x, wind.y) || 1
    const wx = wind.x / windLen
    const wz = wind.y / windLen
    const strength = Math.max(0, Math.min(1, wind.z))
    const hx = Math.sin(this.yaw)
    const hz = Math.cos(this.yaw)
    // Angle off the wind: 0 = heading straight into it, pi = running before it
    this.offWind = Math.acos(Math.max(-1, Math.min(1, -(hx * wx + hz * wz))))
    this.pull = this.pointsOfSail(this.offWind)
    this.strength = strength
    // The sail goes to the downwind (leeward) side
    this.leeward = hx * wz - hz * wx > 0 ? -1 : 1

    out.seconds = GLIDE
    if (surface === null || !this.ridden) return
    if (this.input.forward) {
      const sail = this.pull * (SAIL_BASE + SAIL_PER_WIND * Math.min(strength, SAIL_WIND_CAP)) * (1 - TURN_BLEED * Math.abs(this.rudder))
      if (sail > PADDLE_SPEED) {
        out.target = sail
        out.seconds = sail > this.speed ? PICK_UP : SPILL
        // Leeway: the wind pushes the hull sideways a little
        out.driftX = wx * strength * 0.5 * this.pull
        out.driftZ = wz * strength * 0.5 * this.pull
      } else {
        out.target = PADDLE_SPEED
        out.seconds = 1.5
      }
    } else if (this.input.back) {
      out.target = BACK_SPEED
      out.seconds = BACKING
    }
  }

  /** Drive (0-1) at an angle off the wind: none in irons, most on a beam reach, a little less running. */
  private pointsOfSail(offWind: number): number {
    if (offWind < IN_IRONS) return 0
    if (offWind < Math.PI / 2) {
      const t = (offWind - IN_IRONS) / (Math.PI / 2 - IN_IRONS)
      return 0.35 + 0.65 * t * t * (3 - 2 * t)
    }
    return 1 - 0.28 * ((offWind - Math.PI / 2) / (Math.PI / 2))
  }

  protected animate(deltaTime: number, surface: number | null): void {
    this.sinceCreak += deltaTime
    const { offWind, pull, leeward, strength } = this
    // The sail: filling to leeward when sheeted in, flapping head to wind
    const sheeted = this.ridden && this.input.forward && surface !== null
    const flap = offWind < IN_IRONS ? 1 : sheeted ? 0 : 0.25
    const fillTarget = sheeted ? leeward * pull * (0.45 + 0.55 * strength) : leeward * 0.18
    this.fill += (fillTarget - this.fill) * Math.min(1, deltaTime * 3)
    // The boom: close in sailing to windward, out wide running
    const out = 0.18 + 1.12 * Math.max(0, Math.min(1, (offWind - IN_IRONS) / (Math.PI - IN_IRONS)))
    const boomTarget = offWind < IN_IRONS ? Math.sin(this.time * 2.6) * 0.18 : leeward * out
    this.boomAngle += (boomTarget - this.boomAngle) * Math.min(1, deltaTime * 2.5)
    const speed = Math.abs(this.speed)
    this.heel += ((sheeted ? -leeward * pull * strength * 0.22 : 0) + this.rudder * Math.min(speed, 10) * 0.012 - this.heel) * Math.min(1, deltaTime * 2)

    if (this.ridden && sheeted && speed > 3 && this.sinceCreak > 4 + Math.random() * 6) {
      this.sinceCreak = 0
      this.setSoundPos()
      playSound('block.wood.step', this.soundPos, { volume: 0.25, pitch: 0.6 })
    }

    if (this.hull) {
      this.hull.rotation.z = this.heel
      // (the bow lifts with speed, as she gets up and planes)
      this.hull.rotation.x = Math.sin(this.time * 1.3 + 0.7) * 0.02 - Math.min(this.speed, 20) * 0.004
    }
    if (this.boom) this.boom.rotation.y = this.boomAngle
    if (this.tiller) this.tiller.rotation.y = -this.rudder * 0.5
    this.shapeSail(this.fill, flap)
    if (this.pennant) {
      // Streams downwind (world), flickering
      const wind = windUniform.value
      const downwind = Math.atan2(wind.x, wind.y)
      this.pennant.rotation.y = downwind - this.yaw + Math.PI + Math.sin(this.time * 9) * 0.15
    }
  }

  protected onHit(): void {
    if (this.hull) this.hull.rotation.z += 0.12
  }

  dispose(): void {
    this.hull = null
    this.boom = null
    this.sailMesh = null
    this.pennant = null
    this.tiller = null
    super.dispose()
  }
}
