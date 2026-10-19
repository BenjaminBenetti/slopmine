import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import type { IPhysicsBody } from '../../../physics/interfaces/IPhysicsBody.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { WitchstrawItem } from '../../../items/materials/witchstraw/WitchstrawItem.ts'
import { HempFiberItem } from '../../../items/materials/hemp_fiber/HempFiberItem.ts'
import { DawnRetreat, fadeMaterials } from '../NightCreature.ts'
import { getPlayerGaze } from '../NightSenses.ts'
import { playSound } from '../../../audio/SoundHooks.ts'

/** Behaviour states (all suspended while the player watches it). */
enum WatcherState {
  /** No player in range: stands in its field, now and then shifts while unwatched */
  IDLE,
  /** Closing in on the player */
  HUNT,
  /** Arms drawn back, about to rake (held, not cancelled, while watched) */
  WINDUP,
}

// Combat
const MAX_HEALTH = 30
const ATTACK_DAMAGE = 5
const ATTACK_REACH = 2.2
const ATTACK_COOLDOWN = 1.2
const ATTACK_WINDUP = 0.3
const KNOCKBACK_H = 4
const KNOCKBACK_V = 3
const DETECTION_RANGE = 32

// Movement (blocks/s)
const HUNT_SPEED = 6.5
const DRIFT_SPEED = 2.2
const JUMP_VELOCITY = 8
const STUCK_RATIO = 0.2
const STUCK_TIME = 0.3
const REPOSITION_INTERVAL: readonly [number, number] = [12, 25]
const REPOSITION_MAX_TIME = 5

// The gaze: watched within this cone of the view direction, range and line of sight
const GAZE_RANGE = 48
const GAZE_CONE_COS = Math.cos((55 * Math.PI) / 180)
const CHEST_HEIGHT = 1.4
const HEAD_HEIGHT = 2.0
const SIGHT_STEP = 0.4

// Being hit while unwatched (rare: the crosshair is in the gaze cone)
const HIT_PUSH = 5
const HIT_STUN = 0.3

/** Seconds it must have moved since it last froze for the freeze to creak. */
const CREAK_AFTER_MOVING = 0.5

const DEATH_TOPPLE = 0.6
const DEATH_LINGER = 0.8
const EXIT_DURATION = 2.0

// Colours: weathered burlap, faded indigo patchwork coat, old straw, amber eyes
const BURLAP = 0xb39a6c
const BURLAP_DARK = 0x8a7350
const STITCH = 0x2a1d14
const EYE_HOLE = 0x120c08
const AMBER = 0xffb340
const STRAW = 0xd8b85a
const STRAW_DARK = 0xa88a3a
const COAT = 0x48425f
const COAT_DARK = 0x302b44
const PATCH_BROWN = 0x6a4f34
const PATCH_RUST = 0x7a4a36
const POLE = 0x6b5236
const POLE_DARK = 0x4a3824
const TWINE = 0x9b8460
const HATBAND = 0x3a2a1c
const TROUSER = 0x4f4232

const S = 0.0625 // 1 "pixel" = 1/16 block

/**
 * Stillwatcher - a scarecrow that walks the plains and hills at night: a
 * burlap-sack head with a stitched grin and amber pinpoints in its eye holes,
 * a crooked straw hat, a patchwork coat on a cross-pole frame, outstretched
 * pole arms ending in twig fingers.
 *
 * It only moves while unseen. Within the player's gaze (about 55° of the
 * view, 48 blocks, clear line of sight) it freezes instantly mid-stride - no
 * motion, no attacks, it doesn't even budge when struck. Look away and it
 * comes at 6.5 blocks/s with a twitching head, a new tilt every time it
 * moves, and rakes with its twig claws. One is a standoff; two from
 * different sides are a problem. At dawn it slumps into a heap of straw.
 *
 * Stats: 30 HP, 5 damage, 2.2 block reach, 1.2 s cooldown, 32 block detection.
 * Drops: 1 witchstraw, 0-2 hemp fiber.
 */
