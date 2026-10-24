import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { SalamanderScaleItem } from '../../../items/materials/salamander_scale/SalamanderScaleItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { fadeMaterials } from '../../night/NightCreature.ts'
import { ignitePlayer } from '../../night/NightSenses.ts'
import { getBlock } from '../../../world/blocks/BlockRegistry.ts'

// Colours: charcoal hide cracked by molten fissures
const HIDE = 0x241d1a
const HIDE_LIGHT = 0x3a2e28
const RIDGE = 0x15110f
const CLAW = 0x0e0b0a
/** The fissures once the heat is gone (death). */
const CRACK_DEAD = 0x3b302a

const S = 0.0625 // 1 "pixel" = 1/16 block

// Combat
const MAX_HEALTH = 26
const BITE_DAMAGE = 5
const BITE_IGNITE_TICKS = 3
const DETECTION_RANGE = 12
/** Base chase speed (the dashes scale it up, the pauses stop it). */
const CHASE_SPEED = 4
const DASH_SPEED = 7.5
const DASH_TIME = 0.45
const PAUSE_MIN = 0.3
const PAUSE_MAX = 0.6
const BITE_TIME = 0.32

// Lava: it swims at the surface, a little slower
const LAVA_SPEED_FACTOR = 0.7
const LAVA_RISE_SPEED = 1.8

// Death: rolls over and its fire goes out
const DEATH_ROLL = 0.6
const DEATH_COOL = 1.2
const DEATH_FADE = 0.4

/** Pooled sparks drifting up off its back. */
const SPARK_COUNT = 10

interface Spark {
  readonly mesh: THREE.Mesh
  readonly velocity: THREE.Vector3
  life: number
  maxLife: number
  size: number
}

/** Lava block ids, looked up lazily from block properties. */
const lavaIds = new Map<number, boolean>()
function isLava(id: number): boolean {
  let lava = lavaIds.get(id)
  if (lava === undefined) {
    lava = id !== 0 && getBlock(id).properties.liquidFamily === 'lava'
    lavaIds.set(id, lava)
  }
  return lava
}

/**
 * Ember salamander - a long, low lizard of the magma chambers: charcoal hide
 * split by glowing molten fissures, a throat that smoulders when it breathes,
 * coal-bright eyes and a tail that never stops swishing. Lava is its home: it
 * swims at the surface of lava pools and fire never hurts it.
 *
 * It notices the player within 12 blocks and comes at them in quick
 * scuttling dashes (7.5 blocks/s for ~0.45 s, then a pause), and its bite
 * burns: 5 fire damage that sets the player alight. Struck, its fissures
 * flare. Killed, it rolls over and its fire goes out.
 *
 * Stats: 26 HP, 5 'fire' damage + burning (3 ticks), 1.7 block reach, 1.1 s
 * cooldown. Drops 1-2 salamander scales.
 */
export class EmberSalamanderEntity extends AggressiveEntity {
  readonly type = 'ember_salamander'

  private walkPhase = Math.random() * Math.PI * 2
  private idlePhase = Math.random() * Math.PI * 2
  private glowPhase = Math.random() * Math.PI * 2
  /** Glow boost from being hit (decays). */
  private flare = 0
  private biteTime = -1

  private dashing = true
  private dashTimer = Math.random() * DASH_TIME
  private inLava = false

  private player: THREE.Vector3 | null = null
  private damageCb: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private blockQuery: ((x: number, y: number, z: number) => number) | null = null

  private readonly knock = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly heat = new THREE.Color()

