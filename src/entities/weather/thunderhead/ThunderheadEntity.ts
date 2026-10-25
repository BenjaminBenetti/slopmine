import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import type { IItem } from '../../../items/Item.ts'
import { createItemFromId } from '../../../persistence/ItemRegistry.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { fadeMaterials } from '../../night/NightCreature.ts'
import { WeatherRetreat } from '../WeatherCreature.ts'
import { playSound } from '../../../audio/SoundHooks.ts'
import type { SoundId } from '../../../audio/SoundLibrary.ts'

// Colours: storm-grey puffs, lighter where the tops catch the light, near-black bellies
const CLOUD_TOP = 0x7a8193
const CLOUD = 0x555b69
const CLOUD_DARK = 0x3a3f4b
const CLOUD_BELLY = 0x262a33
const RAIN = 0xa8c4ea
const SOCKET = 0x101218
const EYE = 0xeef7ff
const IRIS = 0x8fd0ff
const PUPIL = 0x14203a
const VEIN_DIM = 0x3d4b6c
const VEIN_BRIGHT = 0xe0f0ff
/** Inner glow of the cloud (emissive): a faint steady base, and the colour of its flashes. */
const GLOW_BASE = 0x131a2c
const GLOW_FLASH = 0x3a5290
const BOLT_CORE = 0xf4f8ff
const BOLT_GLOW = 0x6fa8ff
const RING = 0x9fd4ff

const S = 0.0625 // 1 "pixel" = 1/16 block

// Tuning
const MAX_HEALTH = 30
const STRIKE_DAMAGE = 6
/** Notices the player within this many blocks (horizontally), loses them beyond LOSE_RANGE. */
const ENGAGE_RANGE = 28
const LOSE_RANGE = 40
/** Hover band above the ground, and its horizontal distance from the player. */
const HOVER_HEIGHT_MIN = 5
const HOVER_HEIGHT_MAX = 7
const HOVER_RADIUS_MIN = 6
const HOVER_RADIUS_MAX = 9
const CRUISE_SPEED = 4.5
const DRIFT_SPEED = 1.5
/** Seconds between strikes (each one randomised by ±STRIKE_JITTER). */
const STRIKE_INTERVAL = 5
const STRIKE_JITTER = 1.2
/** Only strikes a player within this many blocks (horizontally). */
const STRIKE_RANGE = 16
/** Telegraph: the crackling ring on the ground before the bolt. */
const CHARGE_TIME = 1.2
const STRIKE_TIME = 0.22
const RING_RADIUS = 1.6
/** The player is hit inside the ring (plus a little slack) and within this height of its ground. */
const HIT_SLACK = 0.3
const HIT_HEIGHT = 2.5
/** Drained after a strike: sinks to DRAIN_HEIGHT above the ground for DRAIN_TIME - the window to hit it. */
const DRAIN_TIME = 2.5
const SINK_SPEED = 6
const DRAIN_HEIGHT = 2.5
/** While drained it sags up to this many blocks toward the player, stopping this far off (horizontally). */
const DRAIN_APPROACH = 2
const DRAIN_APPROACH_STOP = 3
/** Open sky check above the player's head (blocks): any block in this run is a roof. */
const SHELTER_SCAN = 96
/** Collision box half width and height (position = the cloud's underside). */
const HALF = 0.7
const COLLIDE_HEIGHT = 1.1
/** Cloud centre above its position. */
const BODY_Y = 0.55
const EXIT_SECONDS = 2.4
const DEATH_SECONDS = 1.1
const TUMBLE_TIME = 0.35
/** Ground is searched this far below. */
const GROUND_SCAN = 24
const BOLT_SEGMENTS = 9
const BRANCH_SEGMENTS = 4
/** Raindrops under the cloud: how many, cycles per second, and how far they fall (pixels). */
const DROP_COUNT = 10
const DROP_RATE = 1.6
const DROP_FALL = 22

const WEATHERS: ReadonlySet<string> = new Set(['thunderstorm', 'monsoon', 'cloudburst', 'volcanic_lightning', 'hailstorm'])

type CloudState = 'drift' | 'hover' | 'charge' | 'strike' | 'drained' | 'tumble'

/** One lobe of the cloud: churns on its own. */
interface Lobe {
  readonly group: THREE.Group
  readonly base: THREE.Vector3
  readonly phase: number
  readonly speed: number
}

/**
 * Thunderhead - a living storm cloud that rides in with thunderstorms (and
 * monsoons, cloudbursts, hail and the volcanic ash storms). A churning knot of
 * dark voxel puffs about a block and a half across, lightning veins crawling
 * over it and one glowing eye.
 *
 * It hangs 5-7 blocks over the ground a few blocks from the player, out of
 * reach. Every ~5 s it calls a strike: a crackling ring of light on the
 * ground where the player stands (1.2 s), then a bolt into it - 6 'magic'
 * damage to a player still inside, unless they got under a roof (then the
 * bolt only hits the roof). Spent, it sinks to 2.5 blocks above the ground
 * for 2.5 s, its glow dimmed: the window to hit it. Its own glow keeps it
 * visible in the storm dark. When the storm passes it thins away.
 *
 * Stats: 30 HP, light knockback. Drops: 1-2 storm essence.
 */
export class ThunderheadEntity extends AggressiveEntity {
  readonly type = 'thunderhead'

