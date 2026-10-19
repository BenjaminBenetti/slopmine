import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { MantisScytheItem } from '../../../items/materials/mantis_scythe/MantisScytheItem.ts'
import { HerbItem } from '../../../items/materials/herb/HerbItem.ts'
import { DawnRetreat, fadeMaterials } from '../NightCreature.ts'
import { playEntitySound, playSound } from '../../../audio/SoundHooks.ts'

/** Behaviour states. */
type MantisState =
  /** Folded into a flowering bush: no movement, no turning */
  | 'hidden'
  /** Opening up out of the disguise */
  | 'unfold'
  /** Hop-lunging toward the player */
  | 'stalk'
  /** Telegraph: rears up, scythes raised and opened */
  | 'windup'
  /** The double slash */
  | 'slash'
  /** Hopping back out of reach after a combo */
  | 'evade'
  /** Circling the player until the next combo */
  | 'circle'
  /** Folding back into the disguise */
  | 'fold'

// Combat
const MAX_HEALTH = 28
const SLASH_DAMAGE = 4
const SLASH_KNOCKBACK_H = 3
const SLASH_KNOCKBACK_V = 2.5
/** Horizontal reach of a slash, from the mantis' feet to the player's. */
const REACH = 2.3
const COMBO_COOLDOWN = 2.2
/** Player this close (or a hit) springs the ambush. */
const AMBUSH_RANGE = 6
/** Player further than this: fold back into the disguise. */
const LOSE_RANGE = 20

// Timing (seconds)
const UNFOLD_TIME = 0.4
const FOLD_TIME = 0.6
const WINDUP_TIME = 0.4
/** The two slashes connect this far into the slash state (0.25 s apart). */
const SLASH_HITS: readonly [number, number] = [0.08, 0.33]
/** Each swing takes this long from raised to down through the target. */
const SWING_TIME = 0.09
const SLASH_TIME = 0.6
const HOP_PAUSE = 0.18
const CIRCLE_HOP_PAUSE = 0.32
const HIT_STUN = 0.3

// Movement (blocks/s)
const HOP_SPEED = 7
/** Clears a 1-block step (peak ≈ 1.14 blocks, ≈ 0.57 s in the air). */
const HOP_VY = 8
const EVADE_SPEED = 6.5
const EVADE_VY = 7
const CIRCLE_SPEED = 4
const CIRCLE_VY = 5.5
const CIRCLE_RADIUS = 3.6
const TURN_RATE = 10 // rad/s
const HIT_PUSH = 5
const HIT_LIFT = 3.5

// Death: topple and fade
const DEATH_FALL = 0.5
const DEATH_LINGER = 0.9

// Colours: pale pink-white chitin, orchid petals, green stalk legs
const BODY = 0xf3d6e2
const BODY_SHADE = 0xe2b6c8
const PETAL = 0xf7bcd6
const PETAL_TIP = 0xffe6f0
const MAGENTA = 0xcf4597
const BLADE = 0xf1c4d7
const BLADE_EDGE = 0x8e2a62
const STALK = 0x6a9c3c
const STALK_DARK = 0x46702a
const EYE = 0x1a3322
const EYE_GLINT = 0x6fdc8f
const THROAT = 0xf4cf4e

/** 1 "pixel" = 1/16 block, the whole model scaled up a fifth: a mantis nearly two blocks tall. */
const S = 0.0625 * 1.2

// Leg geometry (pixels): hip height when standing, femur and tibia lengths
const HIP_Y = 9
const FOLD_DROP = 4.5
const FEMUR = 7
const TIBIA = 12.8


/**
 * Orchid mantis - a jungle and rainforest night ambusher that passes for a
 * flower. Folded down, it is a low clump of pink orchid blooms on green
 * stalks; it does not move or turn. Come within six blocks (or strike the
 * "plant") and it unfolds: a pale-pink mantis nearly two blocks tall, with
 * green-black eyes and serrated scythe forelegs.
 *
 * It closes in with long hop-lunges, rears up with its scythes raised and
 * opened (the telegraph), then slashes twice in quick succession. After a
 * combo it hops back out of reach and circles until the next one. Lose it
 * by more than twenty blocks and it folds back into a bush where it stands.
 *
 * Stats: 28 HP, 4 + 4 damage per combo, 2.3 block reach, 2.2 s between
 * combos. Drops: a mantis scythe, sometimes a herb.
 */