  // Mesh parts
  private body: THREE.Group | null = null
  private chest: THREE.Group | null = null
  private hips: THREE.Group | null = null
  private head: THREE.Group | null = null
  private jaw: THREE.Group | null = null
  private readonly tail: THREE.Group[] = []
  /** [front left, front right, hind left, hind right] */
  private readonly legs: THREE.Group[] = []
  private crackMaterial: THREE.MeshBasicMaterial | null = null
  private throatMaterial: THREE.MeshBasicMaterial | null = null
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private sparkMaterial: THREE.MeshBasicMaterial | null = null
  /** Everything that fades out at the end of its death. */
  private readonly fadeTargets: THREE.Material[] = []
  private readonly sparks: Spark[] = []
  private sparkTimer = 0

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('ember_salamander', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 0.55, 1.0),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: BITE_DAMAGE,
      attackRange: 1.7,
      attackCooldown: 1.1,
      detectionRange: DETECTION_RANGE,
      chaseSpeed: CHASE_SPEED,
      walkSpeed: 1.4,
      wanderMinInterval: 2,
      wanderMaxInterval: 6,
      knockbackHorizontal: 5,
      knockbackVertical: 3,
      knockbackStunTime: 0.3,
      attackKnockbackHorizontal: 3,
      attackKnockbackVertical: 2.5,
      drops: [{ createItem: () => new SalamanderScaleItem(), minCount: 1, maxCount: 2 }],
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

