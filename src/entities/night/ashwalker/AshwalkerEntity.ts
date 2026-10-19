import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { CinderCoreItem } from '../../../items/materials/cinder_core/CinderCoreItem.ts'
import { CharcoalItem } from '../../../items/materials/charcoal/CharcoalItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { DawnRetreat, fadeMaterials } from '../NightCreature.ts'
import { ignitePlayer } from '../NightSenses.ts'
import { playSound } from '../../../audio/SoundHooks.ts'

// Colours: compacted ash and cooling basalt, ember cracks
const ASH = 0x4a4643
const ASH_CRUST = 0x76716a
const BASALT = 0x2b2725
const BASALT_DARK = 0x1c1917
const FACE_HOLLOW = 0x140806
const SMOKE = 0x8d877f
/** Dead embers: the cracks' colour once the fire is out (dawn crumble). */
const CRACK_DEAD = 0x4f4a45

const S = 0.0625 // 1 "pixel" = 1/16 block
/** Forward lean of the torso at rest (radians). */
const HUNCH = 0.55
/** The head's counter-tilt at rest, so it looks ahead out of the hunch. */
const HEAD_REST = -0.5

// Combat
const MAX_HEALTH = 40
const MELEE_DAMAGE = 6
const MELEE_IGNITE_TICKS = 4
/** At or below this share of its health the Ashwalker kindles. */
const KINDLE_FRACTION = 0.35
const WALK_SPEED = 3
const KINDLED_SPEED = 5

// Ember burst: a short cone of embers exhaled at a player close in front
const BURST_TRIGGER_RANGE = 4
/** Trigger: the player within ±45° of its facing. */
const BURST_TRIGGER_COS = Math.cos(Math.PI / 4)
/** Hit: within a 60° cone (±30°) at release. */
const BURST_HIT_COS = Math.cos(Math.PI / 6)
const BURST_HIT_RANGE = 4
const BURST_WINDUP = 0.8
const BURST_RECOVER = 0.6
const BURST_COOLDOWN = 6
const BURST_DAMAGE = 5
const BURST_IGNITE_TICKS = 3
/** A blow during the windup chokes the burst (and its cooldown restarts short). */
const BURST_INTERRUPT_COOLDOWN = 2.5

// Death: slumps into a smouldering ash pile
const DEATH_COLLAPSE = 0.9
const DEATH_SMOULDER = 1.8

/** Ash wisps rising from the shoulders. */
const WISP_COUNT = 6
const WISP_LIFE = 1.8
/** Pooled sparks: idle embers drifting up, and the burst spray. */
const SPARK_COUNT = 18

type BurstPhase = 'none' | 'windup' | 'recover'

/** A glowing crack: a polyline on a face plane (see createMesh). */
interface Seam {
  readonly axis: 'z' | 'x'
  readonly at: number
  readonly pts: readonly number[]
  readonly width?: number
}

interface Spark {
  readonly mesh: THREE.Mesh
  readonly velocity: THREE.Vector3
  life: number
  maxLife: number
  size: number
  gravity: number
}

/**
 * Ashwalker - a night creature of the volcanic badlands: a hunched, gaunt
 * figure of compacted ash and cooling basalt, ember cracks glowing along its
 * long arms and chest, two coals for eyes in a hollow, smouldering face and
 * ash wisps curling off its shoulders.
 *
 * It lumbers after the player (3 blocks/s) and its blows set them alight. A
 * player who lingers close in front gets an ember burst: it rears back with
 * its chest glowing white-hot (0.8 s - a hit chokes it), then exhales a short
 * cone of embers (5 fire damage and burning). Every blow it takes makes its
 * cracks flare; brought low (35%) it kindles - cracks blazing, 5 blocks/s.
 * Fire resistance shrugs all of it off. At dawn it crumbles: the glow dies,
 * and it falls apart into the ground.
 *
 * Stats: 40 HP, 6 damage + burning (4 ticks), 2.2 block reach, 1.4 s
 * cooldown, 20 block detection; burst 5 'fire' + burning (3 ticks).
 * Drops: 1 cinder core, 0-2 charcoal.
 */
export class AshwalkerEntity extends AggressiveEntity {
  readonly type = 'ashwalker'

  private readonly dawn = new DawnRetreat(1.8)

  private walkPhase = Math.random() * Math.PI * 2
  private glowPhase = Math.random() * Math.PI * 2
  private swingTime = -1
  private swingArm = 0
  /** Glow boost from being hit (decays). */
  private flare = 0
  private kindled = false

