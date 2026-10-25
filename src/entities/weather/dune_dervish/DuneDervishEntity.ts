import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { createItemFromId } from '../../../persistence/ItemRegistry.ts'
import { playSound } from '../../../audio/SoundHooks.ts'
import { fadeMaterials } from '../../night/NightCreature.ts'
import { WeatherRetreat } from '../WeatherCreature.ts'

// Palette: sun-baked sand, darker grit, pale dust; the polished slate core
const SAND = 0xd6b880
const SAND_DARK = 0xb39158
const SAND_PALE = 0xe9d6a8
const GRIT = 0x9c7f52
const CORE = 0x3f4c60
const CORE_FACET = 0x6c84a4
const EYE = new THREE.Color(0xffb02e)
const EYE_HOT = new THREE.Color(0xfff2b8)

/** The weathers it comes with (WeatherCatalog ids). */
const DERVISH_WEATHERS: ReadonlySet<string> = new Set(['sandstorm', 'dust_devils'])

const MAX_HEALTH = 34
/** It turns on a player this close (blocks). */
const NOTICE_RANGE = 14
/** It gives up on a player this far away (after AGGRO_TIMEOUT). */
const LOSE_RANGE = 28
const AGGRO_TIMEOUT = 6
const WANDER_SPEED = 2.6
const CIRCLE_SPEED = 3.6
const CIRCLE_RADIUS = 6
/** The telegraph: it stops, tightens and spins up, eyes flaring white. */
const WINDUP_TIME = 0.4
const RUSH_SPEED = 8
const RUSH_MAX_TIME = 2.4
/** How fast the rush can turn (rad/s): it curves in, never snaps. */
const RUSH_TURN = 3.2
const RUSH_COOLDOWN: readonly [number, number] = [1.2, 2.2]
/** Contact: within this horizontal reach, the player's feet no more than LIFT_HEIGHT above its base. */
const CONTACT_REACH = 1.15
const LIFT_HEIGHT = 2.4
const LIFT_DAMAGE = 5
/** The player is thrown upward this hard (blocks/s) and pushed away this hard. */
const LIFT_UP = 9
const LIFT_PUSH = 4
const SPIN_AWAY_TIME = 0.7
const SPIN_AWAY_SPEED = 6
/** After every rush it slows, the sand thinning to show its core: full damage then. */
const SLOW_TIME = 2
const SLOW_SPEED = 0.6
/** Share of a blow that lands while it spins fast (the sand turns it aside). */
const BLOCKED_SHARE = 0.25
const EXIT_DURATION = 2.0
const DEATH_DURATION = 1.5

// Model
const RING_COUNT = 11
const RING_SPACING = 0.25
const RING_BASE = 0.14
const CORE_Y = 1.25
const EYE_Y = 1.95
const GRAIN_COUNT = 12
/** The dust funnel inside the chips: two translucent cones (inner, outer). */
const HAZE_OPACITY: readonly [number, number] = [0.34, 0.16]

type DervishState = 'wander' | 'circle' | 'windup' | 'rush' | 'spinaway' | 'slow'

interface Ring {
  readonly group: THREE.Group
  /** Two thirds of the chips: hidden when the sand thins. */
  readonly dense: THREE.Group
  readonly baseY: number
  /** Spin speed at full spin (rad/s): the base whirls fastest. */
  readonly speed: number
  angle: number
}

interface Grain {
  readonly mesh: THREE.Mesh
  angle: number
  height: number
  out: number
  speed: number
}

/** Funnel radius of ring i: narrow at the base, fraying wide at the top. */
function ringRadius(i: number): number {
  return 0.3 + 0.55 * Math.pow(i / (RING_COUNT - 1), 1.4)
}