  setWorldQueryFns(blockQuery: (x: number, y: number, z: number) => number, _solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.blockQuery = blockQuery
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()

    const hide = new THREE.MeshLambertMaterial({ color: HIDE })
    const hideLight = new THREE.MeshLambertMaterial({ color: HIDE_LIGHT })
    const ridge = new THREE.MeshLambertMaterial({ color: RIDGE })
    const claw = new THREE.MeshLambertMaterial({ color: CLAW })
    for (const m of [hide, hideLight, ridge, claw]) this.registerMaterialForLighting(m)
    // Molten parts stay full-bright
    this.crackMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a14 })
    this.throatMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a2a })
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd060 })
    const crack = this.crackMaterial

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }
    const group = (x: number, y: number, z: number, parent: THREE.Object3D): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(x * S, y * S, z * S)
      parent.add(g)
      return g
    }

    // The body rides low: belly at y 2.5, back at y 6
    const body = group(0, 0, 0, root)
    this.body = body

    // Chest (front half): pivots at the waist, z 1
    const chest = group(0, 4.2, 1, body)
    this.chest = chest
    box(5.6, 3.6, 6.4, hide, 0, 0, 3, chest)
    box(4.6, 1.2, 6, hideLight, 0, -2, 3, chest) // belly plate
    box(1.2, 1, 5, ridge, 0, 2.2, 3, chest) // dorsal ridge
    for (const z of [1.2, 3.2, 5.2]) box(1.4, 1.3, 1.1, ridge, 0, 2.7, z, chest) // ridge spikes
    // Fissures: jagged molten seams over the back and flanks
    box(0.5, 0.35, 2.4, crack, -1.6, 1.85, 1.6, chest).rotation.y = 0.35
    box(0.5, 0.35, 2.2, crack, 1.4, 1.85, 3.6, chest).rotation.y = -0.45
    box(0.5, 0.35, 1.8, crack, -1.2, 1.85, 5.4, chest).rotation.y = 0.5
    box(0.35, 1.8, 0.5, crack, 2.85, 0.2, 2.2, chest).rotation.x = 0.4
    box(0.35, 1.8, 0.5, crack, -2.85, 0.1, 4.4, chest).rotation.x = -0.35

    // Head: a flat wedge on a short neck, pivoting at the neck (z 6.5)
    const head = group(0, 0.6, 6.5, chest)
    this.head = head
    box(4.4, 2.6, 2.4, hide, 0, 0, 0.8, head) // neck
    box(4.8, 2.4, 3.8, hide, 0, 0.4, 3.2, head) // skull
    box(3.6, 1.6, 2.4, hide, 0, 0.1, 6, head) // snout
    box(3.4, 0.6, 3, ridge, 0, 1.75, 3.6, head) // brow plate
    for (const side of [-1, 1]) {
      box(1.1, 0.9, 0.9, this.eyeMaterial, side * 2.15, 1.05, 3.9, head)
      box(0.3, 0.3, 0.3, claw, side * 1.2, 0.5, 7.25, head) // nostrils
    }
    box(0.4, 0.3, 2.6, crack, 0, 1.25, 5.6, head) // a seam along the snout
    // Throat: the glow it breathes through, under the jaw
    box(3, 0.6, 3.4, this.throatMaterial, 0, -1.25, 2.6, head)
    // Jaw: hinged under the skull, opens to bite
    const jaw = group(0, -0.9, 2.2, head)
    this.jaw = jaw
    box(3.4, 0.9, 4.8, hideLight, 0, -0.1, 2.4, jaw)
    box(2.6, 0.4, 3.6, this.throatMaterial, 0, 0.45, 2.5, jaw) // the molten mouth
    for (const x of [-1.2, 0, 1.2]) box(0.4, 0.5, 0.4, claw, x, 0.6, 4.4, jaw) // teeth

    // Hips (back half): pivots at the waist too
    const hips = group(0, 4.2, 1, body)
    this.hips = hips
    box(5.2, 3.3, 5.6, hide, 0, -0.1, -2.6, hips)
    box(4.2, 1.1, 5.2, hideLight, 0, -2, -2.6, hips)
    box(1.2, 1, 5, ridge, 0, 2, -2.6, hips)
    for (const z of [-1.2, -3.4]) box(1.3, 1.2, 1.1, ridge, 0, 2.5, z, hips)
    box(0.5, 0.35, 2.6, crack, 1.5, 1.7, -2, hips).rotation.y = 0.4
    box(0.5, 0.35, 2.2, crack, -1.3, 1.7, -3.8, hips).rotation.y = -0.3
    box(0.35, 1.6, 0.5, crack, -2.65, 0, -1.6, hips).rotation.x = 0.4
    box(0.35, 1.6, 0.5, crack, 2.65, -0.1, -3.4, hips).rotation.x = -0.4

    // Tail: three segments, each pivoting on the last, tapering to a point
    const tailSpec: ReadonlyArray<[number, number, number]> = [
      [3.6, 2.6, 5.5], // width, height, length
      [2.6, 2, 5],
      [1.6, 1.3, 4.5],
    ]
    let tailParent: THREE.Object3D = hips
    let tailZ = -5.4
    for (let i = 0; i < tailSpec.length; i++) {
      const [w, h, len] = tailSpec[i]
      const seg = group(0, i === 0 ? -0.2 : 0, tailZ, tailParent)
      box(w, h, len, hide, 0, 0, -len / 2, seg)
      box(Math.max(0.6, w * 0.3), 0.6, len * 0.8, ridge, 0, h / 2 + 0.2, -len / 2, seg)
      box(0.4, 0.3, len * 0.6, crack, (i % 2 === 0 ? 1 : -1) * w * 0.22, h / 2 + 0.05, -len * 0.5, seg).rotation.y = 0.3 * (i % 2 === 0 ? 1 : -1)
      this.tail.push(seg)
      tailParent = seg
      tailZ = -len
    }
    // A glowing tail tip
    box(0.9, 0.8, 1.2, crack, 0, 0, -4.9, this.tail[2])

    // Legs: splayed out to the sides, elbows up, clawed feet on the ground.
    // Each pivots at its shoulder/hip so it can sweep forward and back.
    const makeLeg = (parent: THREE.Group, side: number, z: number): THREE.Group => {
      const leg = group(side * 2.5, -0.6, z, parent)
      const upper = box(3, 1.4, 1.5, hide, side * 1.4, 0.3, 0, leg) // upper limb, out sideways
      upper.rotation.z = side * 0.25
      box(1.4, 3, 1.4, hideLight, side * 3.1, -1.5, 0.2, leg) // forearm down to the ground
      box(2.2, 0.7, 2.6, hide, side * 3.2, -3.3, 0.8, leg) // foot
      for (const t of [-0.7, 0, 0.7]) box(0.4, 0.4, 0.9, claw, side * 3.2 + t, -3.45, 2.3, leg)
      box(0.3, 1.4, 0.4, crack, side * 3.85, -1.4, 0.2, leg)
      this.legs.push(leg)
      return leg
    }
    makeLeg(chest, -1, 4.6) // front left
    makeLeg(chest, 1, 4.6) // front right
    makeLeg(hips, -1, -2.4) // hind left
    makeLeg(hips, 1, -2.4) // hind right

    // Spark pool: embers drifting up off the fissures
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffa040 })
    const sparkGeo = new THREE.BoxGeometry(S * 0.8, S * 0.8, S * 0.8)
    for (let i = 0; i < SPARK_COUNT; i++) {
      const mesh = new THREE.Mesh(sparkGeo, this.sparkMaterial)
      mesh.visible = false
      root.add(mesh)
      this.sparks.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 1, size: 1 })
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, chest, hips, head, jaw, ...this.tail, ...this.legs, ...this.sparks.map((s) => s.mesh)],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // The final (post-merge) body materials, for the death fade
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material as THREE.Material
      if (m !== this.sparkMaterial && !this.fadeTargets.includes(m)) this.fadeTargets.push(m)
    })
    this.applyGlow(0.9, 0.9)
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    this.glowPhase += deltaTime * 2.6
    this.idlePhase += deltaTime
    this.flare = Math.max(0, this.flare - deltaTime * 1.8)

    if (this._isDying) {
      this.updateDeath(deltaTime)
      this.updateSparks(deltaTime, 0.3)
      return
    }

    const stunned = this.knockbackTimer > 0
    super.update(deltaTime)
    const body = this.getPhysicsBody()
    if (!body) return

    // Scuttling dashes: bursts of speed with short pauses (the base chase
    // sets walking velocity each frame; reshape it here)
    if (this.isAggressive && !stunned) {
      this.dashTimer -= deltaTime
      if (this.dashTimer <= 0) {
        this.dashing = !this.dashing
        this.dashTimer = this.dashing ? DASH_TIME * (0.8 + Math.random() * 0.4) : PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN)
      }
      if (this.isWalking) {
        if (this.dashing) {
          body.velocity.x *= DASH_SPEED / CHASE_SPEED
          body.velocity.z *= DASH_SPEED / CHASE_SPEED
        } else {
          body.velocity.x = 0
          body.velocity.z = 0
          this.isWalking = false
        }
      }
    }

    this.updateLava(body)
    this.updateSparks(deltaTime, this.inLava ? 2 : this.isWalking && this.dashing ? 1.4 : 1)
  }

  /** Swim at the surface of lava: buoyed up, a little slower. */
  private updateLava(body: { velocity: THREE.Vector3; position: THREE.Vector3 }): void {
    const q = this.blockQuery
    if (!q) {
      this.inLava = false
      return
    }
    const p = body.position
    this.inLava = isLava(q(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)))
    if (!this.inLava) return
    const headUnder = isLava(q(Math.floor(p.x), Math.floor(p.y + 0.55), Math.floor(p.z)))
    body.velocity.y = headUnder ? LAVA_RISE_SPEED : Math.max(0, body.velocity.y)
    body.velocity.x *= LAVA_SPEED_FACTOR
    body.velocity.z *= LAVA_SPEED_FACTOR
  }

  /** A burning bite. */
  protected override performAttack(): void {
    this.biteTime = 0
    const p = this.player
    if (!p || !this.damageCb) return
    this.knock.copy(p).sub(this.position).setY(0)
    if (this.knock.lengthSq() > 0) this.knock.normalize()
    this.knock.multiplyScalar(this.attackKnockbackHorizontal)
    this.knock.y = this.attackKnockbackVertical
    if (this.damageCb(this.attackDamage, this.knock, 'fire') !== false) ignitePlayer(BITE_IGNITE_TICKS)
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
    const roll = Math.min(1, this.deathTimer / DEATH_ROLL)
    const e = 1 - (1 - roll) * (1 - roll)
    if (mesh) {
      // Rolls onto its back, legs curling in
      mesh.position.set(this.position.x, this.position.y + 0.25 * Math.sin(e * Math.PI), this.position.z)
      mesh.rotation.z = Math.PI * 0.92 * e
    }
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.z = (i % 2 === 0 ? 1 : -1) * 0.9 * e
    }
    // The fire goes out
    const cool = Math.min(1, this.deathTimer / DEATH_COOL)
    this.applyGlow(0.9 * (1 - cool), 1.1 * (1 - cool), cool)
    const end = DEATH_COOL + DEATH_FADE
    const fade = Math.max(0, (this.deathTimer - DEATH_COOL) / DEATH_FADE)
    if (fade > 0) fadeMaterials(this.fadeTargets, 1 - Math.min(1, fade))
    if (this.deathTimer >= end) this.kill()
  }

  protected updateAnimations(deltaTime: number): void {
    const moving = this.isWalking
    const fast = this.isAggressive && this.dashing
    if (moving) this.walkPhase += deltaTime * (fast ? 19 : 9)
    const phase = this.walkPhase

    // Lizard gait: diagonal legs together (front left with hind right)
    const swing = moving ? Math.sin(phase) : 0
    const lift = moving ? Math.max(0, Math.cos(phase)) : 0
    const lift2 = moving ? Math.max(0, -Math.cos(phase)) : 0
    const legSwing = [swing, -swing, -swing, swing]
    const legLift = [lift, lift2, lift2, lift]
    for (let i = 0; i < this.legs.length; i++) {
      const side = i % 2 === 0 ? -1 : 1
      this.legs[i].rotation.y = legSwing[i] * 0.55
      this.legs[i].rotation.z = side * -legLift[i] * 0.35
    }

    // S-curve: chest and hips counter-rotate, the tail whips behind
    const undulate = moving ? Math.sin(phase) * (fast ? 0.2 : 0.14) : 0
    if (this.chest) this.chest.rotation.y = undulate
    if (this.hips) this.hips.rotation.y = -undulate
    const idleSwish = Math.sin(this.idlePhase * 1.6) * 0.18
    for (let i = 0; i < this.tail.length; i++) {
      const lag = (i + 1) * 0.8
      this.tail[i].rotation.y = moving
        ? Math.sin(phase - lag) * (0.3 + i * 0.12)
        : idleSwish * (1 + i * 0.6) + Math.sin(this.idlePhase * 2.3 - lag) * 0.05
    }
    if (this.body) this.body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.02 : 0

    // Head: looks about, rears a little in a pause, snaps in a bite
    let headX = Math.sin(this.idlePhase * 0.7) * 0.06
    let headY = moving ? -undulate * 0.8 : Math.sin(this.idlePhase * 0.45) * 0.25
    let jawX = 0
    if (this.isAggressive && !this.dashing && !moving) headX = -0.22 // rears, throat glowing
    if (this.biteTime >= 0) {
      this.biteTime += deltaTime
      const t = Math.min(1, this.biteTime / BITE_TIME)
      // Rear back and gape, then lunge and snap shut
      const open = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55
      jawX = 0.75 * open
      headX = t < 0.45 ? -0.35 * (t / 0.45) : -0.35 + 0.6 * ((t - 0.45) / 0.55) * (1 - t) * 3
      headY = 0
      if (t >= 1) this.biteTime = -1
    }
    const k = Math.min(1, deltaTime * 16)
    if (this.head) {
      this.head.rotation.x += (headX - this.head.rotation.x) * (this.biteTime >= 0 ? 1 : k)
      this.head.rotation.y += (headY - this.head.rotation.y) * k
    }
    if (this.jaw) this.jaw.rotation.x = jawX

    // Fissures pulse slowly; dashing and lava stoke them, blows make them flare
    const pulse = 0.1 * Math.sin(this.glowPhase) + 0.05 * Math.sin(this.glowPhase * 2.9)
    const stoke = this.inLava ? 0.45 : fast && moving ? 0.15 : 0
    const crack = 0.85 + pulse + stoke + this.flare
    // The throat breathes: brightest in a pause and in a bite
    let throat = crack + 0.15 + 0.25 * Math.max(0, Math.sin(this.glowPhase * 0.8))
    if (this.isAggressive && !this.dashing) throat += 0.35
    if (this.biteTime >= 0) throat += 0.6
    this.applyGlow(crack, throat)
  }

  /**
   * Set the glow: 0 = cold, 1 = ember orange, 2 = white-hot yellow. `dead`
   * blends the fissures toward cold ash (death).
   */
  private applyGlow(crack: number, throat: number, dead: number = 0): void {
    if (this.crackMaterial) heatColor(this.crackMaterial.color, crack).lerp(this.heat.setHex(CRACK_DEAD), dead)
    if (this.throatMaterial) heatColor(this.throatMaterial.color, throat).lerp(this.heat.setHex(CRACK_DEAD), dead)
    if (this.eyeMaterial) heatColor(this.eyeMaterial.color, Math.max(crack, throat) + 0.4).lerp(this.heat.setHex(CRACK_DEAD), dead)
  }

  /** Embers drifting up off its back; `intensity` scales how often. */
  private updateSparks(deltaTime: number, intensity: number): void {
    this.sparkTimer -= deltaTime
    if (this.sparkTimer <= 0 && intensity > 0.05) {
      this.sparkTimer = (0.5 / intensity) * (0.6 + Math.random() * 0.8)
      // A point along its back (model space: +Z is forward)
      this.tmp.set((Math.random() - 0.5) * 0.12, 1.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.12)
      this.emitSpark((Math.random() - 0.5) * 0.18, 0.42, (Math.random() - 0.6) * 0.7, this.tmp, 0.7 + Math.random() * 0.6, 0.8 + Math.random() * 0.7)
    }
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue
      spark.life -= deltaTime
      if (spark.life <= 0) {
        spark.mesh.visible = false
        continue
      }
      spark.mesh.position.addScaledVector(spark.velocity, deltaTime)
      spark.mesh.scale.setScalar(spark.size * (spark.life / spark.maxLife))
    }
  }

  /** Launch a pooled spark from a point in model space (feet origin, facing +Z). */
  private emitSpark(x: number, y: number, z: number, velocity: THREE.Vector3, life: number, size: number): void {
    let spark = this.sparks[0]
    if (!spark) return
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
    spark.mesh.visible = true
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!handled) return false
    // Struck fissures flare; it pauses before the next dash
    this.flare = Math.min(1, this.flare + 0.8)
    this.dashing = false
    this.dashTimer = PAUSE_MIN
    return true
  }

  dispose(): void {
    this.body = null
    this.chest = null
    this.hips = null
    this.head = null
    this.jaw = null
    this.tail.length = 0
    this.legs.length = 0
    this.crackMaterial = null
    this.throatMaterial = null
    this.eyeMaterial = null
    this.sparkMaterial = null
    this.fadeTargets.length = 0
    this.sparks.length = 0
    this.player = null
    this.damageCb = null
    this.blockQuery = null
    super.dispose()
  }
}

const COLD = new THREE.Color(0x3a1408)
const EMBER = new THREE.Color(0xff5a14)
const WHITE_HOT = new THREE.Color(0xffe590)

/** Heat ramp: 0 cold coal, 1 ember orange, 2 white-hot. */
function heatColor(out: THREE.Color, heat: number): THREE.Color {
  if (heat <= 1) return out.copy(COLD).lerp(EMBER, Math.max(0, heat))
  return out.copy(EMBER).lerp(WHITE_HOT, Math.min(1, heat - 1))
}