export class OrchidMantisEntity extends Entity {
  readonly type = 'orchid_mantis'

  private ai: MantisState = 'hidden'
  private stateTime = 0
  private health = MAX_HEALTH
  private comboCooldown = 0
  private slashesDone = 0
  private hopTimer = 0
  private stunTimer = 0
  private wasOnGround = false
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  /** Consecutive hops that went nowhere (a wall): the next hop veers sideways. */
  private blockedHops = 0
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false
  private readonly dawn = new DawnRetreat(2.2)

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null

  // Pose parameters, eased toward each state's targets
  /** 1 = folded into the flower disguise, 0 = standing */
  private fold = 1
  /** Scythes raised over the head (telegraph) */
  private raise = 0
  /** Slash swing: 0 = raised, 1 = swung down through the target */
  private swing = 0
  /** Scythe blades opened away from the femurs */
  private bladeOpen = 0
  /** Bloom petals spread open */
  private petalOpen = 1
  /** Crouched before a hop */
  private crouch = 0
  private time = Math.random() * 10
  private headingY = Math.random() * Math.PI * 2

  private readonly tmp = new THREE.Vector3()
  private readonly toPlayer = new THREE.Vector3()
  private readonly hopStart = new THREE.Vector3()
  /** Where its sounds come from (chest height). */
  private readonly soundPos = new THREE.Vector3()
  private vanishPlayed = false