  private cloudState: CloudState = 'drift'
  private stateTime = 0
  private time = Math.random() * 10
  private strikeTimer = STRIKE_INTERVAL + Math.random() * STRIKE_JITTER
  private orbitAngle = Math.random() * Math.PI * 2
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  private orbitRadius = HOVER_RADIUS_MIN + Math.random() * (HOVER_RADIUS_MAX - HOVER_RADIUS_MIN)
  private hoverHeight = HOVER_HEIGHT_MIN + Math.random() * (HOVER_HEIGHT_MAX - HOVER_HEIGHT_MIN)
  private readonly phaseA = Math.random() * Math.PI * 2
  private readonly phaseB = Math.random() * Math.PI * 2
  private engaged = false
  /** Seconds spent down low while drained. */
  private lowTime = 0
  /** Vein flicker: each vein's brightness 0-1 and time to its next flicker. */
  private readonly veinLevel: number[] = []
  private readonly veinTimer: number[] = []
  /** 0 dim (drained) .. 1 full glow, eased. */
  private glow = 1
  /** Inner flash 0-1 (decays): the cloud lit from within when veins fire. */
  private flash = 0

  private readonly retreat = new WeatherRetreat(WEATHERS, EXIT_SECONDS)

  private readonly flightVel = new THREE.Vector3()
  private readonly home = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  /** The ground point the strike is aimed at (world). */
  private readonly strikeAt = new THREE.Vector3()
  /** Bolt path (world), BOLT_SEGMENTS + 1 points, and a branch. */
  private readonly boltPoints: THREE.Vector3[] = Array.from({ length: BOLT_SEGMENTS + 1 }, () => new THREE.Vector3())
  private readonly branchPoints: THREE.Vector3[] = Array.from({ length: BRANCH_SEGMENTS + 1 }, () => new THREE.Vector3())
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly step = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly soundPos = { x: 0, y: 0, z: 0 }
  private readonly veinDim = new THREE.Color(VEIN_DIM)
  private readonly veinBright = new THREE.Color(VEIN_BRIGHT)
  private readonly eyeColor = new THREE.Color(EYE)
  private readonly glowBase = new THREE.Color(GLOW_BASE)
  private readonly glowFlash = new THREE.Color(GLOW_FLASH)

  private player: THREE.Vector3 | null = null
  private damageCb: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private blockAt: ((x: number, y: number, z: number) => number) | null = null
  private solidAt: ((x: number, y: number, z: number) => boolean) | null = null