/**
 * Dune Dervish - a weather creature of desert sandstorms and dust devils: a
 * whirling column of sand three blocks tall, stacked rings of sand chips each
 * spinning at its own speed and fraying wide at the top, a polished slate
 * stone (a whirlstone) tumbling inside it and two amber eyes glowing in the
 * sand.
 *
 * It wanders erratically until a player comes within 14 blocks, then circles
 * them and rushes in on a curving path at 8 blocks/s after a short telegraph
 * (it stops, tightens, spins up, its eyes flare white). Caught, the player is
 * lifted and flung (5 damage, thrown up hard) as it spins away. While it
 * spins fast the sand turns blows aside (25 % damage, shield sound); after
 * every rush it slows for 2 s, the sand thinning to show the stone - full
 * damage then. When the sandstorm passes it slows and collapses into a pile
 * of falling sand.
 *
 * Stats: 34 HP, 5 damage + lift, 14 block notice range. Drops: 1 whirlstone.
 */
export class DuneDervishEntity extends AggressiveEntity {
  readonly type = 'dune_dervish'
  /** The player's latest hit was turned aside by the whirling sand (IEntity; shield sound). */
  lastHitBlocked = false

  private readonly retreat = new WeatherRetreat(DERVISH_WEATHERS, EXIT_DURATION)

  private action: DervishState = 'wander'
  private stateTime = 0
  private facing = Math.random() * Math.PI * 2
  private heading = this.facing
  private wanderTimer = 0
  private wanderSpeed = WANDER_SPEED
  private circleSign = Math.random() < 0.5 ? -1 : 1
  private rushCooldown = 0.8
  private rushCurve = 0
  private time = Math.random() * 10
  private spin = 1
  private thin = 0
  private flare = 0
  private blockedTime = 0
  private exitSoundPlayed = false

  private readonly lastPos = new THREE.Vector3()
  private readonly knock = new THREE.Vector3()
  private readonly soundPos = new THREE.Vector3()
  private readonly eyeColor = new THREE.Color()

  private playerRef: THREE.Vector3 | null = null
  private damageFn: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null

  // Model parts
  private column: THREE.Group | null = null
  private readonly rings: Ring[] = []
  private skirt: THREE.Group | null = null
  private pile: THREE.Group | null = null
  private core: THREE.Group | null = null
  private glint: THREE.Mesh | null = null
  private face: THREE.Group | null = null
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private readonly haze: Array<{ mesh: THREE.Mesh; material: THREE.MeshLambertMaterial; base: number }> = []
  /** Each fade target's own opacity (the haze is translucent to begin with). */
  private readonly baseOpacity = new Map<THREE.Material, number>()
  private readonly grains: Grain[] = []
  /** Every material, for the collapse fade (collected after merging). */
  private readonly fadeTargets: THREE.Material[] = []