export class StillwatcherEntity extends Entity {
  readonly type = 'stillwatcher'

  private ai = WatcherState.IDLE
  private stateTimer = 0
  private health = MAX_HEALTH
  private attackCooldown = 0.6
  private stunTimer = 0
  private watched = false
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false
  private readonly dawn = new DawnRetreat(EXIT_DURATION)
  private movedTime = 0
  private vanishPlayed = false
  private readonly soundPosition = { x: 0, y: 0, z: 0 }

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  // Idle repositioning and stuck detection
  private repositionTimer = randomIn(REPOSITION_INTERVAL)
  private readonly driftTarget = new THREE.Vector3()
  private hasDriftTarget = false
  private readonly lastPosition = new THREE.Vector3()
  private stuckTime = 0
  private triedJump = false

  // Animation state
  private walkPhase = Math.random() * Math.PI * 2
  private swayPhase = Math.random() * Math.PI * 2
  private strikeTimer = -1
  private twitchTimer = 0
  private baseTilt = 0
  private baseYaw = 0
  private baseNod = 0

  private readonly moveDir = new THREE.Vector3()
  private readonly knockback = new THREE.Vector3()

  // Mesh parts
  private rig: THREE.Group | null = null
  private head: THREE.Group | null = null
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private readonly fadeMaterialList: THREE.Material[] = []

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('stillwatcher', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 2.2, 0.7),
    })
    this.pickHeadTilt()
  }

  get isDying(): boolean {
    return this._isDying
  }

  /** True while the player's gaze holds it frozen (for sound/telemetry). */
  get isFrozen(): boolean {
    return this.watched
  }

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void): void {
    this.playerDamageCallback = callback
  }

  setWorldQueryFns(
    _blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.solidQuery = solidQuery
  }

  onSpawn(): void {
    this.lastPosition.copy(this.position)
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const rig = new THREE.Group()
    root.add(rig)
    this.rig = rig

    const mat = (color: number): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color })
      this.registerMaterialForLighting(m)
      return m
    }
    const burlap = mat(BURLAP)
    const burlapDark = mat(BURLAP_DARK)
    const stitch = mat(STITCH)
    const eyeHole = mat(EYE_HOLE)
    const straw = mat(STRAW)
    const strawDark = mat(STRAW_DARK)
    const coat = mat(COAT)
    const coatDark = mat(COAT_DARK)
    const patchBrown = mat(PATCH_BROWN)
    const patchRust = mat(PATCH_RUST)
    const pole = mat(POLE)
    const poleDark = mat(POLE_DARK)
    const twine = mat(TWINE)
    const hatband = mat(HATBAND)
    const trouser = mat(TROUSER)
    // The eyes stay lit: faint amber pinpoints in the dark
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: AMBER })

    const box = (
      w: number, h: number, d: number, m: THREE.Material,
      x: number, y: number, z: number, parent: THREE.Object3D,
      rx = 0, ry = 0, rz = 0
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.rotation.set(rx, ry, rz)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Legs: one bare pole, one ragged trouser leg with straw for a foot (hips at y 14)
    const leftLeg = new THREE.Group()
    leftLeg.position.set(-2 * S, 14 * S, 0)
    box(2, 14, 2, pole, 0, -7, 0, leftLeg)
    box(2.6, 1, 3.2, poleDark, 0, -13.5, 0.4, leftLeg)
    box(2.4, 1, 2.4, twine, 0, -4, 0, leftLeg) // lashing
    rig.add(leftLeg)
    this.leftLeg = leftLeg

    const rightLeg = new THREE.Group()
    rightLeg.position.set(2.2 * S, 14 * S, 0)
    box(3.8, 10, 3.8, trouser, 0, -5, 0, rightLeg)
    box(1.6, 3, 1.6, pole, 0, -12, 0, rightLeg)
    box(1.2, 2.5, 0.5, trouser, -1.3, -11, 1.7, rightLeg, 0, 0, 0.2) // frayed hem
    box(1.2, 2, 0.5, trouser, 1.2, -10.8, -1.7, rightLeg, 0, 0, -0.25)
    const footStraw: Array<[number, number, number, number]> = [[-1.2, 0.8, 0.35, 0.3], [0.9, 1.1, -0.3, 0.2], [0.2, -1.2, 0.1, -0.35], [-0.8, -0.9, -0.4, -0.2], [1.3, -0.2, 0.15, -0.5]]
    for (const [x, z, rz, rx] of footStraw) box(0.7, 3.4, 0.7, x > 0 ? straw : strawDark, x, -11.6, z, rightLeg, rx, 0, rz)
    rig.add(rightLeg)
    this.rightLeg = rightLeg

    // Torso: patchwork coat on the frame, twine belt, tattered hem, straw at the collar
    box(9, 12, 5, coat, 0, 19, 0, rig)
    box(1, 11, 0.4, coatDark, 0.4, 19, 2.6, rig) // front seam
    box(3, 3, 0.4, patchBrown, -2.3, 21.2, 2.6, rig)
    box(2.6, 2.2, 0.4, patchRust, 2.5, 16.6, 2.6, rig)
    box(3.4, 2.6, 0.4, patchBrown, 1.4, 21.5, -2.6, rig)
    for (const [x, y] of [[-2.3, 22.1], [-2.3, 20.3], [2.5, 16.6]] as const) box(1.4, 0.3, 0.5, stitch, x, y, 2.7, rig)
    box(9.4, 1, 5.4, twine, 0, 15, 0, rig)
    const hem: Array<[number, number, number]> = [[-3.6, 2.2, 0], [-1.4, 2.2, 1], [1.2, 2.2, 0], [3.5, 2.2, 1], [-3.6, -2.2, 1], [-1, -2.2, 0], [1.6, -2.2, 1], [3.6, -2.2, 0]]
    for (const [x, z, alt] of hem) box(1.8, 2.6 + alt * 0.8, 0.6, alt ? coatDark : coat, x, 12.2 - alt * 0.4, z, rig)
    for (const [x, z, rz] of [[-2.5, 1, 0.5], [2.4, 0.6, -0.6], [0.6, -1.6, 0.3], [-1, 1.8, -0.2]] as const) box(0.7, 2.6, 0.7, straw, x, 25.6, z, rig, 0, 0, rz)
    box(2, 3, 2, pole, 0, 26, 0, rig) // neck pole

    // Arms: stiff poles out to the sides, drooping, straw spilling from the cuffs
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 4.5 * S, 24 * S, 0)
      arm.rotation.z = -side * 0.32
      box(6, 3.4, 3.4, coat, side * 3, 0, 0, arm)
      box(1, 4, 4, coatDark, side * 6.2, 0, 0, arm)
      box(1.6, 0.6, 0.6, side > 0 ? patchRust : patchBrown, side * 2.4, 1.75, 0.6, arm)
      for (const [y, z, rz] of [[1, 0.9, 0.4], [-1.2, -0.6, -0.5], [0.2, -1.3, 0.1], [-0.6, 1.2, -0.9], [-1.6, 0.4, -1.2]] as const) {
        box(2.4, 0.6, 0.6, (y * 10) % 2 === 0 ? straw : strawDark, side * 7.4, y, z, arm, 0, 0, side * rz)
      }
      box(5, 1.4, 1.4, pole, side * 9, 0, 0, arm)
      // Twig fingers, splayed, and a thumb reaching forward
      for (const [y, z, rz, ry] of [[0.5, -0.9, 0.25, 0.25], [0, 0, 0.05, 0], [-0.6, 0.9, -0.2, -0.3]] as const) {
        box(5.5, 0.6, 0.6, poleDark, side * 13.6, y, z, arm, 0, side * ry, side * rz)
      }
      box(0.6, 0.6, 3.2, poleDark, side * 11, -0.2, 1.8, arm)
      rig.add(arm)
      return arm
    }
    this.leftArm = makeArm(-1)
    this.rightArm = makeArm(1)

    // Head: a lopsided burlap sack gathered at the neck, stitched grin, amber eyes
    const head = new THREE.Group()
    head.position.set(0, 27 * S, 0)
    box(8, 7, 7, burlap, 0, 4.5, 0.3, head)
    box(5, 2, 5, burlapDark, -0.8, 8.4, -0.2, head, 0, 0, 0.15) // scrunched top
    box(5.4, 1.5, 5.4, twine, 0, 0.6, 0.2, head) // gather
    for (const [x, z, rz, rx] of [[-2.4, 1, 0.9, 0.3], [2.3, -0.8, -1, 0], [0.8, 2.4, -0.3, 0.9], [-0.9, -2.4, 0.4, -0.8]] as const) {
      box(0.6, 2.2, 0.6, straw, x, 0.4, z, head, rx, 0, rz)
    }
    box(0.4, 5.5, 0.3, stitch, -4.05, 4.4, 0.6, head) // side seam
    // Eye holes: uneven, the left lower and wider
    box(2.0, 2.0, 0.3, eyeHole, -1.8, 5.2, 3.85, head)
    box(1.6, 1.7, 0.3, eyeHole, 1.9, 5.8, 3.85, head)
    const eyeGeo = new THREE.BoxGeometry(0.8 * S, 0.8 * S, 0.3 * S)
    for (const [x, y] of [[-1.7, 5.0], [1.9, 5.7]] as const) {
      const eye = new THREE.Mesh(eyeGeo, this.eyeMaterial)
      eye.position.set(x * S, y * S, 3.97 * S)
      head.add(eye)
    }
    // Stitched grin: a crooked line crossed by stitches
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.9
      const y = 2.5 + 0.06 * x * x + 0.12 * x
      box(1.0, 0.45, 0.3, stitch, x, y, 3.88, head, 0, 0, 0.12 + 0.12 * x * 0.5)
      if (i % 2 !== 0 || i === 0) box(0.3, 1.4, 0.3, stitch, x, y, 3.9, head)
    }
    // Crooked straw hat
    const hat = new THREE.Group()
    hat.position.set(0.3 * S, 8.6 * S, 0.3 * S)
    hat.rotation.set(-0.1, 0.2, 0.2)
    box(13, 0.8, 13, straw, 0, 0, 0, hat)
    box(7, 3.4, 7, straw, 0, 2, 0, hat)
    box(7.2, 1, 7.2, hatband, 0, 1, 0, hat)
    box(3, 0.4, 1, strawDark, 1.2, 3.75, 0.8, hat) // worn crown
    for (const [x, z, rx, rz] of [[6.2, 2, 0, -0.5], [-5.6, -3, 0, 0.6], [2, -6.2, 0.6, 0], [-3, 6.2, -0.5, 0], [6, -4.5, 0.3, -0.4]] as const) {
      box(1.2, 1.2, 1.2, strawDark, x, -0.5, z, hat, rx, 0, rz) // frayed brim
    }
    head.add(hat)
    rig.add(head)
    this.head = head

    rig.rotation.x = 0.08 // a slight hunch

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [rig, head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    root.traverse((node) => {
      if (node instanceof THREE.Mesh && !Array.isArray(node.material) && !this.fadeMaterialList.includes(node.material)) {
        this.fadeMaterialList.push(node.material)
      }
    })
    return root
  }

  update(deltaTime: number): void {
    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }
    const body = this.getPhysicsBody()
    const exit = this.dawn.update(deltaTime)
    if (exit > 0) {
      if (!this.vanishPlayed) {
        this.vanishPlayed = true
        playSound('night.vanish', this.chestPosition())
      }
      this.updateExit(exit)
      if (exit >= 1) this.kill()
      return
    }

    if (body) this.position.copy(body.position)
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)

    const wasWatched = this.watched
    this.watched = this.isWatched()
    if (this.watched) {
      // Caught after moving: the creak tells the player it moved
      if (!wasWatched && this.movedTime >= CREAK_AFTER_MOVING) playSound('night.creak', this.chestPosition())
      this.movedTime = 0
      // Frozen: hold the pose and the spot (gravity still applies)
      if (body) {
        body.velocity.x = 0
        body.velocity.z = 0
      }
      this.lastPosition.copy(this.position)
      this.stuckTime = 0
      this.syncMesh()
      return
    }
    if (wasWatched) {
      this.pickHeadTilt()
      this.twitchTimer = 0
    }

    if (this.stunTimer > 0) {
      this.stunTimer -= deltaTime
    } else {
      this.think(deltaTime)
    }
    if (body && body.velocity.x * body.velocity.x + body.velocity.z * body.velocity.z > 0.25) this.movedTime += deltaTime
    this.lastPosition.copy(this.position)
    this.syncMesh()
    this.animate(deltaTime)
  }

  private think(deltaTime: number): void {
    const body = this.getPhysicsBody()
    const player = this.playerPositionRef
    this.stateTimer += deltaTime
    let speed = 0

    let dx = 0
    let dz = 0
    let horizontal = Infinity
    let inRange = false
    if (player) {
      dx = player.x - this.position.x
      dz = player.z - this.position.z
      horizontal = Math.hypot(dx, dz)
      inRange = Math.hypot(horizontal, player.y - this.position.y) <= DETECTION_RANGE
    }
    const canReach = !!player && horizontal <= ATTACK_REACH && Math.abs(player.y - this.position.y) < 2

    switch (this.ai) {
      case WatcherState.IDLE: {
        if (inRange) {
          this.enter(WatcherState.HUNT)
          break
        }
        this.repositionTimer -= deltaTime
        if (this.repositionTimer <= 0 && !this.hasDriftTarget) {
          const angle = Math.random() * Math.PI * 2
          const distance = 4 + Math.random() * 5
          this.driftTarget.set(this.position.x + Math.cos(angle) * distance, this.position.y, this.position.z + Math.sin(angle) * distance)
          this.hasDriftTarget = true
          this.stateTimer = 0
        }
        if (this.hasDriftTarget) {
          const tx = this.driftTarget.x - this.position.x
          const tz = this.driftTarget.z - this.position.z
          const d = Math.hypot(tx, tz)
          if (d < 0.6 || this.stateTimer > REPOSITION_MAX_TIME) {
            this.hasDriftTarget = false
            this.repositionTimer = randomIn(REPOSITION_INTERVAL)
          } else {
            this.moveDir.set(tx / d, 0, tz / d)
            speed = DRIFT_SPEED
          }
        }
        break
      }
      case WatcherState.HUNT: {
        if (!inRange) {
          this.enter(WatcherState.IDLE)
          break
        }
        if (canReach && this.attackCooldown <= 0) {
          this.enter(WatcherState.WINDUP)
          break
        }
        // Straight at the player; hold still when right above or below them
        if (horizontal > 1.2) {
          this.moveDir.set(dx / horizontal, 0, dz / horizontal)
          speed = HUNT_SPEED
        }
        this.face(dx, dz)
        break
      }
      case WatcherState.WINDUP: {
        this.face(dx, dz)
        if (this.stateTimer >= ATTACK_WINDUP) {
          if (canReach) this.strike(dx, dz, horizontal)
          this.attackCooldown = ATTACK_COOLDOWN
          this.strikeTimer = 0
          this.enter(player ? WatcherState.HUNT : WatcherState.IDLE)
        }
        break
      }
    }

    if (!body) return
    if (speed > 0) {
      this.handleObstacle(body, speed, deltaTime)
      body.velocity.x = this.moveDir.x * speed
      body.velocity.z = this.moveDir.z * speed
      if (this.ai === WatcherState.IDLE) this.face(this.moveDir.x, this.moveDir.z)
    } else {
      body.velocity.x = 0
      body.velocity.z = 0
      this.stuckTime = 0
    }
  }

  /** Jump a 1-block step when walking makes no progress; a higher wall ends a drift. */
  private handleObstacle(body: IPhysicsBody, speed: number, deltaTime: number): void {
    const progress = (this.position.x - this.lastPosition.x) * this.moveDir.x + (this.position.z - this.lastPosition.z) * this.moveDir.z
    if (progress < speed * deltaTime * STUCK_RATIO) {
      this.stuckTime += deltaTime
      if (this.stuckTime >= STUCK_TIME && body.isOnGround) {
        this.stuckTime = 0
        if (!this.triedJump) {
          body.velocity.y = JUMP_VELOCITY
          this.triedJump = true
        } else {
          this.triedJump = false
          if (this.ai === WatcherState.IDLE) {
            this.hasDriftTarget = false
            this.repositionTimer = randomIn(REPOSITION_INTERVAL)
          }
        }
      }
    } else {
      this.stuckTime = 0
      if (body.isOnGround) this.triedJump = false
    }
  }

  private enter(state: WatcherState): void {
    this.ai = state
    this.stateTimer = 0
  }

  private strike(dx: number, dz: number, horizontal: number): void {
    if (!this.playerDamageCallback) return
    if (horizontal > 1e-3) this.knockback.set((dx / horizontal) * KNOCKBACK_H, KNOCKBACK_V, (dz / horizontal) * KNOCKBACK_H)
    else this.knockback.set(0, KNOCKBACK_V, 0)
    this.playerDamageCallback(ATTACK_DAMAGE, this.knockback, 'melee')
  }

  /**
   * In the player's gaze: inside the view cone (toward its chest or head),
   * within range, and not hidden behind solid blocks.
   */
  private isWatched(): boolean {
    const gaze = getPlayerGaze()
    if (!gaze) return false
    const o = gaze.origin
    const d = gaze.direction
    const dx = this.position.x - o.x
    const dz = this.position.z - o.z
    const chestY = this.position.y + CHEST_HEIGHT - o.y
    const headY = this.position.y + HEAD_HEIGHT - o.y
    const chestDist = Math.hypot(dx, chestY, dz)
    if (chestDist > GAZE_RANGE) return false
    if (chestDist < 0.5) return true
    const headDist = Math.hypot(dx, headY, dz)
    const chestCos = (dx * d.x + chestY * d.y + dz * d.z) / chestDist
    const headCos = (dx * d.x + headY * d.y + dz * d.z) / headDist
    if (chestCos < GAZE_CONE_COS && headCos < GAZE_CONE_COS) return false
    return this.hasSight(o, dx, chestY, dz, chestDist) || this.hasSight(o, dx, headY, dz, headDist)
  }

  /** No solid block on the ray from the eye along (dx, dy, dz) (sampled, ends excluded). */
  private hasSight(o: { readonly x: number; readonly y: number; readonly z: number }, dx: number, dy: number, dz: number, dist: number): boolean {
    const solid = this.solidQuery
    if (!solid) return true
    const steps = Math.floor((dist - 0.6) / SIGHT_STEP)
    for (let i = 1; i <= steps; i++) {
      const t = (i * SIGHT_STEP) / dist
      if (solid(Math.floor(o.x + dx * t), Math.floor(o.y + dy * t), Math.floor(o.z + dz * t))) return false
    }
    return true
  }

  private face(dx: number, dz: number): void {
    const mesh = this.getMesh()
    if (mesh && dx * dx + dz * dz > 1e-4) mesh.rotation.y = Math.atan2(dx, dz)
  }

  /** A new head tilt each time it moves again - the player sees it changed. */
  private pickHeadTilt(): void {
    this.baseTilt = (Math.random() * 2 - 1) * 0.55
    this.baseYaw = (Math.random() * 2 - 1) * 0.35
    this.baseNod = -0.15 + Math.random() * 0.45
  }

  private chestPosition(): { x: number; y: number; z: number } {
    this.soundPosition.x = this.position.x
    this.soundPosition.y = this.position.y + CHEST_HEIGHT
    this.soundPosition.z = this.position.z
    return this.soundPosition
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
  }

  private animate(deltaTime: number): void {
    const body = this.getPhysicsBody()
    const moving = !!body && body.velocity.x * body.velocity.x + body.velocity.z * body.velocity.z > 0.25
    const hunting = this.ai !== WatcherState.IDLE
    const k = Math.min(1, deltaTime * 12)

    if (this.rig) {
      if (moving) {
        // Stiff, puppet-like gait: the swing snaps between extremes
        this.walkPhase += deltaTime * (hunting ? 11 : 6)
        const s = Math.sin(this.walkPhase)
        const swing = Math.sign(s) * Math.sqrt(Math.abs(s)) * 0.55
        if (this.leftLeg) this.leftLeg.rotation.x = swing
        if (this.rightLeg) this.rightLeg.rotation.x = -swing
        this.rig.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.06
        this.rig.rotation.x += ((hunting ? 0.2 : 0.1) - this.rig.rotation.x) * k
        this.rig.rotation.z = swing * 0.06
      } else {
        // Standing in its field, stirring a little in the wind
        this.swayPhase += deltaTime * 0.7
        if (this.leftLeg) this.leftLeg.rotation.x *= 0.85
        if (this.rightLeg) this.rightLeg.rotation.x *= 0.85
        this.rig.position.y *= 0.85
        this.rig.rotation.x += (0.08 - this.rig.rotation.x) * k
        this.rig.rotation.z = Math.sin(this.swayPhase) * 0.03
      }
    }

    // Arms: outstretched, dragged back in the windup, raked forward in the strike
    let armYaw = moving ? Math.sin(this.walkPhase) * 0.12 : Math.sin(this.swayPhase * 1.3) * 0.05
    let armLift = 0
    if (this.ai === WatcherState.WINDUP) {
      armYaw = 0.55
      armLift = 0.25
    } else if (this.strikeTimer >= 0) {
      this.strikeTimer += deltaTime
      const t = this.strikeTimer
      armYaw = t < 0.12 ? 0.55 - (t / 0.12) * 1.8 : -1.25 * Math.max(0, 1 - (t - 0.12) / 0.4)
      if (t > 0.52) this.strikeTimer = -1
    }
    const armK = this.ai === WatcherState.WINDUP ? Math.min(1, deltaTime * 14) : this.strikeTimer >= 0 ? 1 : k
    if (this.rightArm) {
      this.rightArm.rotation.y += (armYaw - this.rightArm.rotation.y) * armK
      this.rightArm.rotation.z += (-0.32 + armLift - this.rightArm.rotation.z) * armK
    }
    if (this.leftArm) {
      this.leftArm.rotation.y += (-armYaw - this.leftArm.rotation.y) * armK
      this.leftArm.rotation.z += (0.32 - armLift - this.leftArm.rotation.z) * armK
    }

    // Head: snaps between small twitches around this move's tilt
    if (this.head) {
      this.twitchTimer -= deltaTime
      if (this.twitchTimer <= 0) {
        this.twitchTimer = moving ? 0.12 + Math.random() * 0.33 : 0.8 + Math.random() * 2
        const j = moving ? 1 : 0.3
        this.head.rotation.set(
          this.baseNod + (Math.random() - 0.5) * 0.3 * j,
          this.baseYaw + (Math.random() - 0.5) * 0.6 * j,
          this.baseTilt + (Math.random() - 0.5) * 0.5 * j
        )
      }
    }

    if (this.eyeMaterial) {
      const flare = this.ai === WatcherState.WINDUP || this.strikeTimer >= 0
      this.eyeMaterial.color.setHex(flare ? 0xffe0a0 : AMBER)
    }
  }

  /** Dawn: the frame gives way - it crumples into a heap of straw and sinks away. */
  private updateExit(t: number): void {
    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = true
      body.velocity.set(0, 0, 0)
    }
    const slump = easeOut(Math.min(1, t / 0.45))
    const sink = easeIn(Math.max(0, (t - 0.35) / 0.65))
    if (this.rig) {
      // Knees give, the torso folds over
      this.rig.position.y = -slump * 0.5
      this.rig.rotation.x = 0.08 + slump * 0.8
      this.rig.rotation.z = slump * 0.22
    }
    if (this.leftArm) this.leftArm.rotation.set(0.3 * slump, -0.4 * slump, 0.32 + slump * 0.95)
    if (this.rightArm) this.rightArm.rotation.set(0.3 * slump, 0.4 * slump, -0.32 - slump * 0.95)
    if (this.leftLeg) this.leftLeg.rotation.set(-slump * 1.1, 0, -slump * 0.35)
    if (this.rightLeg) this.rightLeg.rotation.set(-slump * 0.8, 0, slump * 0.45)
    if (this.head) this.head.rotation.set(this.baseNod + slump * 0.5, this.baseYaw, this.baseTilt + slump * 0.6)
    if (this.eyeMaterial) this.eyeMaterial.color.setHex(AMBER).multiplyScalar(1 - slump)
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.set(this.position.x, this.position.y - sink * 1.2, this.position.z)
      mesh.scale.set(1 + sink * 0.3, 1 - sink * 0.55, 1 + sink * 0.3)
    }
    if (t > 0.6) fadeMaterials(this.fadeMaterialList, 1 - (t - 0.6) / 0.4)
  }

  /** Slain: the eyes go out and it topples backward like a felled pole. */
  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
      this.position.copy(body.position)
    }
    const t = easeIn(Math.min(1, this.deathTimer / DEATH_TOPPLE))
    if (this.rig) this.rig.rotation.x = 0.08 - t * (Math.PI / 2 - 0.15)
    if (this.eyeMaterial) this.eyeMaterial.color.setHex(EYE_HOLE)
    this.syncMesh()
    if (this.deathTimer >= DEATH_TOPPLE + DEATH_LINGER) this.kill()
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying || this.dawn.leaving) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 1
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying || this.dawn.leaving) return false
    this.health -= getPlayerAttackDamage(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }
    // Under the gaze it takes the blow without budging; unwatched it reels
    if (!this.watched) {
      const knockback = getPlayerAttackKnockback(heldItem)
      const body = this.getPhysicsBody()
      if (body) {
        const dx = this.position.x - playerPosition.x
        const dz = this.position.z - playerPosition.z
        const len = Math.hypot(dx, dz) || 1
        body.velocity.x = (dx / len) * HIT_PUSH * knockback
        body.velocity.z = (dz / len) * HIT_PUSH * knockback
        body.velocity.y = 2.5 * Math.min(1, knockback)
      }
      this.stunTimer = HIT_STUN * Math.max(0.4, Math.min(1, knockback))
      if (this.ai === WatcherState.WINDUP) {
        this.attackCooldown = Math.max(this.attackCooldown, 0.6)
        this.enter(WatcherState.HUNT)
      }
    }
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = [new WitchstrawItem()]
    const fiber = Math.floor(Math.random() * 3)
    for (let i = 0; i < fiber; i++) drops.push(new HempFiberItem())
    return drops
  }

  dispose(): void {
    this.rig = null
    this.head = null
    this.leftArm = null
    this.rightArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.eyeMaterial = null
    this.fadeMaterialList.length = 0
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.solidQuery = null
    super.dispose()
  }
}

function randomIn(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0])
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function easeIn(t: number): number {
  return t * t
}