  private burst: BurstPhase = 'none'
  private burstTime = 0
  private burstCooldown = 3 + Math.random() * 2
  private readonly burstDir = new THREE.Vector3()

  private player: THREE.Vector3 | null = null
  private damageCb: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null

  private readonly tmp = new THREE.Vector3()
  private readonly knock = new THREE.Vector3()
  private readonly heat = new THREE.Color()
  /** Where its sounds play from (chest height). */
  private readonly soundPos = new THREE.Vector3()
  private vanishPlayed = false

  // Mesh parts
  private body: THREE.Group | null = null
  private torso: THREE.Group | null = null
  private head: THREE.Group | null = null
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private crackMaterial: THREE.MeshBasicMaterial | null = null
  private coreMaterial: THREE.MeshBasicMaterial | null = null
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private sparkMaterial: THREE.MeshBasicMaterial | null = null
  /** Everything that fades out when it crumbles or its ash pile settles. */
  private readonly fadeTargets: THREE.Material[] = []
  private readonly wisps: Array<{ mesh: THREE.Mesh; material: THREE.MeshLambertMaterial; age: number; side: number }> = []
  private readonly sparks: Spark[] = []
  private sparkTimer = 0

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('ashwalker', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.75, 1.9, 0.75),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: MELEE_DAMAGE,
      attackRange: 2.2,
      attackCooldown: 1.4,
      detectionRange: 20,
      chaseSpeed: WALK_SPEED,
      walkSpeed: 1.2,
      // Heavy: barely budges when struck
      knockbackHorizontal: 3.5,
      knockbackVertical: 2.5,
      knockbackStunTime: 0.3,
      attackKnockbackHorizontal: 4.0,
      attackKnockbackVertical: 3.0,
      drops: [
        { createItem: () => new CinderCoreItem(), minCount: 1, maxCount: 1 },
        { createItem: () => new CharcoalItem(), minCount: 0, maxCount: 2 },
      ],
    })
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

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()

    const ash = new THREE.MeshLambertMaterial({ color: ASH })
    const crust = new THREE.MeshLambertMaterial({ color: ASH_CRUST })
    const basalt = new THREE.MeshLambertMaterial({ color: BASALT })
    const basaltDark = new THREE.MeshLambertMaterial({ color: BASALT_DARK })
    for (const m of [ash, crust, basalt, basaltDark]) this.registerMaterialForLighting(m)
    // Glowing parts stay full-bright
    this.crackMaterial = new THREE.MeshBasicMaterial({ color: 0xff4a12 })
    this.coreMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a30 })
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffb040 })
    const hollow = new THREE.MeshBasicMaterial({ color: FACE_HOLLOW })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }
    // Ember cracks: jagged glowing seams drawn as polylines on a face plane
    // (front/back: points are x,y at depth z; sides: z,y at x), merged into
    // one mesh per part
    const seams = (parent: THREE.Object3D, m: THREE.Material, strokes: ReadonlyArray<Seam>): void => {
      const geos: THREE.BufferGeometry[] = []
      for (const { axis, at, pts, width = 0.75 } of strokes) {
        for (let i = 0; i + 3 < pts.length; i += 2) {
          const [a0, b0, a1, b1] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]
          const len = Math.hypot(a1 - a0, b1 - b0) + width * 0.6
          const g = axis === 'z'
            ? new THREE.BoxGeometry(len * S, width * S, 0.4 * S).rotateZ(Math.atan2(b1 - b0, a1 - a0))
            : new THREE.BoxGeometry(0.4 * S, width * S, len * S).rotateX(-Math.atan2(b1 - b0, a1 - a0))
          geos.push(axis === 'z'
            ? g.translate(((a0 + a1) / 2) * S, ((b0 + b1) / 2) * S, at * S)
            : g.translate(at * S, ((b0 + b1) / 2) * S, ((a0 + a1) / 2) * S))
        }
      }
      const merged = mergeGeometries(geos)
      for (const g of geos) g.dispose()
      if (merged) parent.add(new THREE.Mesh(merged, m))
    }
    const crack = this.crackMaterial

    const body = new THREE.Group()
    root.add(body)
    this.body = body

    // Legs: ash thighs, thin basalt shins, splayed clawed feet; hips at y 15
    const legH = 15
    const makeLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group()
      leg.position.set(side * 2.7 * S, legH * S, 0)
      box(3.4, 7, 3.4, ash, 0, -3.5, 0, leg) // thigh
      box(3.6, 1.6, 3.6, basalt, 0, -7.6, 0.1, leg) // knee
      box(2.6, 6, 2.6, basalt, 0, -11, 0.4, leg) // shin
      box(4, 2, 5.5, basaltDark, 0, -14, 1.2, leg) // foot
      for (const t of [-1.2, 0, 1.2]) box(0.8, 1, 1.4, basaltDark, t, -14.5, 4.4, leg)
      seams(leg, crack, [
        { axis: 'z', at: 1.9, pts: [side * 0.5, -1.4, -side * 0.3, -3.6, side * 0.5, -6.2] },
        { axis: 'z', at: 1.9, pts: [-side * 0.2, -9.2, side * 0.4, -10.8, -side * 0.1, -12.6] },
        { axis: 'x', at: side * 1.9, pts: [0.6, -1.8, -0.6, -4.2, 0.3, -6.2] },
      ])
      body.add(leg)
      return leg
    }
    this.leftLeg = makeLeg(-1)
    this.rightLeg = makeLeg(1)

    // Torso: pivots at the hips (set back a little) and hunches forward
    // under a great ashen hump
    const torso = new THREE.Group()
    torso.position.set(0, legH * S, -2 * S)
    body.add(torso)
    this.torso = torso
    box(7, 4, 4.5, basalt, 0, 1.5, 0, torso) // pelvis
    box(7.5, 5, 4.8, ash, 0, 5.5, 0.2, torso) // gaunt belly
    box(10, 6, 6.2, ash, 0, 10.5, -0.2, torso) // ribcage
    box(12, 5, 7.4, ash, 0, 15, -0.9, torso) // hump and shoulders
    box(11, 1.4, 6.4, crust, 0, 18.1, -1.3, torso) // ash crust on the hump
    for (const side of [-1, 1]) box(3.6, 3, 5, crust, side * 5.4, 16.2, -0.6, torso)
    for (const [y, z] of [[17.2, -4.4], [13.4, -4.8], [9.4, -3.6]]) box(2.4, 2, 1.6, basalt, 0, y, z, torso) // spine knobs
    // Chest: a glowing heart, cracks webbing out from it
    box(2.2, 2.2, 0.6, this.coreMaterial, 0.3, 10, 3.0, torso)
    seams(torso, crack, [
      { axis: 'z', at: 2.8, pts: [0.6, 3.4, -0.4, 5.6, 0.5, 7.9] },
      { axis: 'z', at: 3.1, pts: [0.5, 7.9, 0.2, 10, 1.2, 12.4, 0.4, 13.4] },
      { axis: 'z', at: 3.1, pts: [0.2, 10, -2.2, 10.9, -3.4, 12.8] },
      { axis: 'z', at: 3.1, pts: [0.2, 10, 2.6, 9.2, 3.6, 10.6] },
      { axis: 'z', at: 3.05, pts: [-4.6, 13.4, -3, 15.2, -3.6, 16.8] },
      { axis: 'z', at: 3.05, pts: [1.2, 13.6, 3.2, 14.6, 4.4, 16.4] },
      // across the back and flanks, so it reads from every side in the dark
      { axis: 'z', at: -4.8, pts: [-3, 13.4, -1, 15, -1.8, 16.6, 0.6, 17.4] },
      { axis: 'z', at: -4.8, pts: [2, 13, 3.6, 15.2, 2.8, 16.8] },
      { axis: 'z', at: -3.5, pts: [0.4, 7.8, -0.8, 9.8, 0.8, 12] },
      { axis: 'x', at: -5.2, pts: [1.5, 8, 0.2, 10.2, 1, 12.4] },
      { axis: 'x', at: 5.2, pts: [-1.4, 8.4, -0.2, 10.4, -1.2, 12.6] },
      { axis: 'x', at: -6.2, pts: [1.6, 13.4, 0.2, 15.2, -1.8, 16.2] },
      { axis: 'x', at: 6.2, pts: [-2.2, 13.2, -0.4, 14.8, 1.4, 16.4] },
    ])

    // Head: jutting forward below the hump; a hollow face under a heavy
    // brow, two coal eyes and a glowing gash of a mouth
    const head = new THREE.Group()
    head.position.set(0, 14.5 * S, 3 * S)
    torso.add(head)
    this.head = head
    box(3, 3, 3.2, basalt, 0, 0.6, 0.6, head) // neck
    box(6, 5.5, 6.5, ash, 0, 3.8, 2.6, head) // skull
    box(6.6, 1.4, 2, crust, 0, 6.2, 5.2, head) // brow overhang
    box(6.4, 1.2, 6, crust, 0, 7.0, 2.4, head) // crown crust
    box(4.6, 3.2, 0.5, hollow, 0, 3.9, 5.95, head) // hollow face
    for (const side of [-1, 1]) box(1.3, 0.9, 0.4, this.eyeMaterial, side * 1.25, 4.5, 6.2, head)
    box(5, 1.4, 4, basalt, 0, 0.5, 3.8, head) // dropped jaw
    box(3.8, 0.9, 0.4, this.coreMaterial, 0, 1.75, 5.95, head) // the mouth's glow
    for (const side of [-1, 1]) box(0.6, 0.9, 0.5, basaltDark, side * 1.3, 1.6, 6.05, head) // fangs
    seams(head, crack, [
      { axis: 'z', at: 6.3, pts: [-2.8, 6.0, -1.2, 6.4, 0.4, 6.0, 2.6, 6.3], width: 0.6 },
      { axis: 'x', at: -3.1, pts: [5.2, 4.6, 3.6, 3.2, 1.8, 4.2] },
      { axis: 'x', at: 3.1, pts: [5.0, 2.6, 3.4, 4.2, 1.6, 3.2] },
    ])

    // Arms: long and gaunt, dragging their basalt claws near the ground
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 6.6 * S, 14.5 * S, 0.6 * S)
      box(3.4, 3.2, 3.8, crust, 0, -0.3, 0, arm) // shoulder knob
      box(2.4, 9, 2.4, ash, 0, -6, 0, arm) // upper arm
      box(2.8, 1.6, 2.8, basalt, 0, -10.8, 0, arm) // elbow
      box(2.2, 8.5, 2.2, basalt, 0, -15.4, 0.2, arm) // forearm
      box(2.8, 2, 2.6, basaltDark, 0, -20.3, 0.3, arm) // hand
      for (const f of [-0.9, 0, 0.9]) box(0.7, 3.2, 0.7, basaltDark, f, -22.6, f === 0 ? 1 : 0.6, arm)
      seams(arm, crack, [
        { axis: 'z', at: 1.4, pts: [0.2 * side, -2.6, -0.3 * side, -5, 0.3 * side, -8.2] },
        { axis: 'z', at: 1.5, pts: [0, -12.2, 0.4 * side, -14.8, -0.3 * side, -17.6] },
        { axis: 'x', at: side * 1.3, pts: [0.4, -12.8, -0.3, -15.6, 0.3, -18] },
        { axis: 'x', at: side * 1.4, pts: [-0.4, -11.2, 0.4, -10.4], width: 1 },
      ])
      torso.add(arm)
      return arm
    }
    this.leftArm = makeArm(-1)
    this.rightArm = makeArm(1)

    // Ash wisps curling off the shoulders (own materials: each fades alone)
    const wispGeo = new THREE.BoxGeometry(1.6 * S, 1.6 * S, 1.6 * S)
    for (let i = 0; i < WISP_COUNT; i++) {
      const material = new THREE.MeshLambertMaterial({ color: SMOKE, transparent: true, opacity: 0, depthWrite: false })
      this.registerMaterialForLighting(material)
      const mesh = new THREE.Mesh(wispGeo, material)
      root.add(mesh)
      this.wisps.push({ mesh, material, age: (i / WISP_COUNT) * WISP_LIFE, side: i % 2 === 0 ? -1 : 1 })
    }

    // Spark pool: idle embers and the burst spray
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffa040 })
    const sparkGeo = new THREE.BoxGeometry(S, S, S)
    for (let i = 0; i < SPARK_COUNT; i++) {
      const mesh = new THREE.Mesh(sparkGeo, this.sparkMaterial)
      mesh.visible = false
      root.add(mesh)
      this.sparks.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, gravity: 0 })
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [
        body, torso, head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg,
        ...this.wisps.map((w) => w.mesh), ...this.sparks.map((s) => s.mesh),
      ],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // Collect the body's final (post-merge) materials for the fade-outs
    const effects = new Set<THREE.Material>([this.sparkMaterial, ...this.wisps.map((w) => w.material)])
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material as THREE.Material
      if (!effects.has(m) && !this.fadeTargets.includes(m)) this.fadeTargets.push(m)
    })
    this.applyGlow(0.8, 0.8)
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    this.glowPhase += deltaTime * (this.kindled ? 9 : 3.2)
    this.flare = Math.max(0, this.flare - deltaTime * 1.6)

    if (this._isDying) {
      this.updateDeath(deltaTime)
      this.updateEffects(deltaTime, 0.35)
      return
    }

    const exit = this.dawn.update(deltaTime)
    if (exit > 0) {
      if (!this.vanishPlayed) {
        this.vanishPlayed = true
        playSound('night.vanish', this.chestPosition())
      }
      this.updateCrumble(deltaTime, exit)
      this.updateEffects(deltaTime, 1 - exit)
      return
    }

    if (!this.kindled && this.health <= this.maxHealth * KINDLE_FRACTION) this.kindled = true
    this.burstCooldown -= deltaTime

    if (this.burst === 'none' && this.knockbackTimer <= 0 && this.shouldBurst()) {
      this.burst = 'windup'
      this.burstTime = 0
      playSound('magic.windup', this.chestPosition())
    }

    if (this.burst !== 'none') {
      this.updateBurst(deltaTime)
    } else {
      const stunned = this.knockbackTimer > 0
      super.update(deltaTime)
      // Kindled: the chase runs hot (the base chase sets walking velocity each frame)
      const body = this.getPhysicsBody()
      if (this.kindled && !stunned && this.isAggressive && this.isWalking && body) {
        body.velocity.x *= KINDLED_SPEED / WALK_SPEED
        body.velocity.z *= KINDLED_SPEED / WALK_SPEED
      }
    }
    this.updateEffects(deltaTime, 1)
  }

  /** Player close in front, off cooldown, mid-chase. */
  private shouldBurst(): boolean {
    const p = this.player
    if (!p || !this.isAggressive || this.burstCooldown > 0 || this.swingTime >= 0) return false
    const dx = p.x - this.position.x
    const dz = p.z - this.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > BURST_TRIGGER_RANGE || dist < 0.3 || Math.abs(p.y - this.position.y) > 2.5) return false
    const yaw = this.getMesh()?.rotation.y ?? 0
    return (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / dist >= BURST_TRIGGER_COS
  }

  private updateBurst(deltaTime: number): void {
    this.burstTime += deltaTime
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
    }
    this.isWalking = false
    const mesh = this.getMesh()
    const p = this.player

    if (this.burst === 'windup') {
      // Keep turning to face the player while drawing breath
      if (p && mesh) {
        const dx = p.x - this.position.x
        const dz = p.z - this.position.z
        if (dx * dx + dz * dz > 0.01) mesh.rotation.y = turnToward(mesh.rotation.y, Math.atan2(dx, dz), deltaTime * 5)
      }
      if (this.burstTime >= BURST_WINDUP) this.releaseBurst()
    } else if (this.burstTime >= BURST_RECOVER) {
      this.burst = 'none'
    }

    if (body) this.position.copy(body.position)
    if (mesh) mesh.position.copy(this.position)
    this.updateAnimations(deltaTime)
  }

  private releaseBurst(): void {
    this.burst = 'recover'
    this.burstTime = 0
    this.burstCooldown = BURST_COOLDOWN + Math.random() * 1.5
    const yaw = this.getMesh()?.rotation.y ?? 0
    this.burstDir.set(Math.sin(yaw), 0, Math.cos(yaw))
    playSound('night.emberburst', this.chestPosition())

    // The spray: embers fanning out along the cone (model space: +Z is
    // forward), falling as they cool
    for (let i = 0; i < 14; i++) {
      const spread = (Math.random() - 0.5) * (Math.PI / 3)
      const speed = 6 + Math.random() * 4
      this.tmp.set(Math.sin(spread), 0.15 + Math.random() * 0.35, Math.cos(spread)).multiplyScalar(speed)
      this.emitSpark(0, 1.68, 0.85, this.tmp, 0.45 + Math.random() * 0.25, 1.6 + Math.random() * 1.2, 6)
    }

    const p = this.player
    if (!p || !this.damageCb) return
    const dx = p.x - this.position.x
    const dz = p.z - this.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > BURST_HIT_RANGE || Math.abs(p.y - this.position.y) > 2.5) return
    if (dist > 0.3 && (dx * this.burstDir.x + dz * this.burstDir.z) / dist < BURST_HIT_COS) return
    this.knock.copy(this.burstDir).multiplyScalar(3)
    this.knock.y = 2.5
    if (this.damageCb(BURST_DAMAGE, this.knock, 'fire') !== false) ignitePlayer(BURST_IGNITE_TICKS)
  }

  /** The creature's chest, for positional sounds (reused vector). */
  private chestPosition(): THREE.Vector3 {
    return this.soundPos.set(this.position.x, this.position.y + 1.4, this.position.z)
  }

  /** Clawed swipe: damage plus burning; alternate arms. */
  protected override performAttack(): void {
    this.swingTime = 0
    this.swingArm = 1 - this.swingArm
    const p = this.player
    if (!p || !this.damageCb) return
    this.knock.copy(p).sub(this.position).setY(0)
    if (this.knock.lengthSq() > 0) this.knock.normalize()
    this.knock.multiplyScalar(this.attackKnockbackHorizontal)
    this.knock.y = this.attackKnockbackVertical
    if (this.damageCb(this.attackDamage, this.knock, 'melee') !== false) ignitePlayer(MELEE_IGNITE_TICKS)
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
      this.position.copy(body.position)
    }
    const mesh = this.getMesh()
    const t = Math.min(1, this.deathTimer / DEATH_COLLAPSE)
    const ease = 1 - (1 - t) * (1 - t)
    if (mesh) {
      // Knees buckle, it slumps forward and sinks into a low heap of ash
      mesh.position.set(this.position.x, this.position.y - 0.55 * ease, this.position.z)
      mesh.scale.set(1 + 0.12 * ease, 1 - 0.3 * ease, 1 + 0.12 * ease)
    }
    if (this.torso) this.torso.rotation.x = HUNCH + 0.75 * ease
    if (this.head) this.head.rotation.x = HEAD_REST + 0.6 * ease
    for (const [arm, side] of [[this.leftArm, -1], [this.rightArm, 1]] as const) {
      if (arm) {
        arm.rotation.x = -HUNCH - 0.75 * ease
        arm.rotation.z = side * 0.7 * ease
      }
    }
    for (const [leg, side] of [[this.leftLeg, -1], [this.rightLeg, 1]] as const) {
      if (leg) {
        leg.rotation.x = -1.0 * ease
        leg.rotation.z = side * 0.25 * ease
      }
    }
    // The fire sinks to a flickering smoulder
    const smoulder = 0.35 + 0.15 * Math.sin(this.glowPhase * 2.3) * Math.sin(this.glowPhase * 0.7)
    this.applyGlow(1.2 - (1.2 - smoulder) * ease, 1.4 - (1.4 - smoulder) * ease)

    const end = DEATH_COLLAPSE + DEATH_SMOULDER
    const fade = Math.max(0, (this.deathTimer - (end - 0.5)) / 0.5)
    if (fade > 0) fadeMaterials(this.fadeTargets, 1 - fade)
    if (this.deathTimer >= end) this.kill()
  }

  /** Dawn: the glow dies out, it greys and falls apart into the ground. */
  private updateCrumble(deltaTime: number, exit: number): void {
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
      this.position.copy(body.position)
    }
    this.isWalking = false
    const mesh = this.getMesh()
    if (mesh) {
      // Shudders, shrinks and sinks as it comes apart
      const shake = exit < 0.85 ? Math.sin(this.glowPhase * 11) * 0.03 * (1 - exit) : 0
      mesh.position.set(this.position.x + shake, this.position.y - 0.9 * exit * exit, this.position.z)
      const k = 1 - 0.55 * exit
      mesh.scale.set(k, k * (1 - 0.25 * exit), k)
    }
    // Limbs drop away from the body
    if (this.torso) this.torso.rotation.x = HUNCH + 0.5 * exit
    for (const [arm, side] of [[this.leftArm, -1], [this.rightArm, 1]] as const) {
      if (arm) {
        arm.rotation.x = -HUNCH + 0.4 * exit
        arm.rotation.z = side * 0.7 * exit
      }
    }
    if (this.head) this.head.rotation.x = HEAD_REST + 0.8 * exit
    // Embers go out: fire colour → dead grey
    this.applyGlow(Math.max(0, 0.8 * (1 - exit * 1.6)), Math.max(0, 0.9 * (1 - exit * 1.4)), Math.min(1, exit * 1.6))
    if (exit > 0.6) fadeMaterials(this.fadeTargets, 1 - (exit - 0.6) / 0.4)
    if (exit >= 1) this.kill()
  }

  protected updateAnimations(deltaTime: number): void {
    const hunch = HUNCH
    let torsoX = hunch
    let headX = HEAD_REST
    let armLX = -hunch
    let armRX = -hunch
    let armZ = 0
    let legSwing = 0

    if (this.isWalking) {
      this.walkPhase += deltaTime * (this.kindled && this.isAggressive ? 8.5 : this.isAggressive ? 5.5 : 3.5)
      legSwing = Math.sin(this.walkPhase) * 0.45
      // Arms dangle and swing loosely, a lurching sway
      armLX += -legSwing * 0.55
      armRX += legSwing * 0.55
      torsoX += Math.abs(Math.sin(this.walkPhase)) * 0.06
    } else {
      armLX += Math.sin(this.glowPhase * 0.4) * 0.05
      armRX += Math.sin(this.glowPhase * 0.4 + 1) * 0.05
    }
    if (this.isAggressive) armLX -= 0.25
    if (this.isAggressive) armRX -= 0.25

    if (this.burst === 'windup') {
      // Rears back, arms spread, drawing breath - chest going white-hot
      const t = Math.min(1, this.burstTime / BURST_WINDUP)
      const e = 1 - (1 - t) * (1 - t)
      torsoX = hunch - 0.55 * e
      headX = HEAD_REST - 0.35 * e
      armLX = -hunch - 0.6 * e
      armRX = -hunch - 0.6 * e
      armZ = 0.75 * e
    } else if (this.burst === 'recover') {
      // Lurches forward through the exhale, then settles
      const t = Math.min(1, this.burstTime / BURST_RECOVER)
      const thrust = Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) * (1 - t * 0.6)
      torsoX = hunch + 0.45 * thrust
      headX = HEAD_REST + 0.2 * thrust
      armZ = 0.75 * (1 - t)
      armLX = -hunch - 0.6 * (1 - t)
      armRX = armLX
    }

    if (this.swingTime >= 0) {
      // Overhead claw: raise, then rake down through the target
      this.swingTime += deltaTime
      const t = Math.min(1, this.swingTime / 0.45)
      const raise = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65
      const angle = -hunch - 2.2 * raise + 0.6 * Math.max(0, (t - 0.35) / 0.65) * (1 - t) * 4
      if (this.swingArm === 0) armLX = angle
      else armRX = angle
      torsoX += 0.15 * Math.sin(t * Math.PI)
      if (t >= 1) this.swingTime = -1
    }

    const k = Math.min(1, deltaTime * 14)
    if (this.torso) this.torso.rotation.x += (torsoX - this.torso.rotation.x) * k
    if (this.head) this.head.rotation.x += (headX - this.head.rotation.x) * k
    if (this.leftArm) {
      this.leftArm.rotation.x += (armLX - this.leftArm.rotation.x) * (this.swingTime >= 0 ? 1 : k)
      this.leftArm.rotation.z += (-armZ - this.leftArm.rotation.z) * k
    }
    if (this.rightArm) {
      this.rightArm.rotation.x += (armRX - this.rightArm.rotation.x) * (this.swingTime >= 0 ? 1 : k)
      this.rightArm.rotation.z += (armZ - this.rightArm.rotation.z) * k
    }
    if (this.leftLeg) this.leftLeg.rotation.x = legSwing
    if (this.rightLeg) this.rightLeg.rotation.x = -legSwing
    if (this.body) this.body.position.y = this.isWalking ? Math.abs(Math.cos(this.walkPhase)) * 0.04 : 0

    // Cracks pulse; blows make them flare; kindled they blaze
    const pulse = 0.08 * Math.sin(this.glowPhase) + 0.05 * Math.sin(this.glowPhase * 2.7)
    const base = this.kindled ? 1.45 : 0.8
    let crack = base + pulse + this.flare
    let core = crack + 0.1
    if (this.burst === 'windup') {
      // The telegraph: the whole crack network heats toward white
      const t = Math.min(1, this.burstTime / BURST_WINDUP)
      crack += 0.6 * t
      core = crack + 0.7 * t
    } else if (this.burst === 'recover') {
      const t = Math.max(0, 1 - this.burstTime / 0.3)
      crack += 0.6 * t
      core = crack + 0.7 * t
    }
    this.applyGlow(crack, core)
  }

  /**
   * Set the glow: 0 = cold, 1 = ember orange, 2 = white-hot yellow. `dead`
   * blends the cracks toward cold grey ash (the dawn crumble).
   */
  private applyGlow(crack: number, core: number, dead: number = 0): void {
    if (this.crackMaterial) heatColor(this.crackMaterial.color, crack).lerp(this.heat.setHex(CRACK_DEAD), dead)
    if (this.coreMaterial) heatColor(this.coreMaterial.color, core).lerp(this.heat.setHex(CRACK_DEAD), dead)
    if (this.eyeMaterial) heatColor(this.eyeMaterial.color, Math.max(crack, core) + 0.35).lerp(this.heat.setHex(CRACK_DEAD), dead)
  }

  /** Wisps and sparks; `intensity` scales how much smoke and fire it still gives off. */
  private updateEffects(deltaTime: number, intensity: number): void {
    for (const wisp of this.wisps) {
      wisp.age += deltaTime * (0.7 + 0.3 * intensity)
      if (wisp.age >= WISP_LIFE) wisp.age -= WISP_LIFE
      const t = wisp.age / WISP_LIFE
      // Rise from a shoulder (forward, over the hump), curling and swelling
      wisp.mesh.position.set(
        wisp.side * (3.5 + Math.sin(t * 5 + wisp.side) * 1.5) * S,
        (26 + t * 15) * S,
        (3.5 - t * 3 + Math.cos(t * 4) * 1.2) * S
      )
      wisp.mesh.scale.setScalar(0.6 + t * 1.6)
      wisp.mesh.rotation.y = t * 2 * wisp.side
      wisp.material.opacity = 0.32 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t) * 1.6 * intensity
    }

    // Idle embers drifting up off the cracks
    this.sparkTimer -= deltaTime
    if (this.sparkTimer <= 0 && intensity > 0.05) {
      this.sparkTimer = (this.kindled ? 0.12 : 0.35) / intensity * (0.6 + Math.random() * 0.8)
      this.tmp.set((Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4)
      this.emitSpark((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.2, 0.2 + Math.random() * 0.3, this.tmp, 0.9 + Math.random() * 0.6, 0.8 + Math.random() * 0.6, -0.4)
    }
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue
      spark.life -= deltaTime
      if (spark.life <= 0) {
        spark.mesh.visible = false
        continue
      }
      spark.velocity.y -= spark.gravity * deltaTime
      spark.mesh.position.addScaledVector(spark.velocity, deltaTime)
      spark.mesh.scale.setScalar(spark.size * (spark.life / spark.maxLife))
    }
  }

  /** Launch a pooled spark from a point in model space (feet origin, facing +Z). */
  private emitSpark(x: number, y: number, z: number, velocity: THREE.Vector3, life: number, size: number, gravity: number): void {
    let spark = this.sparks[0]
    for (const s of this.sparks) {
      if (s.life <= 0) {
        spark = s
        break
      }
      if (s.life < spark.life) spark = s
    }
    spark.mesh.position.set(x, y, z)
    spark.velocity.copy(velocity)
    spark.life = life
    spark.maxLife = life
    spark.size = size
    spark.gravity = gravity
    spark.mesh.visible = true
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (this.dawn.leaving) return false
    return super.canPlayerInteract(playerPosition, maxDistance)
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (this.dawn.leaving) return false
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!handled) return false
    // Struck embers flare up
    this.flare = Math.min(1, this.flare + 0.7)
    if (this.burst === 'windup') {
      // A blow knocks the breath out of it: the burst is choked
      this.burstCooldown = BURST_INTERRUPT_COOLDOWN
    }
    // (the base class applied the knockback; let it play out)
    this.burst = 'none'
    return true
  }

  dispose(): void {
    this.body = null
    this.torso = null
    this.head = null
    this.leftArm = null
    this.rightArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.crackMaterial = null
    this.coreMaterial = null
    this.eyeMaterial = null
    this.sparkMaterial = null
    this.fadeTargets.length = 0
    this.wisps.length = 0
    this.sparks.length = 0
    this.player = null
    this.damageCb = null
    super.dispose()
  }
}

const COLD = new THREE.Color(0x3a1408)
const EMBER = new THREE.Color(0xff4a12)
const WHITE_HOT = new THREE.Color(0xffe08a)

/** Heat ramp: 0 cold coal, 1 ember orange, 2 white-hot. */
function heatColor(out: THREE.Color, heat: number): THREE.Color {
  if (heat <= 1) return out.copy(COLD).lerp(EMBER, Math.max(0, heat))
  return out.copy(EMBER).lerp(WHITE_HOT, Math.min(1, heat - 1))
}

/** Rotate an angle toward a target by at most `step` radians (shortest way). */
function turnToward(current: number, target: number, step: number): number {
  let d = target - current
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return current + Math.max(-step, Math.min(step, d))
}