  // Mesh parts
  private body: THREE.Group | null = null
  private prothorax: THREE.Group | null = null
  private head: THREE.Group | null = null
  private abdomen: THREE.Group | null = null
  private readonly arms: THREE.Group[] = []
  private readonly blades: THREE.Group[] = []
  /** Walking legs: hip (yaw), femur (lift) and knee (splay) groups, with side and yaw */
  private readonly legs: Array<{ femur: THREE.Group; knee: THREE.Group; side: number }> = []
  private readonly petals: THREE.Group[] = []
  private readonly antennae: THREE.Group[] = []
  private readonly fadeList: THREE.Material[] = []
  private readonly baseOpacity = new Map<THREE.Material, number>()

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('orchid_mantis', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.8, 1.6, 0.8),
    })
  }

  get isDying(): boolean {
    return this._isDying
  }

  /** No idle chitter while posing as a flower: it would give the disguise away. */
  get isQuiet(): boolean {
    return this.ai === 'hidden' || this.ai === 'fold' || this.dawn.leaving
  }

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void): void {
    this.playerDamageCallback = callback
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.body = body

    const mat = (color: number): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color })
      this.registerMaterialForLighting(m)
      return m
    }
    const bodyMat = mat(BODY)
    const shadeMat = mat(BODY_SHADE)
    const petalMat = mat(PETAL)
    const petalTipMat = mat(PETAL_TIP)
    const magentaMat = mat(MAGENTA)
    const bladeMat = mat(BLADE)
    const edgeMat = mat(BLADE_EDGE)
    const stalkMat = mat(STALK)
    const stalkDarkMat = mat(STALK_DARK)
    const eyeMat = mat(EYE)
    const throatMat = mat(THROAT)
    // The eyes catch a faint green glint in the dark
    const glintMat = new THREE.MeshBasicMaterial({ color: EYE_GLINT })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }
    const group = (parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(x * S, y * S, z * S)
      parent.add(g)
      return g
    }

    // Thorax hub, carrying the legs, neck and abdomen
    box(4, 3, 6, bodyMat, 0, HIP_Y, 0, body)
    box(3, 1, 5, shadeMat, 0, HIP_Y - 1.8, 0, body)

    // Walking legs: green stalks; the femurs carry heart-shaped petal lobes
    for (const [z, yaw] of [[1.6, -0.55], [-1.4, 0.65]] as const) {
      for (const side of [-1, 1]) {
        const hip = group(body, side * 2, HIP_Y, z)
        hip.rotation.y = -side * yaw
        const femur = group(hip, 0, 0, 0)
        box(FEMUR, 1.3, 1.3, stalkMat, side * FEMUR / 2, 0, 0, femur)
        // Petal lobe on top of the femur
        box(5, 0.6, 4.6, petalMat, side * (FEMUR * 0.55), 0.9, 0, femur)
        box(2.6, 0.6, 2.6, magentaMat, side * (FEMUR * 0.55), 1.2, 0, femur)
        box(1.6, 0.5, 5.2, petalTipMat, side * (FEMUR * 0.55 + 2.7), 0.8, 0, femur)
        const knee = group(femur, side * FEMUR, 0, 0)
        box(1, TIBIA, 1, stalkDarkMat, 0, -TIBIA / 2, 0, knee)
        // Leafy flange: a flap along the leg standing, a leaf on the ground folded
        box(0.4, TIBIA * 0.6, 2.6, stalkMat, side * 0.6, -TIBIA * 0.45, 0.6, knee)
        box(0.4, TIBIA * 0.3, 1.4, stalkDarkMat, side * 0.65, -TIBIA * 0.45, 1.9, knee)
        box(1.8, 0.6, 2.2, stalkMat, 0, -TIBIA + 0.3, 0.4, knee)
        this.legs.push({ femur, knee, side })
      }
    }

    // Abdomen: a broad, petal-lobed body angled back, ending in the bloom
    const abdomen = group(body, 0, HIP_Y + 0.5, -2.6)
    this.abdomen = abdomen
    box(5, 3, 4, bodyMat, 0, 0, -2, abdomen)
    box(6.5, 3.2, 4, bodyMat, 0, 0.1, -5.6, abdomen)
    box(5, 2.6, 3, shadeMat, 0, -0.2, -8.8, abdomen)
    for (const side of [-1, 1]) {
      box(3.5, 0.6, 6, petalMat, side * 4.2, 0.6, -5.2, abdomen)
      box(1.6, 0.6, 3, magentaMat, side * 4.4, 0.95, -5.6, abdomen)
    }
    // The bloom at the tip: five petals around a golden throat
    const bloom = group(abdomen, 0, 0, -10.2)
    box(2.6, 2.6, 1.6, throatMat, 0, 0, -0.4, bloom)
    box(1.4, 1.4, 1, magentaMat, 0, 0, -1.4, bloom)
    for (let k = 0; k < 5; k++) {
      const ring = group(bloom, 0, 0, 0)
      ring.rotation.z = (k / 5) * Math.PI * 2 + 0.3
      const hinge = group(ring, 0, 1, 0)
      box(4.4, 0.6, 6.5, k % 2 === 0 ? petalMat : petalTipMat, 0, 0, -3.1, hinge)
      box(1.8, 0.7, 3, magentaMat, 0, 0.1, -1.8, hinge)
      box(2.8, 0.5, 1.4, petalTipMat, 0, 0, -6.8, hinge)
      this.petals.push(hinge)
    }

    // Prothorax: the long upright "neck" carrying the head and scythes
    const prothorax = group(body, 0, HIP_Y + 1, 2.4)
    this.prothorax = prothorax
    box(2.2, 11, 2.2, bodyMat, 0, 5.5, 0, prothorax)
    box(3.4, 2.2, 2.8, shadeMat, 0, 8.6, 0, prothorax)

    // Head: an inverted triangle with big green-black eyes on its corners
    const head = group(prothorax, 0, 11, 0.4)
    this.head = head
    box(6.4, 2.4, 2.8, bodyMat, 0, 2.6, 0, head)
    box(4.4, 1.8, 2.6, bodyMat, 0, 0.6, 0.1, head)
    box(2.2, 1.6, 2.2, shadeMat, 0, -0.9, 0.4, head)
    box(1.2, 0.8, 1, magentaMat, 0, -1.8, 0.6, head)
    for (const side of [-1, 1]) {
      box(2.2, 2.6, 2.4, eyeMat, side * 3.4, 3, 0.3, head)
      box(0.7, 0.7, 0.4, glintMat, side * 3.6, 3.6, 1.55, head)
      // Antennae sweeping up and back (laid flat while folded)
      const antenna = group(head, side * 1.3, 3.6, -0.8)
      box(0.4, 7, 0.4, stalkDarkMat, 0, 3.4, 0, antenna)
      this.antennae.push(antenna)
    }

    // Raptorial forelegs: femur with spines, the serrated blade folds back along it
    for (const side of [-1, 1]) {
      const arm = group(prothorax, side * 1.7, 7, 0.8)
      box(1.5, 7.5, 1.8, bodyMat, 0, -3.6, 0, arm)
      box(0.5, 6, 0.6, edgeMat, 0, -3.8, 1.1, arm)
      for (let i = 0; i < 4; i++) box(0.4, 0.4, 0.9, edgeMat, 0, -1.5 - i * 1.6, 1.6, arm)
      const blade = group(arm, 0, -7.4, 0.6)
      box(1.2, 7, 1.1, bladeMat, 0, 3.4, 0.2, blade)
      box(0.5, 6.4, 0.5, edgeMat, 0, 3.6, 0.9, blade)
      for (let i = 0; i < 4; i++) box(0.35, 0.35, 0.8, edgeMat, 0, 1.4 + i * 1.5, 1.35, blade)
      box(0.9, 1.6, 0.9, edgeMat, 0, 7.4, 0.4, blade)
      this.arms.push(arm)
      this.blades.push(blade)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [
        body, prothorax, head, abdomen, ...this.arms, ...this.blades, ...this.petals, ...this.antennae,
        ...this.legs.flatMap((l) => [l.femur, l.knee]),
      ],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // Everything the exit and death fade out (merged materials included)
    root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of materials) {
        if (!this.baseOpacity.has(m)) {
          this.baseOpacity.set(m, m.opacity)
          this.fadeList.push(m)
        }
      }
    })

    root.rotation.y = this.headingY
    this.applyPose()
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    const physics = this.getPhysicsBody()
    this.time += deltaTime

    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    const exit = this.dawn.update(deltaTime)
    if (exit > 0) {
      this.updateExit(exit, deltaTime)
      return
    }

    // Physics moved the body: follow it
    super.update(deltaTime)
    if (!physics) return

    this.stateTime += deltaTime
    this.comboCooldown = Math.max(0, this.comboCooldown - deltaTime)

    const onGround = physics.isOnGround
    const landed = onGround && !this.wasOnGround
    this.wasOnGround = onGround
    if (landed) {
      physics.velocity.x = 0
      physics.velocity.z = 0
      // A hop that went nowhere: something is in the way
      const dx = this.position.x - this.hopStart.x
      const dz = this.position.z - this.hopStart.z
      this.blockedHops = dx * dx + dz * dz < 0.25 ? this.blockedHops + 1 : 0
    }

    if (this.stunTimer > 0) {
      this.stunTimer -= deltaTime
      this.easePose(deltaTime)
      this.applyPose()
      return
    }

    this.think(deltaTime, onGround, landed)
    this.easePose(deltaTime)
    this.applyPose()
  }

  private enter(state: MantisState): void {
    this.ai = state
    this.stateTime = 0
    if (state === 'slash') this.slashesDone = 0
    // Its chitter as it springs out of the disguise
    if (state === 'unfold') playEntitySound(this.type, 'idle', this.soundAt())
  }

  private soundAt(): THREE.Vector3 {
    return this.soundPos.set(this.position.x, this.position.y + 1, this.position.z)
  }

  private think(deltaTime: number, onGround: boolean, landed: boolean): void {
    const physics = this.getPhysicsBody()!
    const player = this.playerPositionRef
    let dist = Infinity
    let horizontal = Infinity
    if (player) {
      this.toPlayer.copy(player).sub(this.position)
      dist = this.toPlayer.length()
      horizontal = Math.hypot(this.toPlayer.x, this.toPlayer.z)
    }

    switch (this.ai) {
      case 'hidden': {
        physics.velocity.x = 0
        physics.velocity.z = 0
        if (player && dist < AMBUSH_RANGE) this.enter('unfold')
        break
      }
      case 'unfold': {
        this.halt(physics, onGround)
        this.faceToward(deltaTime)
        if (this.stateTime >= UNFOLD_TIME) this.enter('stalk')
        break
      }
      case 'fold': {
        this.halt(physics, onGround)
        if (player && dist < AMBUSH_RANGE) this.enter('unfold')
        else if (this.stateTime >= FOLD_TIME) this.enter('hidden')
        break
      }
      case 'stalk': {
        if (!player || horizontal > LOSE_RANGE) {
          this.enter('fold')
          break
        }
        this.faceToward(deltaTime)
        if (onGround && this.inReach() && this.comboCooldown <= 0) {
          this.halt(physics, onGround)
          this.enter('windup')
          break
        }
        if (onGround) {
          if (landed) this.hopTimer = HOP_PAUSE
          if (this.hopTimer > 0) {
            this.hopTimer -= deltaTime
            this.halt(physics, onGround)
          } else if (horizontal > REACH * 0.7) {
            // Lunge: aim to land just inside reach rather than overshoot
            const airTime = (2 * HOP_VY) / 28
            const speed = Math.min(HOP_SPEED, Math.max(2.5, (horizontal - REACH * 0.6) / airTime))
            this.hop(this.toPlayer.x / horizontal, this.toPlayer.z / horizontal, speed, HOP_VY)
          } else {
            this.halt(physics, onGround)
          }
        }
        break
      }
      case 'windup': {
        this.halt(physics, onGround)
        this.faceToward(deltaTime)
        if (this.stateTime >= WINDUP_TIME) this.enter('slash')
        break
      }
      case 'slash': {
        this.halt(physics, onGround)
        if (this.slashesDone < SLASH_HITS.length && this.stateTime >= SLASH_HITS[this.slashesDone]) {
          this.slashesDone++
          playSound('night.slash', this.soundAt())
          if (this.inReach()) this.strike()
        }
        if (this.stateTime >= SLASH_TIME) {
          this.comboCooldown = COMBO_COOLDOWN
          this.enter('evade')
        }
        break
      }
      case 'evade': {
        if (this.stateTime < 0.05 && onGround && player && horizontal > 0.01) {
          this.hop(-this.toPlayer.x / horizontal, -this.toPlayer.z / horizontal, EVADE_SPEED, EVADE_VY)
        }
        if (this.stateTime > 0.25 && onGround) {
          this.halt(physics, onGround)
          this.enter('circle')
        }
        break
      }
      case 'circle': {
        if (!player || horizontal > LOSE_RANGE) {
          this.enter('fold')
          break
        }
        this.faceToward(deltaTime)
        if (this.comboCooldown <= 0) {
          this.enter('stalk')
          break
        }
        if (onGround) {
          if (landed) this.hopTimer = CIRCLE_HOP_PAUSE
          if (this.hopTimer > 0) {
            this.hopTimer -= deltaTime
            this.halt(physics, onGround)
          } else if (horizontal > 0.01) {
            // Sidestep around the player, correcting toward the circling radius
            const rx = this.toPlayer.x / horizontal
            const rz = this.toPlayer.z / horizontal
            const radial = Math.max(-1, Math.min(1, (horizontal - CIRCLE_RADIUS) * 0.6))
            let dx = -rz * this.orbitDir + rx * radial
            let dz = rx * this.orbitDir + rz * radial
            const len = Math.hypot(dx, dz) || 1
            dx /= len
            dz /= len
            this.hop(dx, dz, CIRCLE_SPEED, CIRCLE_VY)
          }
        }
        break
      }
    }
  }

  /** Jump off in a horizontal direction (unit vector); veers sideways after blocked hops. */
  private hop(dx: number, dz: number, speed: number, vy: number): void {
    const physics = this.getPhysicsBody()
    if (!physics) return
    if (this.blockedHops >= 2) {
      // Two hops into a wall: try going around it
      const turn = this.orbitDir * 1.2
      const c = Math.cos(turn)
      const s = Math.sin(turn)
      const x = dx * c - dz * s
      dz = dx * s + dz * c
      dx = x
      this.blockedHops = 0
      this.orbitDir = -this.orbitDir
    }
    physics.velocity.set(dx * speed, vy, dz * speed)
    physics.setOnGround(false)
    this.wasOnGround = false
    this.hopStart.copy(this.position)
  }

  /** Stop moving horizontally (keeps falling/hop momentum while airborne). */
  private halt(physics: { velocity: THREE.Vector3 }, onGround: boolean): void {
    if (!onGround) return
    physics.velocity.x = 0
    physics.velocity.z = 0
  }

  private inReach(): boolean {
    const player = this.playerPositionRef
    if (!player) return false
    const dy = player.y - this.position.y
    return Math.hypot(player.x - this.position.x, player.z - this.position.z) <= REACH && dy > -1.5 && dy < 2.2
  }

  private faceToward(deltaTime: number): void {
    const player = this.playerPositionRef
    if (!player) return
    const dx = player.x - this.position.x
    const dz = player.z - this.position.z
    if (dx * dx + dz * dz < 0.01) return
    const target = Math.atan2(dx, dz)
    let diff = target - this.headingY
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    const step = TURN_RATE * deltaTime
    this.headingY += Math.max(-step, Math.min(step, diff))
    const mesh = this.getMesh()
    if (mesh) mesh.rotation.y = this.headingY
  }

  private strike(): void {
    const player = this.playerPositionRef
    if (!player || !this.playerDamageCallback) return
    this.tmp.copy(player).sub(this.position)
    this.tmp.y = 0
    if (this.tmp.lengthSq() > 1e-6) this.tmp.normalize()
    this.tmp.multiplyScalar(SLASH_KNOCKBACK_H)
    this.tmp.y = SLASH_KNOCKBACK_V
    this.playerDamageCallback(SLASH_DAMAGE, this.tmp.clone(), 'melee')
  }

  // ---- pose ----

  /** Ease the pose parameters toward the current state's targets. */
  private easePose(deltaTime: number): void {
    const s = this.ai
    const t = this.stateTime
    let fold = 0
    let raise = 0
    let swing = 0
    let blade = 0
    let petal = 0.15
    let crouch = 0
    let rate = 9
    switch (s) {
      case 'hidden':
        fold = 1
        petal = 1
        rate = 4
        break
      case 'unfold':
        fold = 0
        petal = 0.15
        rate = 1 / UNFOLD_TIME * 2.6
        break
      case 'fold':
        fold = 1
        petal = 1
        rate = 1 / FOLD_TIME * 2.6
        break
      case 'windup':
        raise = 1
        blade = 1
        rate = 1 / WINDUP_TIME * 3
        break
      case 'slash': {
        // Two swings, each down through the target and partway back up; then recover
        raise = 1
        blade = 1
        rate = 30
        if (t > SLASH_HITS[1] + 0.1) {
          raise = 0
          blade = 0
          rate = 9
        } else {
          const swingStart = (t < SLASH_HITS[1] - SWING_TIME ? SLASH_HITS[0] : SLASH_HITS[1]) - SWING_TIME
          const local = t - swingStart
          this.swing = local < SWING_TIME ? local / SWING_TIME : Math.max(0.15, 1 - (local - SWING_TIME) / 0.12)
        }
        break
      }
      default:
        crouch = this.hopTimer > 0 ? 1 : 0
        break
    }
    const k = Math.min(1, rate * deltaTime)
    this.fold += (fold - this.fold) * k
    this.raise += (raise - this.raise) * k
    if (s !== 'slash') this.swing += (swing - this.swing) * Math.min(1, 12 * deltaTime)
    else if (t > SLASH_HITS[1] + 0.1) this.swing += (0 - this.swing) * k
    this.bladeOpen += (blade - this.bladeOpen) * k
    this.petalOpen += (petal - this.petalOpen) * k
    this.crouch += (crouch - this.crouch) * Math.min(1, 14 * deltaTime)
  }

  /** Pose every animated node from the pose parameters. */
  private applyPose(): void {
    if (!this.body) return
    const f = this.fold
    const r = this.raise
    const airborne = !(this.getPhysicsBody()?.isOnGround ?? true) && this.ai !== 'hidden'

    // Lowered into the disguise; a crouch before each hop
    const drop = FOLD_DROP * f + 1.2 * this.crouch * (1 - f)
    this.body.position.y = -drop * S

    // Legs keep their feet on the ground: the tibia splays out as the hips drop
    const hipY = HIP_Y - drop
    // Folded, the legs lie flat around the bloom: leaves with petal lobes
    for (const leg of this.legs) {
      const lift = airborne ? 0.85 : 0.55 * (1 - f) - 0.05 * f
      const knee = hipY + FEMUR * Math.sin(lift)
      const splay = airborne ? 0.5 : Math.acos(Math.min(1, Math.max(-1, knee / TIBIA)))
      leg.femur.rotation.z = leg.side * lift
      leg.knee.rotation.z = leg.side * (splay - lift)
    }

    // Abdomen: tilted back when standing, raised upright as the bloom's stalk when folded
    if (this.abdomen) this.abdomen.rotation.x = 0.45 + 1.0 * f + 0.15 * r
    const sway = this.ai === 'hidden' ? 0.06 : 0
    this.petals.forEach((hinge, i) => {
      hinge.rotation.x = 0.18 + 0.9 * this.petalOpen + Math.sin(this.time * 1.3 + i * 1.7) * sway
    })

    // Neck upright; leans back into the bloom when folded, rears when raising
    // Folded, the head tucks down into the heart of the bloom
    const neck = 0.2 * (1 - f) - 0.62 * f - 0.3 * r
    if (this.prothorax) this.prothorax.rotation.x = neck
    if (this.head) {
      this.head.rotation.x = -neck * 0.8 - 1.1 * f
      this.head.scale.setScalar(1 - 0.5 * f)
      this.head.rotation.z = this.ai === 'hidden' ? 0 : Math.sin(this.time * 2.1) * 0.06
    }

    // Scythes: folded "praying" at rest (tucked into the body when folded),
    // raised and opened in the windup, swung down and forward to slash
    const rest = -0.5 * (1 - f) + 0.5 * f
    let armX = rest + (-2.6 - rest) * r
    armX += (-0.7 - armX) * this.swing
    const bladeX = -1.5 * this.bladeOpen - 0.5 * this.swing
    this.antennae.forEach((antenna, i) => {
      const side = i === 0 ? -1 : 1
      antenna.rotation.set(-0.55 - 1.0 * f, 0, -side * (0.35 + 0.5 * f))
    })
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1
      arm.rotation.x = armX
      arm.rotation.z = side * 0.18 * r
      arm.scale.setScalar(1 - 0.4 * f)
    })
    for (const blade of this.blades) blade.rotation.x = bladeX
  }

  // ---- dawn exit, death ----

  /** Folds into the flower, closes its petals, then sinks into the undergrowth. */
  private updateExit(progress: number, deltaTime: number): void {
    if (!this.vanishPlayed) {
      this.vanishPlayed = true
      playSound('night.vanish', this.soundAt())
    }
    const physics = this.getPhysicsBody()
    if (physics) {
      physics.skipPhysics = true
      physics.velocity.set(0, 0, 0)
    }
    const foldT = Math.min(1, progress / 0.35)
    this.fold = Math.max(this.fold, foldT)
    this.raise *= 1 - Math.min(1, deltaTime * 8)
    this.swing = 0
    this.bladeOpen *= 1 - Math.min(1, deltaTime * 8)
    this.crouch = 0
    this.petalOpen = progress < 0.35 ? 1 : 1 - Math.min(1, (progress - 0.35) / 0.25)
    if (progress > 0.5) this.position.y -= deltaTime * 0.9 / (2.2 * 0.5)
    if (progress > 0.6) fadeMaterials(this.fadeList, 1 - (progress - 0.6) / 0.4, this.baseOpacity)
    if (physics) physics.position.copy(this.position)
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    this.ai = 'hidden'
    this.applyPose()
    if (progress >= 1) this.kill()
  }

  private updateDeath(deltaTime: number): void {
    super.update(deltaTime)
    this.deathTimer += deltaTime
    const physics = this.getPhysicsBody()
    if (physics && physics.isOnGround) {
      physics.velocity.x = 0
      physics.velocity.z = 0
    }
    const mesh = this.getMesh()
    const fall = Math.min(1, this.deathTimer / DEATH_FALL)
    if (mesh) mesh.rotation.z = (1 - (1 - fall) * (1 - fall)) * (Math.PI / 2)
    // Limbs curl in as it dies
    this.raise *= 1 - Math.min(1, deltaTime * 6)
    this.swing = 0
    this.bladeOpen *= 1 - Math.min(1, deltaTime * 6)
    this.petalOpen += (0.6 - this.petalOpen) * Math.min(1, deltaTime * 3)
    this.applyPose()
    const linger = this.deathTimer - DEATH_FALL
    if (linger > DEATH_LINGER * 0.5) fadeMaterials(this.fadeList, Math.max(0, 1 - (linger - DEATH_LINGER * 0.5) / (DEATH_LINGER * 0.5)), this.baseOpacity)
    if (this.deathTimer >= DEATH_FALL + DEATH_LINGER) this.kill()
  }

  // ---- player interaction ----

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying || this.dawn.leaving) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 0.5
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying || this.dawn.leaving) return false
    this.health -= getPlayerAttackDamage(heldItem)
    const knockback = getPlayerAttackKnockback(heldItem)

    const physics = this.getPhysicsBody()
    if (physics) {
      this.tmp.copy(this.position).sub(playerPosition)
      this.tmp.y = 0
      if (this.tmp.lengthSq() > 1e-6) this.tmp.normalize()
      else this.tmp.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
      physics.velocity.set(this.tmp.x * HIT_PUSH * knockback, HIT_LIFT * Math.min(1, knockback), this.tmp.z * HIT_PUSH * knockback)
      physics.setOnGround(false)
      this.wasOnGround = false
      this.hopStart.copy(this.position)
    }

    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }

    // Struck while posing as a plant: the ambush springs at once
    if (this.ai === 'hidden' || this.ai === 'fold' || this.ai === 'unfold') {
      if (this.ai !== 'unfold') playEntitySound(this.type, 'idle', this.soundAt())
      this.fold = Math.min(this.fold, 0.6)
      this.enter('stalk')
    } else if (this.ai === 'windup' || this.ai === 'slash') {
      // A blow breaks the combo; it backs off to try again
      this.comboCooldown = Math.max(this.comboCooldown, 0.8)
      this.enter('circle')
    }
    this.stunTimer = HIT_STUN * Math.min(1, knockback)
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = [new MantisScytheItem()]
    if (Math.random() < 0.5) drops.push(new HerbItem())
    return drops
  }

  dispose(): void {
    this.body = null
    this.prothorax = null
    this.head = null
    this.abdomen = null
    this.arms.length = 0
    this.blades.length = 0
    this.legs.length = 0
    this.petals.length = 0
    this.fadeList.length = 0
    this.baseOpacity.clear()
    this.playerPositionRef = null
    this.playerDamageCallback = null
    super.dispose()
  }
}