  constructor(config: { position: THREE.Vector3 }) {
    super('dune_dervish', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 2.5, 0.9),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: LIFT_DAMAGE,
      attackRange: CONTACT_REACH,
      attackCooldown: 1,
      detectionRange: NOTICE_RANGE,
      chaseSpeed: CIRCLE_SPEED,
      walkSpeed: WANDER_SPEED,
      knockbackHorizontal: 3,
      knockbackVertical: 2,
      knockbackStunTime: 0.3,
      attackKnockbackHorizontal: LIFT_PUSH,
      attackKnockbackVertical: LIFT_UP,
      aggroTimeout: AGGRO_TIMEOUT,
      drops: [{ createItem: () => createItemFromId('whirlstone') as IItem, minCount: 1, maxCount: 1 }],
    })
  }

  // ---- wiring (EntityManager duck typing) ------------------------------------

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.playerRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void): void {
    super.setPlayerDamageCallback(callback)
    this.damageFn = callback
  }

  // ---- model -----------------------------------------------------------------

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const column = new THREE.Group()
    root.add(column)
    this.column = column

    const sand = [SAND, SAND, SAND_DARK, SAND_PALE, GRIT].map((color) => new THREE.MeshLambertMaterial({ color }))
    const coreMaterial = new THREE.MeshLambertMaterial({ color: CORE })
    const facetMaterial = new THREE.MeshLambertMaterial({ color: CORE_FACET })
    for (const m of [...sand, coreMaterial, facetMaterial]) this.registerMaterialForLighting(m)
    const pickSand = (): THREE.Material => sand[Math.floor(Math.random() * sand.length)]

    const chip = (w: number, h: number, d: number, m: THREE.Material, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // The funnel: rings of sand chips laid along their circle, a few long
    // streaks among them, every ring a little ragged
    for (let i = 0; i < RING_COUNT; i++) {
      const group = new THREE.Group()
      const baseY = RING_BASE + i * RING_SPACING
      group.position.y = baseY
      column.add(group)
      const dense = new THREE.Group()
      const thin = new THREE.Group()
      group.add(dense, thin)
      const radius = ringRadius(i)
      const count = Math.round(12 + 10 * (i / (RING_COUNT - 1)))
      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + Math.random() * 0.35
        const r = radius + (Math.random() - 0.5) * 0.12
        const streak = Math.random() < 0.4
        const mesh = streak
          ? chip(0.2 + Math.random() * 0.14, 0.035, 0.04, pickSand(), k % 3 === 0 ? thin : dense)
          : chip(0.07 + Math.random() * 0.06, 0.05 + Math.random() * 0.05, 0.05 + Math.random() * 0.04, pickSand(), k % 3 === 0 ? thin : dense)
        mesh.position.set(Math.sin(angle) * r, (Math.random() - 0.5) * 0.16, Math.cos(angle) * r)
        // Lie along the circle (local x is the tangent), tilted a little
        mesh.rotation.set(0, angle, (Math.random() - 0.5) * 0.6)
      }
      this.rings.push({ group, dense, baseY, speed: 7 - i * 0.45, angle: Math.random() * Math.PI * 2 })
    }

    // Kicked-up sand skirting the base
    const skirt = new THREE.Group()
    skirt.position.y = 0.05
    column.add(skirt)
    this.skirt = skirt
    for (let k = 0; k < 14; k++) {
      const angle = (k / 14) * Math.PI * 2 + Math.random() * 0.3
      const r = 0.55 + Math.random() * 0.5
      const mesh = chip(0.18 + Math.random() * 0.14, 0.05, 0.1, pickSand(), skirt)
      mesh.position.set(Math.sin(angle) * r, Math.random() * 0.08, Math.cos(angle) * r)
      mesh.rotation.set(0, angle, (Math.random() - 0.5) * 0.3)
    }

    // The heap it leaves when it collapses (hidden until then)
    const pile = new THREE.Group()
    pile.visible = false
    root.add(pile)
    this.pile = pile
    for (let k = 0; k < 18; k++) {
      const angle = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 0.85
      const h = 0.12 + (1 - r / 0.85) * 0.32 + Math.random() * 0.06
      const mesh = chip(0.32 + Math.random() * 0.2, h, 0.32 + Math.random() * 0.2, pickSand(), pile)
      mesh.position.set(Math.sin(angle) * r, h / 2, Math.cos(angle) * r)
      mesh.rotation.y = Math.random() * Math.PI
    }

    // The whirlstone: a polished slate gem tumbling inside, a glint on one corner
    const core = new THREE.Group()
    core.position.y = CORE_Y
    column.add(core)
    this.core = core
    const gem = chip(0.26, 0.26, 0.26, coreMaterial, core)
    gem.rotation.set(Math.PI / 4, Math.PI / 4, 0)
    const facetA = chip(0.18, 0.2, 0.3, facetMaterial, core)
    facetA.rotation.set(0.3, 0.9, 0.2)
    const facetB = chip(0.3, 0.14, 0.16, coreMaterial, core)
    facetB.rotation.set(-0.5, 0.2, 0.6)
    this.glint = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    this.glint.position.set(0.11, 0.13, 0.12)
    core.add(this.glint)

    // Eyes glaring out of the sand (+Z is forward), under a brow of grit
    const face = new THREE.Group()
    face.position.y = EYE_Y
    column.add(face)
    this.face = face
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE })
    for (const side of [-1, 1]) {
      const eye = chip(0.15, 0.075, 0.05, this.eyeMaterial, face)
      eye.position.set(side * 0.15, 0, 0.66)
      eye.rotation.set(0, side * -0.22, side * 0.28)
      const brow = chip(0.2, 0.06, 0.08, sand[2], face)
      brow.position.set(side * 0.15, 0.08, 0.67)
      brow.rotation.set(0, side * -0.22, side * 0.42)
    }

    // The dust funnel: translucent octagonal cones turning inside the chips
    // (left out of merging: transparent)
    for (const [index, scale] of [[0, 1], [1, 1.14]] as const) {
      const material = new THREE.MeshLambertMaterial({
        color: index === 0 ? SAND : SAND_PALE,
        transparent: true,
        opacity: HAZE_OPACITY[index],
        depthWrite: false,
        side: index === 0 ? THREE.DoubleSide : THREE.FrontSide,
      })
      this.registerMaterialForLighting(material)
      const top = ringRadius(RING_COUNT - 1) * 0.92 * scale
      const height = RING_SPACING * (RING_COUNT - 1) + 0.2
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, 0.26 * scale, height, 8, 1, true), material)
      mesh.position.y = RING_BASE + height / 2 - 0.1
      column.add(mesh)
      this.haze.push({ mesh, material, base: HAZE_OPACITY[index] })
    }

    // Loose grains spiralling up and out of the funnel
    const grainGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05)
    for (let k = 0; k < GRAIN_COUNT; k++) {
      const mesh = new THREE.Mesh(grainGeo, k % 2 === 0 ? sand[0] : sand[3])
      column.add(mesh)
      this.grains.push({ mesh, angle: Math.random() * Math.PI * 2, height: Math.random() * 3, out: Math.random() * 0.3, speed: 4 + Math.random() * 3 })
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [
        root, column, skirt, pile, core, this.glint, face, ...this.haze.map((h) => h.mesh),
        ...this.rings.flatMap((r) => [r.group, r.dense, r.group.children[1]]),
        ...this.grains.map((g) => g.mesh),
      ],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material as THREE.Material
      if (!this.fadeTargets.includes(m)) {
        this.fadeTargets.push(m)
        this.baseOpacity.set(m, m.transparent ? m.opacity : 1)
      }
    })
    this.animate(0)
    return root
  }

  // ---- behaviour -------------------------------------------------------------

  override update(deltaTime: number): void {
    this.time += deltaTime
    this.flare = Math.max(0, this.flare - deltaTime * 3)
    this.rushCooldown = Math.max(0, this.rushCooldown - deltaTime)

    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    const exit = this.retreat.update(deltaTime, this.position.x, this.position.y, this.position.z)
    if (exit > 0) {
      if (!this.exitSoundPlayed) {
        this.exitSoundPlayed = true
        playSound('night.vanish', this.midPosition())
      }
      this.holdStill()
      this.syncFromBody()
      this.collapse(deltaTime, exit)
      this.syncMesh()
      if (exit >= 1) this.kill()
      return
    }

    // Hit-stun (only while slowed - fast-spinning it shrugs blows off)
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      this.syncFromBody()
      this.animate(deltaTime)
      this.syncMesh()
      return
    }

    const player = this.playerRef
    const dist = player ? this.horizontalDistance(player) : Infinity
    if (player && dist <= NOTICE_RANGE && Math.abs(player.y - this.position.y) < 6) {
      this.isAggressive = true
      this.aggressiveTimer = this.aggroTimeout
    } else if (this.isAggressive && dist > LOSE_RANGE) {
      this.aggressiveTimer -= deltaTime
      if (this.aggressiveTimer <= 0 && (this.action === 'circle' || this.action === 'slow')) {
        this.isAggressive = false
        this.setAction('wander')
      }
    }

    this.stateTime += deltaTime
    switch (this.action) {
      case 'wander':
        if (this.isAggressive) this.setAction('circle')
        else this.wander(deltaTime)
        break
      case 'circle':
        this.circle(deltaTime, dist)
        break
      case 'windup':
        this.holdStill()
        if (player) this.turnToward(Math.atan2(player.x - this.position.x, player.z - this.position.z), deltaTime, 8)
        if (this.stateTime >= WINDUP_TIME) this.startRush()
        break
      case 'rush':
        this.rush(deltaTime, dist)
        break
      case 'spinaway':
        this.move(this.heading, SPIN_AWAY_SPEED, deltaTime)
        if (this.stateTime >= SPIN_AWAY_TIME) this.setAction('slow')
        break
      case 'slow':
        this.move(this.heading, SLOW_SPEED, deltaTime)
        if (this.stateTime >= SLOW_TIME) {
          this.rushCooldown = RUSH_COOLDOWN[0] + Math.random() * (RUSH_COOLDOWN[1] - RUSH_COOLDOWN[0])
          this.setAction(this.isAggressive ? 'circle' : 'wander')
        }
        break
    }

    this.syncFromBody()
    this.animate(deltaTime)
    this.syncMesh()
  }

  /** Erratic wandering: a new heading and speed every half second or so. */
  private wander(deltaTime: number): void {
    this.wanderTimer -= deltaTime
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 0.5 + Math.random() * 0.9
      this.heading += (Math.random() - 0.5) * 3.2
      this.wanderSpeed = WANDER_SPEED * (0.5 + Math.random() * 0.7)
    }
    this.turnToward(this.heading, deltaTime, 4)
    this.move(this.facing, this.wanderSpeed, deltaTime)
  }

  /** Circle the player at about CIRCLE_RADIUS, weaving; rush once rested. */
  private circle(deltaTime: number, dist: number): void {
    const player = this.playerRef
    const body = this.getPhysicsBody()
    if (!player || !body) return
    if (this.rushCooldown <= 0 && dist <= NOTICE_RANGE && body.isOnGround) {
      this.setAction('windup')
      this.holdStill()
      playSound('magic.windup', this.midPosition())
      return
    }
    const toPlayer = Math.atan2(player.x - this.position.x, player.z - this.position.z)
    // Tangent around the player, bent in or out toward the circling radius
    const radial = THREE.MathUtils.clamp((dist - CIRCLE_RADIUS) / 4, -1, 1)
    const weave = Math.sin(this.time * 1.7) * 0.5
    const desired = toPlayer + this.circleSign * (Math.PI / 2 - radial * 1.1) + weave
    if (Math.random() < deltaTime * 0.15) this.circleSign = -this.circleSign
    this.turnToward(desired, deltaTime, 5)
    this.move(this.facing, CIRCLE_SPEED, deltaTime)
  }

  private startRush(): void {
    this.setAction('rush')
    this.rushCurve = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.45)
    this.blockedTime = 0
    this.lastPos.copy(this.position)
    playSound('night.rumble', this.midPosition())
  }

  /** Curve in on the player at speed; lift them on contact. */
  private rush(deltaTime: number, dist: number): void {
    const player = this.playerRef
    if (!player) {
      this.setAction('slow')
      return
    }
    const toPlayer = Math.atan2(player.x - this.position.x, player.z - this.position.z)
    // The curve straightens as it closes in
    const target = toPlayer + this.rushCurve * THREE.MathUtils.clamp(dist / 10, 0, 1)
    this.turnToward(target, deltaTime, RUSH_TURN)
    this.move(this.facing, RUSH_SPEED, deltaTime)

    const dy = player.y - this.position.y
    if (dist <= CONTACT_REACH && dy > -1 && dy < LIFT_HEIGHT) {
      this.lift(player)
      return
    }
    // Overshot (the player is behind it), ran out of steam, or hit a wall
    const behind = Math.cos(toPlayer - this.facing) < -0.3 && dist > 2.5
    const moved = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z)
    this.blockedTime = moved < RUSH_SPEED * deltaTime * 0.2 && this.stateTime > 0.15 ? this.blockedTime + deltaTime : 0
    this.lastPos.copy(this.position)
    if (behind || this.stateTime >= RUSH_MAX_TIME || this.blockedTime > 0.25) {
      this.heading = this.facing
      this.setAction('slow')
    }
  }

  /** Caught: thrown up and away, and it spins off. */
  private lift(player: THREE.Vector3): void {
    this.knock.set(player.x - this.position.x, 0, player.z - this.position.z)
    if (this.knock.lengthSq() < 1e-6) this.knock.set(Math.sin(this.facing), 0, Math.cos(this.facing))
    this.knock.normalize().multiplyScalar(LIFT_PUSH)
    this.knock.y = LIFT_UP
    this.damageFn?.(LIFT_DAMAGE, this.knock, 'melee')
    playSound('night.erupt', this.midPosition())
    this.heading = Math.atan2(this.position.x - player.x, this.position.z - player.z) + (Math.random() - 0.5) * 0.8
    this.setAction('spinaway')
  }

  /** The base chase never runs: contact during a rush deals the damage. */
  protected override performAttack(): void {}

  private setAction(action: DervishState): void {
    this.action = action
    this.stateTime = 0
  }

  /** Walk along a heading, hopping up 1-block steps it bumps into. */
  private move(heading: number, speed: number, deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (!body) return
    body.velocity.x = Math.sin(heading) * speed
    body.velocity.z = Math.cos(heading) * speed
    this.isWalking = speed > 0.1
    if (this.action === 'rush') return
    const moved = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z)
    this.blockedTime = moved < speed * deltaTime * 0.2 ? this.blockedTime + deltaTime : 0
    this.lastPos.copy(this.position)
    if (this.blockedTime > 0.3 && body.isOnGround) {
      body.velocity.y = this.jumpVelocity
      this.blockedTime = 0
      // Wandering into a wall: veer off
      if (this.action === 'wander') this.heading += Math.PI * (0.5 + Math.random())
    }
  }

  private holdStill(): void {
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
    }
    this.isWalking = false
  }

  private turnToward(desired: number, deltaTime: number, rate: number): void {
    const delta = Math.atan2(Math.sin(desired - this.facing), Math.cos(desired - this.facing))
    const step = rate * deltaTime
    this.facing += THREE.MathUtils.clamp(delta, -step, step)
  }

  private horizontalDistance(target: THREE.Vector3): number {
    return Math.hypot(target.x - this.position.x, target.z - this.position.z)
  }

  private syncFromBody(): void {
    const body = this.getPhysicsBody()
    if (body) this.position.copy(body.position)
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (!mesh) return
    mesh.position.copy(this.position)
    mesh.rotation.y = this.facing
  }

  /** The middle of the column, for positional sounds (reused vector). */
  private midPosition(): THREE.Vector3 {
    return this.soundPos.set(this.position.x, this.position.y + 1.3, this.position.z)
  }

  // ---- animation -------------------------------------------------------------

  protected updateAnimations(deltaTime: number): void {
    this.animate(deltaTime)
  }

  /** Spin the rings, tumble the stone, swirl the grains; thin out when slowed. */
  private animate(deltaTime: number): void {
    const windup = this.action === 'windup' ? Math.min(1, this.stateTime / WINDUP_TIME) : 0
    const spinTarget = this.action === 'slow' ? 0.3
      : this.action === 'windup' ? 1.9
        : this.action === 'rush' ? 1.5
          : this.action === 'spinaway' ? 1.4
            : this.action === 'circle' ? 1.1 : 1
    this.spin += (spinTarget - this.spin) * Math.min(1, deltaTime * 3)
    this.thin += ((this.action === 'slow' ? 1 : 0) - this.thin) * Math.min(1, deltaTime * 5)
    const t = this.time

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i]
      ring.angle += deltaTime * this.spin * ring.speed
      const g = ring.group
      g.rotation.y = ring.angle
      g.position.y = ring.baseY
      // The funnel's axis wavers; the top frays wider
      const sway = 0.06 * (0.4 + i / (RING_COUNT - 1))
      g.position.x = Math.sin(t * 2.3 + i * 0.7) * sway
      g.position.z = Math.cos(t * 1.9 + i * 0.9) * sway
      const fray = i >= RING_COUNT - 3 ? 0.08 * Math.sin(t * 4 + i * 1.3) : 0
      const s = 1 + fray + this.thin * 0.15 - windup * 0.15
      g.scale.set(s, 1, s)
      ring.dense.visible = this.thin < 0.5
    }
    if (this.skirt) {
      this.skirt.rotation.y += deltaTime * this.spin * 9
      this.skirt.visible = true
    }
    // The dust thins with the chips when it slows; the cones turn against each other
    for (let i = 0; i < this.haze.length; i++) {
      const h = this.haze[i]
      h.mesh.rotation.y += deltaTime * this.spin * (i === 0 ? 3.5 : -2.2)
      h.material.opacity = h.base * (1 - 0.6 * this.thin)
      const s = 1 - windup * 0.12
      h.mesh.scale.set(s, 1, s)
    }

    // The stone tumbles; its glint flashes now and then (often when exposed)
    if (this.core) {
      this.core.rotation.y += deltaTime * (0.8 + this.spin * 1.4)
      this.core.rotation.x = Math.sin(t * 1.1) * 0.45
      this.core.position.y = CORE_Y + Math.sin(t * 2) * 0.06
    }
    if (this.glint) {
      const period = this.thin > 0.5 ? 0.7 : 1.7
      const phase = (t % period) / period
      this.glint.scale.setScalar(Math.max(0.05, 1 - Math.abs(phase - 0.1) * 9))
    }

    // Lean into the motion
    if (this.column) {
      const lean = this.action === 'rush' ? 0.28 : this.action === 'spinaway' ? 0.2 : this.isWalking ? 0.08 : 0
      this.column.rotation.x += (lean - this.column.rotation.x) * Math.min(1, deltaTime * 6)
      this.column.rotation.z = Math.sin(t * 1.3) * 0.04
    }

    // Eyes: amber, flaring white in the telegraph and when struck
    if (this.eyeMaterial) {
      const heat = Math.min(1, windup + this.flare * 0.7)
      this.eyeMaterial.color.copy(this.eyeColor.copy(EYE).lerp(EYE_HOT, heat))
    }

    for (const grain of this.grains) {
      grain.angle += deltaTime * this.spin * grain.speed
      grain.height += deltaTime * (0.5 + 0.8 * this.spin)
      if (grain.height > 3.1) {
        grain.height = 0
        grain.out = Math.random() * 0.3
      }
      const r = 0.35 + grain.height * 0.25 + grain.out
      grain.mesh.position.set(Math.sin(grain.angle) * r, grain.height, Math.cos(grain.angle) * r)
      grain.mesh.visible = true
    }
  }

  /**
   * The whirl dies: the spin runs down, the rings slump and spread into a
   * heap, the stone drops into it and the grains rain down; then it fades.
   * `progress` 0 → 1.
   */
  private collapse(deltaTime: number, progress: number): void {
    const ease = 1 - (1 - progress) * (1 - progress)
    this.spin = Math.max(0, 1 - progress * 1.4)
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i]
      ring.angle += deltaTime * this.spin * ring.speed
      const g = ring.group
      g.rotation.y = ring.angle
      g.position.set(g.position.x * (1 - ease), ring.baseY + (0.06 + i * 0.03 - ring.baseY) * ease, g.position.z * (1 - ease))
      const s = 1 + 0.5 * ease
      g.scale.set(s, 1 - 0.5 * ease, s)
      ring.dense.visible = true
    }
    if (this.skirt) this.skirt.rotation.y += deltaTime * this.spin * 9
    if (this.pile) {
      this.pile.visible = progress > 0.15
      const p = Math.min(1, (progress - 0.15) / 0.5)
      this.pile.scale.set(0.6 + 0.4 * p, Math.max(0.01, p), 0.6 + 0.4 * p)
    }
    if (this.core) this.core.position.y = CORE_Y + (0.2 - CORE_Y) * ease
    if (this.face) {
      this.face.position.y = EYE_Y + (0.3 - EYE_Y) * ease
      this.face.scale.setScalar(Math.max(0.01, 1 - ease))
    }
    for (const h of this.haze) {
      h.mesh.scale.set(1 + 0.4 * ease, Math.max(0.01, 1 - 0.85 * ease), 1 + 0.4 * ease)
      h.mesh.position.y = (RING_BASE + (RING_SPACING * (RING_COUNT - 1) + 0.2) / 2 - 0.1) * (1 - 0.85 * ease)
    }
    if (this.column) this.column.rotation.x *= 1 - Math.min(1, deltaTime * 6)
    if (this.eyeMaterial) this.eyeMaterial.color.copy(this.eyeColor.copy(EYE).multiplyScalar(Math.max(0, 1 - progress * 2.5)))
    for (const grain of this.grains) {
      grain.height = Math.max(0.05, grain.height - deltaTime * (1.5 + grain.speed * 0.4))
      grain.angle += deltaTime * this.spin * grain.speed
      const r = 0.35 + grain.height * 0.25 + grain.out + ease * 0.3
      grain.mesh.position.set(Math.sin(grain.angle) * r, grain.height, Math.cos(grain.angle) * r)
    }
    const fade = progress > 0.55 ? Math.max(0, 1 - (progress - 0.55) / 0.45) : 1
    if (fade < 1) fadeMaterials(this.fadeTargets, fade, this.baseOpacity)
    // The dust settles from the start (after the fade, which would restore it)
    for (const h of this.haze) h.material.opacity = h.base * (1 - ease) * fade
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    this.holdStill()
    this.syncFromBody()
    const progress = Math.min(1, this.deathTimer / DEATH_DURATION)
    this.collapse(deltaTime, progress)
    this.syncMesh()
    if (progress >= 1) this.kill()
  }

  // ---- damage ----------------------------------------------------------------

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (this.retreat.leaving) return false
    return super.canPlayerInteract(playerPosition, maxDistance)
  }

  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying || this.retreat.leaving) return false
    let damage = getPlayerAttackDamage(heldItem)
    const knockback = getPlayerAttackKnockback(heldItem)
    // Spinning fast, the sand turns the blow aside; slowed, the stone is bare
    this.lastHitBlocked = this.action !== 'slow'
    if (this.lastHitBlocked) damage *= BLOCKED_SHARE
    this.health -= damage
    this.flare = 1

    const dx = this.position.x - playerPosition.x
    const dz = this.position.z - playerPosition.z
    const d = Math.hypot(dx, dz)
    const body = this.getPhysicsBody()
    if (body && d > 1e-3 && this.action !== 'rush') {
      const push = this.lastHitBlocked ? 0.3 : 1
      body.velocity.x = (dx / d) * this.knockbackHorizontal * knockback * push
      body.velocity.z = (dz / d) * this.knockbackHorizontal * knockback * push
      if (!this.lastHitBlocked) body.velocity.y = this.knockbackVertical * Math.min(1, knockback)
    }

    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.isAggressive = false
      this.holdStill()
    } else {
      if (!this.lastHitBlocked) this.knockbackTimer = this.knockbackStunTime * Math.min(1, knockback)
      if (!this.isAggressive) {
        this.isAggressive = true
        this.setAction('circle')
      }
      this.aggressiveTimer = this.aggroTimeout
    }
    return true
  }

  /** Drops resolve by item id; nothing if the item isn't registered. */
  getDrops(): IItem[] {
    return super.getDrops().filter((item): item is IItem => item != null)
  }

  dispose(): void {
    this.column = null
    this.rings.length = 0
    this.skirt = null
    this.pile = null
    this.core = null
    this.glint = null
    this.face = null
    this.eyeMaterial = null
    this.haze.length = 0
    this.baseOpacity.clear()
    this.grains.length = 0
    this.fadeTargets.length = 0
    this.playerRef = null
    this.damageFn = null
    super.dispose()
  }
}