  // Model parts
  private body: THREE.Group | null = null
  private lobes: Lobe[] = []
  /** Raindrops falling from its belly (cycled), with their spots in the cycle. */
  private raindrops: THREE.Mesh[] = []
  private readonly dropPhase: number[] = []
  private eye: THREE.Group | null = null
  private veinMaterials: THREE.MeshBasicMaterial[] = []
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private haloMaterial: THREE.MeshBasicMaterial | null = null
  /** The cloud's own materials, whose emissive carries the inner glow and flashes. */
  private cloudMaterials: THREE.MeshLambertMaterial[] = []
  private ring: THREE.Group | null = null
  private ringOuter: THREE.Mesh | null = null
  private ringInner: THREE.Mesh | null = null
  private ringSparks: THREE.Mesh[] = []
  private ringMaterial: THREE.MeshBasicMaterial | null = null
  private ringInnerMaterial: THREE.MeshBasicMaterial | null = null
  private bolt: THREE.Group | null = null
  private boltCore: THREE.Mesh[] = []
  private boltGlow: THREE.Mesh[] = []
  private boltCoreMaterial: THREE.MeshBasicMaterial | null = null
  private boltGlowMaterial: THREE.MeshBasicMaterial | null = null
  /** Every material of the cloud itself (not the ring or bolt), for the exit and death fades. */
  private fadeList: THREE.Material[] = []
  private readonly baseOpacity = new Map<THREE.Material, number>()

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('thunderhead', {
      ...config,
      hasPhysics: true, // hitbox for player attacks; flight is manual
      hitboxSize: new THREE.Vector3(1.6, COLLIDE_HEIGHT, 1.6),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: STRIKE_DAMAGE,
      detectionRange: ENGAGE_RANGE,
      knockbackHorizontal: 6,
      knockbackVertical: 2,
      knockbackStunTime: 0.25,
      drops: [{ createItem: () => createItemFromId('storm_essence') as IItem, minCount: 1, maxCount: 2 }],
    })
    this.home.copy(config.position)
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
  }

  // ---- wiring (EntityManager duck-typed setters) ----

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.player = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void): void {
    super.setPlayerDamageCallback(callback)
    this.damageCb = callback
  }

  setWorldQueryFns(blockQuery: (x: number, y: number, z: number) => number, solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.blockAt = blockQuery
    this.solidAt = solidQuery
  }

  onSpawn(): void {
    // Spawned on the ground: rise to its hover height (as far as it is clear)
    for (let climbed = 0; climbed < this.hoverHeight; climbed += 0.5) {
      if (!this.clear(this.position.x, this.position.y + 0.5, this.position.z)) break
      this.position.y += 0.5
    }
    this.home.copy(this.position)
    this.syncTransform()
  }

  /** Drops resolve through the item registry: none if storm essence isn't registered. */
  getDrops(): IItem[] {
    return super.getDrops().filter((item): item is IItem => item != null)
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    // Cloud materials glow faintly from within (emissive, animated with the
    // veins), so the cloud never vanishes into the storm dark
    // (a non-black emissive also keeps the optimizer from merging them away)
    const top = new THREE.MeshLambertMaterial({ color: CLOUD_TOP, emissive: GLOW_BASE })
    const mid = new THREE.MeshLambertMaterial({ color: CLOUD, emissive: GLOW_BASE })
    const dark = new THREE.MeshLambertMaterial({ color: CLOUD_DARK, emissive: GLOW_BASE })
    const belly = new THREE.MeshLambertMaterial({ color: CLOUD_BELLY, emissive: GLOW_BASE })
    const socket = new THREE.MeshLambertMaterial({ color: SOCKET })
    this.cloudMaterials = [top, mid, dark, belly]
    for (const m of [top, mid, dark, belly, socket]) this.registerMaterialForLighting(m)
    // Self-lit: the eye and the veins
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE })
    const iris = new THREE.MeshBasicMaterial({ color: IRIS })
    const pupil = new THREE.MeshBasicMaterial({ color: PUPIL })
    this.haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x6fa0ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending,
    })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }

    const body = new THREE.Group()
    body.position.y = BODY_Y
    root.add(body)
    this.body = body

    // Lobes: rounded voxel puffs (a box with its edges stepped in), lit tops,
    // dark bellies; each lobe's boxes merge per material (one draw each)
    this.lobes = []
    const lobe = (x: number, y: number, z: number, puffs: Array<[number, number, number, number, number, number]>): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(x * S, y * S, z * S)
      body.add(g)
      const parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
      const add = (m: THREE.Material, w: number, h: number, d: number, px: number, py: number, pz: number): void => {
        const geo = new THREE.BoxGeometry(w * S, h * S, d * S)
        geo.translate(px * S, py * S, pz * S)
        const list = parts.get(m) ?? []
        list.push(geo)
        parts.set(m, list)
      }
      for (const [px, py, pz, w, h, d] of puffs) {
        add(mid, w - 2, h, d - 2, px, py, pz)
        add(mid, w, h - 2, d - 2, px, py, pz)
        add(mid, w - 2, h - 2, d, px, py, pz)
        add(top, w - 3, 1.4, d - 3, px, py + h / 2 + 0.5, pz)
        add(dark, w - 0.6, 1.2, d - 0.6, px, py - h / 2 + 1.4, pz)
        add(belly, w - 3, 1, d - 3, px, py - h / 2 - 0.3, pz)
      }
      for (const [m, geos] of parts) {
        g.add(new THREE.Mesh(mergeGeometries(geos), m))
        for (const geo of geos) geo.dispose()
      }
      this.lobes.push({ group: g, base: g.position.clone(), phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.6 })
      return g
    }
    // [x, y, z, w, h, d] per puff, in pixels within the lobe
    const core = lobe(0, 0, 0, [[0, 0, 0, 18, 11, 15], [0, 4, -3, 12, 8, 9]])
    const left = lobe(-10, -0.5, 0.5, [[0, 0, 0, 10, 9, 11], [-3, -1.5, -3, 6, 6, 6]])
    const right = lobe(10, -1, 1, [[0, 0, 0, 11, 8, 10], [3, 0, 3, 6, 6, 6]])
    const topFront = lobe(-3, 7, 2.5, [[0, 0, 0, 11, 8, 9], [4, 2.5, -1, 6, 5, 6]])
    const topBack = lobe(4.5, 6, -3.5, [[0, 0, 0, 10, 8, 9], [-2, 3.5, 1, 7, 5, 6]])
    lobe(-8, 4, -3, [[0, 0, 0, 8, 7, 8]]) // top left bump
    lobe(9, 4.5, -1.5, [[0, 0, 0, 7, 6, 7]]) // top right bump
    lobe(3.5, -3.5, 6, [[0, 0, 0, 8, 5, 5]]) // low front
    lobe(-4.5, -3.5, -6, [[0, 0, 0, 9, 5, 6]]) // low back

    // Veins of lightning crawling over the surface: zigzags of thin glowing
    // bars, one material (and one merged mesh) per vein so they flicker apart
    this.veinMaterials = []
    this.veinLevel.length = 0
    this.veinTimer.length = 0
    const vein = (points: Array<[number, number, number]>, parent: THREE.Object3D): void => {
      const material = new THREE.MeshBasicMaterial({ color: VEIN_DIM })
      this.veinMaterials.push(material)
      this.veinLevel.push(Math.random())
      this.veinTimer.push(Math.random() * 0.6)
      const geos: THREE.BufferGeometry[] = []
      const q = new THREE.Quaternion()
      const m = new THREE.Matrix4()
      for (let i = 0; i < points.length - 1; i++) {
        const a = new THREE.Vector3(...points[i]).multiplyScalar(S)
        const b = new THREE.Vector3(...points[i + 1]).multiplyScalar(S)
        const geo = new THREE.BoxGeometry(0.7 * S, a.distanceTo(b) + 0.7 * S, 0.7 * S)
        q.setFromUnitVectors(this.up, b.clone().sub(a).normalize())
        geo.applyMatrix4(m.compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)))
        geos.push(geo)
      }
      parent.add(new THREE.Mesh(mergeGeometries(geos), material))
      for (const geo of geos) geo.dispose()
    }
    // Front of the core, either side of the eye
    vein([[-8.6, 3.5, 7.9], [-6.5, 1, 7.9], [-7.5, -1.5, 7.9], [-5, -4.5, 7.9]], core)
    vein([[8.6, 4, 7.9], [6.5, 2.5, 7.9], [7.2, -0.5, 7.9], [4.5, -3, 7.9], [5.5, -5, 7.9]], core)
    // Left and right flanks
    vein([[-5.4, 3.5, -3], [-5.4, 1, 0], [-5.4, 2, 2.5], [-5.4, -2.5, 4.5]], left)
    vein([[5.9, 3, 3.5], [5.9, 0.5, 1], [5.9, 1.5, -2], [5.9, -3, -3.5]], right)
    // Across the top
    vein([[-4.5, 4.3, -3], [-1.5, 4.3, -1], [0, 4.3, 2], [3.5, 4.3, 3.5]], topFront)
    vein([[4, 4.3, -4], [1, 4.3, -1.5], [-2, 4.3, -2.5], [-4, 4.3, 0.5]], topBack)
    // Underside
    vein([[-7, -6, -4], [-3, -6, -1], [-4, -6, 2.5], [0, -6, 5]], core)

    // The eye: an almond of light with a pale iris and a slit pupil, in a dark
    // socket under a scowling brow of cloud, and a soft halo
    const eye = new THREE.Group()
    eye.position.set(0, 0.5 * S, 7.6 * S)
    body.add(eye)
    box(9, 4.6, 1, socket, 0, -0.2, 0, eye)
    box(4, 0.9, 0.8, this.eyeMaterial, 0, 1.3, 0.5, eye)
    box(7, 1.8, 0.8, this.eyeMaterial, 0, 0, 0.5, eye)
    box(4, 0.9, 0.8, this.eyeMaterial, 0, -1.3, 0.5, eye)
    box(2.8, 2.6, 0.7, iris, 0, 0, 0.9, eye)
    box(0.8, 2.6, 0.6, pupil, 0, 0, 1.1, eye)
    for (const side of [-1, 1]) {
      const brow = box(6, 2, 2.4, dark, side * 3, 3.1, 0.6, eye)
      brow.rotation.z = side * -0.32
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(13 * S, 8 * S), this.haloMaterial)
    halo.position.z = 1.4 * S
    eye.add(halo)
    this.eye = eye

    // Rain falling from its belly
    const rain = new THREE.MeshBasicMaterial({ color: RAIN, transparent: true, opacity: 0.55, depthWrite: false })
    const dropGeo = new THREE.BoxGeometry(0.45 * S, 3 * S, 0.45 * S)
    this.raindrops = []
    this.dropPhase.length = 0
    for (let i = 0; i < DROP_COUNT; i++) {
      const drop = new THREE.Mesh(dropGeo, rain)
      body.add(drop)
      this.raindrops.push(drop)
      this.dropPhase.push(i / DROP_COUNT)
    }

    // Cheek puffs either side of the eye, so the core's face isn't one flat slab
    lobe(-6, -2.5, 6.5, [[0, 0, 0, 6, 5, 4]])
    lobe(6.5, -2, 6.5, [[0, 0, 0, 6, 5, 4]])

    // Strike telegraph: a crackling ring on the ground (world-placed each frame)
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: RING, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
    this.ringInnerMaterial = this.ringMaterial.clone()
    const ring = new THREE.Group()
    ring.visible = false
    this.ringOuter = new THREE.Mesh(new THREE.RingGeometry(RING_RADIUS - 0.16, RING_RADIUS, 48), this.ringMaterial)
    this.ringOuter.rotation.x = -Math.PI / 2
    ring.add(this.ringOuter)
    this.ringInner = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), this.ringInnerMaterial)
    this.ringInner.rotation.x = -Math.PI / 2
    ring.add(this.ringInner)
    this.ringSparks = []
    for (let i = 0; i < 8; i++) {
      const spark = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.5), this.ringMaterial)
      spark.rotation.x = -Math.PI / 2
      ring.add(spark)
      this.ringSparks.push(spark)
    }
    root.add(ring)
    this.ring = ring

    // The bolt: segments of a unit box laid along the path each strike, a
    // white core inside a wide blue glow
    this.boltCoreMaterial = new THREE.MeshBasicMaterial({
      color: BOLT_CORE, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    this.boltGlowMaterial = new THREE.MeshBasicMaterial({
      color: BOLT_GLOW, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const unit = new THREE.BoxGeometry(1, 1, 1)
    const bolt = new THREE.Group()
    bolt.visible = false
    this.boltCore = []
    this.boltGlow = []
    for (let i = 0; i < BOLT_SEGMENTS + BRANCH_SEGMENTS; i++) {
      const core = new THREE.Mesh(unit, this.boltCoreMaterial)
      const glow = new THREE.Mesh(unit, this.boltGlowMaterial)
      core.frustumCulled = false
      glow.frustumCulled = false
      bolt.add(core, glow)
      this.boltCore.push(core)
      this.boltGlow.push(glow)
    }
    root.add(bolt)
    this.bolt = bolt

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, eye, ring, bolt, ...this.lobes.map((l) => l.group), ...this.raindrops, ...this.ringSparks,
        this.ringOuter, this.ringInner, ...this.boltCore, ...this.boltGlow],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // The finished cloud's materials (merging replaced most), for the fades
    const seen = new Set<THREE.Material>()
    body.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const list = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of list) {
        if (seen.has(m)) continue
        seen.add(m)
        this.fadeList.push(m)
        this.baseOpacity.set(m, m.transparent ? m.opacity : 1)
      }
    })
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    const physics = this.getPhysicsBody()
    if (physics) physics.skipPhysics = true
    this.time += deltaTime
    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    const exit = this.retreat.update(deltaTime, this.position.x, this.position.y, this.position.z)
    if (exit > 0) {
      this.updateExit(deltaTime, exit)
      return
    }

    this.stateTime += deltaTime
    const player = this.player
    const horizontal = player ? Math.hypot(player.x - this.position.x, player.z - this.position.z) : Infinity
    if (!this.engaged && horizontal <= ENGAGE_RANGE) {
      this.engaged = true
      if (this.cloudState === 'drift') this.enter('hover')
    } else if (this.engaged && horizontal > LOSE_RANGE) {
      this.engaged = false
      this.home.copy(this.position)
      if (this.cloudState === 'hover') this.enter('drift')
    }

    let speed = CRUISE_SPEED
    let glowTarget = 1
    switch (this.cloudState) {
      case 'drift': {
        // Lazy circles over its patch of sky
        const gx = this.home.x + Math.sin(this.time * 0.21 + this.phaseA) * 5
        const gz = this.home.z + Math.sin(this.time * 0.17 + this.phaseB) * 5
        this.target.set(gx, this.groundBelow(gx, this.position.y + 2, gz) + this.hoverHeight, gz)
        speed = DRIFT_SPEED
        break
      }
      case 'hover': {
        // Circle the player at a distance, high over the ground
        if (Math.random() < deltaTime * 0.08) this.orbitDir = -this.orbitDir
        this.orbitAngle += this.orbitDir * deltaTime * 0.35
        const r = this.orbitRadius + Math.sin(this.time * 0.4 + this.phaseA)
        const gx = player!.x + Math.cos(this.orbitAngle) * r
        const gz = player!.z + Math.sin(this.orbitAngle) * r
        const ground = Math.max(this.groundBelow(gx, player!.y + 8, gz), player!.y)
        this.target.set(gx, ground + this.hoverHeight + 0.4 * Math.sin(this.time * 0.9 + this.phaseB), gz)
        this.strikeTimer -= deltaTime
        if (this.strikeTimer <= 0 && horizontal <= STRIKE_RANGE) this.beginCharge()
        break
      }
      case 'charge': {
        // Hold still and gather: the ring crackles on the ground below the player
        this.target.copy(this.position)
        speed = 0
        if (this.stateTime >= CHARGE_TIME) this.fireStrike()
        break
      }
      case 'strike': {
        this.target.copy(this.position)
        speed = 0
        if (this.stateTime >= STRIKE_TIME) {
          if (this.bolt) this.bolt.visible = false
          this.enter('drained')
        }
        break
      }
      case 'drained': {
        // Spent: sink low over the ground, sagging a little toward the player,
        // glow dimmed - the window to hit it, counted once it is down
        glowTarget = 0.15
        let gx = this.position.x
        let gz = this.position.z
        if (player && horizontal > DRAIN_APPROACH_STOP) {
          const k = Math.min(DRAIN_APPROACH, horizontal - DRAIN_APPROACH_STOP) / horizontal
          gx += (player.x - gx) * k
          gz += (player.z - gz) * k
        }
        const ground = this.groundBelow(this.position.x, this.position.y + 1, this.position.z)
        this.target.set(gx, ground + DRAIN_HEIGHT, gz)
        speed = SINK_SPEED
        if (this.position.y - (ground + DRAIN_HEIGHT) < 0.6) this.lowTime += deltaTime
        if (this.lowTime >= DRAIN_TIME || this.stateTime >= DRAIN_TIME + 2.5) this.enter(this.engaged ? 'hover' : 'drift')
        break
      }
      case 'tumble': {
        // Knocked: drift with the blow, then back to what it was doing
        glowTarget = 0.4
        this.flightVel.multiplyScalar(Math.max(0, 1 - deltaTime * 3))
        if (this.stateTime >= TUMBLE_TIME) this.enter('drained')
        break
      }
    }

    if (this.cloudState !== 'tumble') this.steer(speed, deltaTime)
    this.flyStep(deltaTime)
    this.face(deltaTime)
    this.glow += (glowTarget - this.glow) * Math.min(1, deltaTime * 4)
    this.syncTransform()
    this.updateAnimations(deltaTime)
  }

  private enter(state: CloudState): void {
    this.cloudState = state
    this.stateTime = 0
    this.lowTime = 0
    if (state === 'hover') {
      this.strikeTimer = STRIKE_INTERVAL + (Math.random() * 2 - 1) * STRIKE_JITTER
      this.hoverHeight = HOVER_HEIGHT_MIN + Math.random() * (HOVER_HEIGHT_MAX - HOVER_HEIGHT_MIN)
      if (this.player) this.orbitAngle = Math.atan2(this.position.z - this.player.z, this.position.x - this.player.x)
    }
    if (state !== 'charge' && this.ring) this.ring.visible = false
  }

  /** Mark the ground under the player and start gathering the strike. */
  private beginCharge(): void {
    const p = this.player
    if (!p) return
    this.strikeAt.set(p.x, this.groundBelow(p.x, p.y + 0.5, p.z), p.z)
    this.enter('charge')
    if (this.ring) this.ring.visible = true
  }

  /** Bolt into the marked ground: hits a player still in the ring under open sky; a roof takes it otherwise. */
  private fireStrike(): void {
    this.enter('strike')
    this.flash = 1
    const from = this.tmp2.set(this.position.x, this.position.y + 0.05, this.position.z)
    // A roof over the mark stops the bolt there
    const end = this.tmp.copy(this.strikeAt)
    const roof = this.roofAbove(this.strikeAt.x, this.strikeAt.y + 1, this.strikeAt.z, Math.floor(from.y) - 1)
    if (roof !== null) end.y = roof
    this.buildBolt(from, end)
    this.soundPos.x = end.x
    this.soundPos.y = end.y
    this.soundPos.z = end.z
    // The id belongs to the weather sound set (audio)
    playSound('weather.zap', this.soundPos)

    const p = this.player
    if (!p || !this.damageCb) return
    const dx = p.x - this.strikeAt.x
    const dz = p.z - this.strikeAt.z
    const inRing = dx * dx + dz * dz <= (RING_RADIUS + HIT_SLACK) ** 2 && Math.abs(p.y - this.strikeAt.y) <= HIT_HEIGHT
    if (!inRing || this.isSheltered(p)) return
    const push = this.step.set(dx, 0, dz)
    if (push.lengthSq() > 1e-4) push.normalize().multiplyScalar(1.5)
    push.y = 2
    this.damageCb(STRIKE_DAMAGE, push, 'magic')
  }

  /** Is there any block over the player's head (a roof, a canopy, a cave ceiling)? */
  private isSheltered(p: THREE.Vector3): boolean {
    if (!this.blockAt) return false
    const x = Math.floor(p.x)
    const z = Math.floor(p.z)
    const head = Math.floor(p.y + 1.62)
    const top = Math.min(511, head + SHELTER_SCAN)
    for (let y = head + 1; y <= top; y++) {
      if (this.blockAt(x, y, z) !== 0) return true
    }
    return false
  }

  /** The underside of the lowest block in a column from y0 up to y1 (a roof), or null. */
  private roofAbove(x: number, y0: number, z: number, y1: number): number | null {
    if (!this.blockAt) return null
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    for (let y = Math.floor(y0); y <= y1; y++) {
      if (this.blockAt(bx, y, bz) !== 0) return y
    }
    return null
  }

  /** Lay a jagged bolt from `from` to `to` (world), with a branch off its upper half. */
  private buildBolt(from: THREE.Vector3, to: THREE.Vector3): void {
    const pts = this.boltPoints
    const len = from.distanceTo(to)
    for (let i = 0; i <= BOLT_SEGMENTS; i++) {
      const t = i / BOLT_SEGMENTS
      // Wander sideways, most in the middle, none at the ends
      const amp = Math.sin(t * Math.PI) * Math.min(0.9, 0.12 * len)
      pts[i].lerpVectors(from, to, t)
      if (i > 0 && i < BOLT_SEGMENTS) {
        pts[i].x += (Math.random() * 2 - 1) * amp
        pts[i].z += (Math.random() * 2 - 1) * amp
        pts[i].y += (Math.random() * 2 - 1) * amp * 0.3
      }
    }
    const fork = 2 + Math.floor(Math.random() * 3)
    const b = this.branchPoints
    b[0].copy(pts[fork])
    const a = Math.random() * Math.PI * 2
    for (let i = 1; i <= BRANCH_SEGMENTS; i++) {
      b[i].copy(b[i - 1])
      b[i].x += Math.cos(a) * 0.35 + (Math.random() - 0.5) * 0.4
      b[i].z += Math.sin(a) * 0.35 + (Math.random() - 0.5) * 0.4
      b[i].y -= 0.45 + Math.random() * 0.3
    }
    if (this.bolt) this.bolt.visible = true
  }

  /** Place the bolt's segments (world path → the root's local space). */
  private layBolt(): void {
    const origin = this.position
    let k = 0
    const place = (a: THREE.Vector3, b: THREE.Vector3, width: number): void => {
      const core = this.boltCore[k]
      const glow = this.boltGlow[k]
      k++
      this.step.copy(b).sub(a)
      const len = this.step.length()
      if (len < 1e-4) {
        core.visible = glow.visible = false
        return
      }
      core.visible = glow.visible = true
      this.step.divideScalar(len)
      core.quaternion.setFromUnitVectors(this.up, this.step)
      glow.quaternion.copy(core.quaternion)
      core.position.copy(a).add(b).multiplyScalar(0.5).sub(origin)
      glow.position.copy(core.position)
      core.scale.set(width, len + width, width)
      glow.scale.set(width * 4, len + width * 4, width * 4)
    }
    for (let i = 0; i < BOLT_SEGMENTS; i++) place(this.boltPoints[i], this.boltPoints[i + 1], 0.07)
    for (let i = 0; i < BRANCH_SEGMENTS; i++) place(this.branchPoints[i], this.branchPoints[i + 1], 0.04)
  }

  /** Steer toward the target with a slow, heavy drift. */
  private steer(speed: number, deltaTime: number): void {
    this.tmp.copy(this.target).sub(this.position)
    const dist = this.tmp.length()
    if (dist > 0.05 && speed > 0) this.tmp.multiplyScalar(Math.min(speed, dist * 1.5) / dist)
    else this.tmp.set(0, 0, 0)
    // A cloud never quite holds still
    this.tmp.x += Math.sin(this.time * 0.8 + this.phaseA) * 0.25
    this.tmp.y += Math.sin(this.time * 1.1 + this.phaseB) * 0.15
    this.tmp.z += Math.cos(this.time * 0.7 + this.phaseB) * 0.25
    this.flightVel.lerp(this.tmp, Math.min(1, deltaTime * 2))
  }

  /** Move by velocity·dt, sliding along solid blocks; rises over what blocks it. */
  private flyStep(deltaTime: number): void {
    const pos = this.position
    if (!this.clear(pos.x, pos.y, pos.z)) {
      // Inside foliage or a cliff edge: rise out of it
      pos.y += deltaTime * 3
      return
    }
    const step = this.step.copy(this.flightVel).multiplyScalar(deltaTime)
    let blocked = false
    if (this.clear(pos.x + step.x, pos.y, pos.z)) pos.x += step.x
    else {
      this.flightVel.x = 0
      blocked = true
    }
    if (this.clear(pos.x, pos.y, pos.z + step.z)) pos.z += step.z
    else {
      this.flightVel.z = 0
      blocked = true
    }
    if (this.clear(pos.x, pos.y + step.y, pos.z)) pos.y += step.y
    else this.flightVel.y = 0
    if (blocked && this.cloudState !== 'drained') this.flightVel.y = Math.max(this.flightVel.y, 2)
    if (pos.y > 480) pos.y = 480
  }

  /** The collision box (underside at y) is free of solid blocks. */
  private clear(x: number, y: number, z: number): boolean {
    const solid = this.solidAt
    if (!solid) return true
    for (const oy of [0.05, COLLIDE_HEIGHT * 0.5, COLLIDE_HEIGHT]) {
      const by = Math.floor(y + oy)
      if (solid(Math.floor(x - HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x - HALF), by, Math.floor(z + HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z + HALF))) return false
    }
    return true
  }

  /** Top of the ground below (x, fromY, z): the first solid block's top face, or GROUND_SCAN below. */
  private groundBelow(x: number, fromY: number, z: number): number {
    const solid = this.solidAt
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    const start = Math.floor(fromY)
    if (!solid) return start - 1
    for (let y = start; y >= start - GROUND_SCAN; y--) {
      if (solid(bx, y, bz)) return y + 1
    }
    return start - GROUND_SCAN
  }

  /** Turn the eye toward the player. */
  private face(deltaTime: number): void {
    const body = this.body
    const p = this.player
    if (!body || !p) return
    const dx = p.x - this.position.x
    const dz = p.z - this.position.z
    if (dx * dx + dz * dz < 0.01) return
    let delta = Math.atan2(dx, dz) - body.rotation.y
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    body.rotation.y += delta * Math.min(1, deltaTime * 2.5)
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const physics = this.getPhysicsBody()
    if (physics) physics.position.copy(this.position)
  }

  protected updateAnimations(deltaTime: number): void {
    const state = this.cloudState
    const charging = state === 'charge' ? Math.min(1, this.stateTime / CHARGE_TIME) : 0
    const t = this.time
    // Churning puffs: each lobe bobs, sways and breathes on its own clock; faster while charging
    const churn = 1 + 2.5 * charging
    for (const lobe of this.lobes) {
      const ph = lobe.phase
      const s = lobe.speed * churn
      lobe.group.position.set(
        lobe.base.x + Math.sin(t * 0.9 * s + ph) * 0.03,
        lobe.base.y + Math.sin(t * 1.3 * s + ph * 1.7) * 0.035,
        lobe.base.z + Math.cos(t * 0.8 * s + ph) * 0.03
      )
      const breathe = 1 + 0.05 * Math.sin(t * 1.1 * s + ph * 2.3)
      lobe.group.scale.setScalar(breathe)
      lobe.group.rotation.y = Math.sin(t * 0.3 * s + ph) * 0.08
    }
    // Rain: each drop falls from the belly and starts again somewhere else under it
    for (let i = 0; i < this.raindrops.length; i++) {
      const before = this.dropPhase[i]
      const phase = (before + deltaTime * DROP_RATE) % 1
      this.dropPhase[i] = phase
      const drop = this.raindrops[i]
      if (phase < before) drop.position.set((Math.random() * 2 - 1) * 10 * S, 0, (Math.random() * 2 - 1) * 8 * S)
      drop.position.y = (-6 - phase * DROP_FALL) * S
      drop.visible = this.glow > 0.3
    }

    // Veins: each flickers on its own; all blaze while charging; dark when drained
    for (let i = 0; i < this.veinMaterials.length; i++) {
      this.veinTimer[i] -= deltaTime
      if (this.veinTimer[i] <= 0) {
        if (charging > 0) {
          this.veinLevel[i] = 0.6 + Math.random() * 0.4
          this.veinTimer[i] = 0.03 + Math.random() * 0.06
        } else {
          const fire = Math.random() < 0.35
          this.veinLevel[i] = fire ? 0.8 + Math.random() * 0.2 : Math.random() * 0.25
          this.veinTimer[i] = fire ? 0.05 + Math.random() * 0.1 : 0.15 + Math.random() * 0.9
          if (fire && Math.random() < 0.4) this.flash = Math.max(this.flash, 0.45)
        }
      }
      const level = Math.min(1, this.veinLevel[i] * this.glow + (state === 'strike' ? 1 : 0))
      this.veinMaterials[i].color.copy(this.veinDim).lerp(this.veinBright, level).multiplyScalar(0.35 + 0.65 * this.glow)
    }
    // The inner flash: veins firing, the charge building, the strike itself
    this.flash = Math.max(0, this.flash - deltaTime * 4)
    const flash = Math.max(this.flash, charging * (0.25 + 0.25 * Math.sin(t * 40))) * this.glow
    for (const m of this.cloudMaterials) m.emissive.copy(this.glowBase).multiplyScalar(0.4 + 0.6 * this.glow).lerp(this.glowFlash, flash)

    // Eye: steady glow, widening and flaring white in the charge, dim when drained
    if (this.eyeMaterial) {
      this.eyeMaterial.color.copy(this.eyeColor).multiplyScalar(0.3 + 0.7 * this.glow + 0.4 * charging)
    }
    if (this.haloMaterial) this.haloMaterial.opacity = (0.12 + 0.35 * charging + 0.1 * Math.sin(t * 2.2)) * this.glow
    if (this.eye) this.eye.scale.set(1 + 0.25 * charging, 1 + 0.45 * charging, 1)

    // Ring: fades in and crackles at the mark; the inner ring closes in on the centre
    if (this.ring && this.ring.visible) {
      this.ring.position.set(this.strikeAt.x - this.position.x, this.strikeAt.y + 0.04 - this.position.y, this.strikeAt.z - this.position.z)
      const crackle = 0.75 + 0.25 * Math.sin(t * 53) * Math.sin(t * 31)
      if (this.ringMaterial) this.ringMaterial.opacity = Math.min(1, charging * 2.2) * 0.85 * crackle
      if (this.ringInnerMaterial) this.ringInnerMaterial.opacity = charging * 0.7 * crackle
      const inner = Math.max(0.05, RING_RADIUS * (1 - charging))
      this.ringInner?.scale.set(inner, inner, inner)
      this.ringOuter?.rotation.set(-Math.PI / 2, 0, t * 2)
      for (let i = 0; i < this.ringSparks.length; i++) {
        const spark = this.ringSparks[i]
        const a = (i / this.ringSparks.length) * Math.PI * 2 + Math.sin(t * 17 + i * 3.1) * 0.25
        const r = RING_RADIUS - 0.25 + 0.2 * Math.sin(t * 23 + i * 1.7)
        spark.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r)
        spark.rotation.set(-Math.PI / 2, 0, -a + Math.PI / 2 + Math.sin(t * 29 + i) * 0.6)
        spark.visible = Math.sin(t * 37 + i * 2.3) > -0.2
      }
    }

    // Bolt: two quick flashes over its lifetime
    if (this.bolt && this.bolt.visible) {
      this.layBolt()
      const life = this.stateTime / STRIKE_TIME
      const on = life < 0.35 || (life > 0.55 && life < 0.9)
      this.bolt.visible = state === 'strike'
      if (this.boltCoreMaterial) this.boltCoreMaterial.opacity = on ? 1 : 0.15
      if (this.boltGlowMaterial) this.boltGlowMaterial.opacity = on ? 0.38 : 0.05
    }
  }

  /** The storm passed: the cloud thins, spreads and rises away. */
  private updateExit(deltaTime: number, progress: number): void {
    if (this.ring) this.ring.visible = false
    if (this.bolt) this.bolt.visible = false
    this.glow += (0 - this.glow) * Math.min(1, deltaTime * 2)
    this.flightVel.lerp(this.tmp.set(0, 1.2, 0), Math.min(1, deltaTime * 2))
    this.position.addScaledVector(this.flightVel, deltaTime)
    this.syncTransform()
    this.updateAnimations(deltaTime)
    // Lobes drift apart as it thins
    const spread = 1 + progress * 1.6
    for (const lobe of this.lobes) {
      lobe.group.position.multiplyScalar(spread)
      lobe.group.scale.multiplyScalar(1 + progress * 0.4)
    }
    const fade = 1 - progress * progress * (3 - 2 * progress)
    fadeMaterials(this.fadeList, fade, this.baseOpacity)
    if (progress >= 1) this.kill()
  }

  /** Slain: it bursts in a last flash, puffs flung out and fading. */
  private updateDeath(deltaTime: number): void {
    if (this.ring) this.ring.visible = false
    if (this.bolt) this.bolt.visible = false
    this.deathTimer += deltaTime
    const k = Math.min(1, this.deathTimer / DEATH_SECONDS)
    this.flash = k < 0.25 ? 1 : 0
    this.glow = Math.max(0, 1 - k * 1.5)
    this.updateAnimations(deltaTime)
    for (const drop of this.raindrops) drop.visible = false
    const burst = 1 + k * 2.2
    for (const lobe of this.lobes) {
      lobe.group.position.copy(lobe.base).multiplyScalar(burst)
      lobe.group.scale.setScalar(1 + k * 0.6)
    }
    fadeMaterials(this.fadeList, 1 - k * k, this.baseOpacity)
    this.syncTransform()
    if (this.deathTimer >= DEATH_SECONDS) this.kill()
  }

  /** A blow knocks it aside and breaks a charge. */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (this.retreat.leaving) return false
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!handled || this._isDying) return handled
    // The base class wrote the knockback into the physics body: fly it
    const physics = this.getPhysicsBody()
    if (physics) {
      this.flightVel.copy(physics.velocity)
      physics.velocity.set(0, 0, 0)
    }
    this.knockbackTimer = 0
    this.engaged = true
    this.flash = 0.8
    this.enter('tumble')
    return handled
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (this.retreat.leaving) return false
    // Measured to the cloud's centre, not its underside
    if (!this.isAlive || this._isDying) return false
    this.tmp.set(this.position.x, this.position.y + BODY_Y, this.position.z)
    return this.tmp.distanceTo(playerPosition) <= maxDistance + 0.8
  }

  dispose(): void {
    this.body = null
    this.lobes = []
    this.raindrops = []
    this.eye = null
    this.veinMaterials = []
    this.eyeMaterial = null
    this.haloMaterial = null
    this.cloudMaterials = []
    this.ring = null
    this.ringOuter = null
    this.ringInner = null
    this.ringSparks = []
    this.ringMaterial = null
    this.ringInnerMaterial = null
    this.bolt = null
    this.boltCore = []
    this.boltGlow = []
    this.boltCoreMaterial = null
    this.boltGlowMaterial = null
    this.fadeList = []
    this.baseOpacity.clear()
    this.player = null
    this.damageCb = null
    this.blockAt = null
    this.solidAt = null
    super.dispose()
  }
}
