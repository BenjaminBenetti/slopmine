import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { createItemFromId } from '../../../persistence/ItemRegistry.ts'
import { playEntitySound, playSound } from '../../../audio/SoundHooks.ts'
import { fadeMaterials } from '../../night/NightCreature.ts'
import { WeatherRetreat } from '../WeatherCreature.ts'

/** Behaviour states. */
enum StalkerState {
  /** No player around: prowls about */
  ROAM,
  /** Circles the player at the edge of the haze */
  STALK,
  /** Sprints in to pouncing range */
  CLOSE_IN,
  /** Telegraph: crouches low, eyes flare */
  WINDUP,
  /** In the air, jaws open */
  LEAP,
  /** Landed without a bite: recovering its footing */
  LAND,
  /** Lopes back out to the circle */
  RETREAT,
}

/** The weathers it hunts in (WeatherCatalog ids). */
const WEATHERS: ReadonlySet<string> = new Set(['blizzard'])

// Combat
const MAX_HEALTH = 40
const BITE_DAMAGE = 8
const BITE_KNOCKBACK_H = 6
const BITE_KNOCKBACK_V = 3.5
/** Frostbite from a bite (slowness level 1). */
const FROSTBITE_SECONDS = 4
const DETECTION_RANGE = 30
const LOSE_RANGE = 44
/** Horizontal reach of the bite during a leap, centre to centre. */
const BITE_RADIUS = 1.35

// Movement (blocks/s)
const ROAM_SPEED = 2.2
const STALK_SPEED = 4.6
const CLOSE_SPEED = 7.5
const RETREAT_SPEED = 8
const STALK_RADIUS_MIN = 10
const STALK_RADIUS_MAX = 16
/** Starts its crouch within this distance of the player. */
const POUNCE_RANGE = 7
const JUMP_VELOCITY = 8
/** Leap: horizontal speed bounds and flight time bounds. */
const LEAP_SPEED_MAX = 16
const LEAP_TIME_MIN = 0.35
const LEAP_TIME_MAX = 0.62
/** Physics gravity (blocks/s², physics/constants.ts) - for aiming the leap. */
const GRAVITY = 28

// Timing (s)
const WINDUP_TIME = 0.8
const CLOSE_IN_MAX_TIME = 3
const LEAP_MAX_TIME = 1.4
const LAND_TIME = 0.4
const RETREAT_TIME = 1.4
const COOLDOWN_AFTER_BITE = 5
const COOLDOWN_AFTER_MISS = 1.8
const FIRST_POUNCE_DELAY = 2.5

// Being hit: light and wiry, it gives ground
const HIT_PUSH = 4
const HIT_FLINCH = 0.3

// Body (hitbox 0.9 × 1.3 × 0.9)
const HALF_WIDTH = 0.45
const HEIGHT = 1.3

// Death and leaving
const DEATH_FALL_TIME = 0.6
const DEATH_LINGER_TIME = 1.0
const EXIT_TIME = 2.6

// Colours: frosty white fur, ice-blue tufts, cold glowing eyes
const FUR = 0xeef3f7
const FUR_SHADE = 0xcbd8e2
const FUR_DEEP = 0xa9bccb
const TUFT = 0x9fd2ef
const TUFT_DEEP = 0x6fb2dc
const ICE = 0xc8ecff
const NOSE = 0x2b3a48
const MOUTH = 0x4a2f3c
const EYE = 0x8fe6ff
const EYE_FLARE = 0xeaffff
const EYE_DIM = 0x1d3340

const EYE_COLOR = new THREE.Color(EYE)
const EYE_DIM_COLOR = new THREE.Color(EYE_DIM)

const S = 0.0625 // 1 "pixel" = 1/16 block

/**
 * Whiteout Stalker - a lanky snow-cat of the blizzard-bound pine heights:
 * long thin legs, a narrow wolfish head, frosty white fur ragged with
 * ice-blue tufts, and two cold blue eyes that burn through the snow. In a
 * whiteout you see the eyes long before the beast.
 *
 * It circles at the edge of what you can see (10-16 blocks), then sprints in,
 * crouches low with its eyes flaring (0.8 s - strike it now and the pounce
 * breaks off), and leaps: a bite for 8 damage and Frostbite. Then it lopes
 * back out into the white and circles again. When the blizzard passes it runs
 * off and melts into the snow.
 *
 * Stats: 40 HP, 8 damage + Frostbite (4 s), 30 block detection.
 * Drops: 1-2 whiteout pelts.
 */
export class WhiteoutStalkerEntity extends Entity {
  readonly type = 'whiteout_stalker'

  private ai = StalkerState.ROAM
  private stateTimer = 0
  private health = MAX_HEALTH
  private pounceCooldown = FIRST_POUNCE_DELAY
  private flinchTimer = 0
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false
  private hasBitten = false
  private readonly retreat = new WeatherRetreat(WEATHERS, EXIT_TIME)

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  private readonly moveDir = new THREE.Vector3()
  private readonly leapDir = new THREE.Vector3()
  private readonly roamTarget = new THREE.Vector3()
  private readonly lastPosition = new THREE.Vector3()
  private readonly exitDir = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly knockback = new THREE.Vector3()
  private readonly soundPos = new THREE.Vector3()
  private orbitAngle = Math.random() * Math.PI * 2
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  private orbitRadius = STALK_RADIUS_MIN + Math.random() * (STALK_RADIUS_MAX - STALK_RADIUS_MIN)
  private stuckTime = 0
  private triedJump = false
  private exitStarted = false
  private facing = Math.random() * Math.PI * 2

  // Animation
  private walkPhase = Math.random() * Math.PI * 2
  private idlePhase = Math.random() * Math.PI * 2
  private speedNow = 0

  // Mesh parts
  private body: THREE.Group | null = null
  private neck: THREE.Group | null = null
  private jaw: THREE.Group | null = null
  private readonly tail: THREE.Group[] = []
  private readonly legs: THREE.Group[] = []
  private readonly lowerLegs: THREE.Group[] = []
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  /** What melts away when it leaves: the (merged) body materials, then the eyes. */
  private readonly fadeBody: THREE.Material[] = []
  private readonly fadeEyes: THREE.Material[] = []

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('whiteout_stalker', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(HALF_WIDTH * 2, HEIGHT, HALF_WIDTH * 2),
    })
    this.roamTarget.copy(this.position)
    this.lastPosition.copy(this.position)
  }

  get isDying(): boolean {
    return this._isDying
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
    this.roamTarget.copy(this.position)
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.body = body

    const fur = new THREE.MeshLambertMaterial({ color: FUR })
    const furShade = new THREE.MeshLambertMaterial({ color: FUR_SHADE })
    const furDeep = new THREE.MeshLambertMaterial({ color: FUR_DEEP })
    const tuft = new THREE.MeshLambertMaterial({ color: TUFT })
    const tuftDeep = new THREE.MeshLambertMaterial({ color: TUFT_DEEP })
    const ice = new THREE.MeshLambertMaterial({ color: ICE })
    const nose = new THREE.MeshLambertMaterial({ color: NOSE })
    const mouth = new THREE.MeshLambertMaterial({ color: MOUTH })
    for (const m of [fur, furShade, furDeep, tuft, tuftDeep, ice, nose, mouth]) this.registerMaterialForLighting(m)
    // The eyes burn through the whiteout: self-lit and unfogged
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE, fog: false })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Legs: long and thin, pivoting at the shoulders/hips; the hind legs bend
    // like a cat's (thigh forward, shin back to a high hock); wide snowshoe
    // paws with ice-blue claws. Each leg: animated pivot → static bend → boxes.
    const legSpots: Array<[number, number, boolean]> = [
      [-2.2, 6.2, true], // front left
      [2.2, 6.2, true], // front right
      [-2.4, -6.6, false], // back left
      [2.4, -6.6, false], // back right
    ]
    for (const [x, z, front] of legSpots) {
      const leg = new THREE.Group()
      leg.position.set(x * S, 15 * S, z * S)
      const upper = new THREE.Group()
      upper.rotation.x = front ? 0 : -0.38
      leg.add(upper)
      if (front) {
        box(2.3, 7.6, 2.6, fur, 0, -3.4, 0, upper) // upper leg
        box(2.7, 3, 3, fur, 0, -0.4, 0.2, upper) // shoulder
        // Ruff hanging at the back of the elbow
        box(1.6, 2.2, 1, fur, 0, -5.6, -1.5, upper)
      } else {
        box(2.8, 8, 3.6, fur, 0, -3.4, 0, upper) // thigh
        // Ragged fringe down the back of the thigh, a blue streak through it
        box(1.8, 3, 1.2, fur, 0, -4.4, -2.2, upper)
        box(1.2, 2.2, 1, tuft, 0, -2.2, -2.2, upper)
      }
      const lower = new THREE.Group()
      lower.position.set(0, -7.2 * S, 0)
      upper.add(lower)
      const shin = new THREE.Group()
      shin.rotation.x = front ? 0 : 0.62
      lower.add(shin)
      box(1.7, 1.6, 1.8, furDeep, 0, 0, 0, shin) // knee / hock
      box(1.4, 6.6, 1.4, front ? furShade : fur, 0, -3.3, 0, shin)
      const paw = new THREE.Group()
      paw.position.set(0, -6.8 * S, 0)
      paw.rotation.x = front ? 0 : -0.24
      shin.add(paw)
      box(2.4, 0.8, 1.4, furShade, 0, 0, -0.2, paw) // fur over the paw
      box(2.3, 1.2, 3.1, fur, 0, -0.7, 0.6, paw) // paw
      for (const cx of [-0.75, 0, 0.75]) box(0.4, 0.5, 0.7, ice, cx, -1.0, 2.4, paw) // claws
      body.add(leg)
      this.legs.push(leg)
      this.lowerLegs.push(lower)
    }

    // Torso: a deep narrow chest, the waist tucked up thin, lean hips
    box(6, 8, 7.4, fur, 0, 17.6, 4, body) // chest
    box(5.2, 3, 6, furShade, 0, 13.9, 4.6, body) // keel of the chest
    box(4.2, 4.6, 6.4, fur, 0, 19.2, -1.6, body) // waist
    box(5.4, 6, 5.4, fur, 0, 18.4, -6.6, body) // hips
    box(3, 1, 5, furDeep, 0, 16.6, -1.6, body) // tucked belly
    // Ragged fringe hanging under the chest
    for (const [x, z, h] of [[-2, 6.4, 2.6], [-0.6, 7.2, 3.4], [0.8, 6.8, 3], [2.1, 5.6, 2.2], [-1.4, 3.4, 2.4], [1.5, 3.2, 2]] as const) {
      box(1.2, h, 1.2, fur, x, 12.6 - h / 2 + 0.6, z, body)
    }
    // Frosted fur along the spine, swept back, blue at the shoulders and tail root
    const crest = (z: number, h: number, m: THREE.Material, w = 1.2): void => {
      const tuftGroup = new THREE.Group()
      tuftGroup.position.set(0, 21.2 * S, z * S)
      tuftGroup.rotation.x = -0.75
      body.add(tuftGroup)
      box(w, h, 1.2, m, 0, h / 2, 0, tuftGroup)
    }
    crest(7, 2.6, tuft, 1.6)
    crest(5, 2.8, tuftDeep, 1.4)
    crest(3, 2.2, tuft)
    crest(0.6, 1.6, fur)
    crest(-2, 1.4, fur)
    crest(-4.6, 1.8, tuft)
    crest(-7.4, 2, tuftDeep)
    // Shoulder ruffs: ragged tufts sticking back and out
    for (const side of [-1, 1]) {
      for (const [dy, dz, h, m] of [[1.4, 4.6, 2.6, tuft], [-0.6, 4, 2.2, fur], [2.4, 2.6, 1.8, fur]] as const) {
        const g = new THREE.Group()
        g.position.set(side * 3 * S, (18 + dy) * S, dz * S)
        g.rotation.set(-1.1, 0, -side * 0.5)
        body.add(g)
        box(1.1, h, 1, m, 0, h / 2, 0, g)
      }
    }

    // Tail: long and fluffed in three swinging segments, a blue brush at the end
    let tailParent: THREE.Object3D = body
    let tailZ = -9
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group()
      seg.position.set(0, (i === 0 ? 20 : 0) * S, tailZ * S)
      tailParent.add(seg)
      box(2 - i * 0.2, 2 - i * 0.2, 4.6, i === 2 ? furShade : fur, 0, 0, -2.3, seg)
      box(1.2, 0.8, 3, fur, 0, 1.1 - i * 0.1, -2.6, seg) // fluff on top
      if (i === 2) {
        box(2.8, 2.6, 3.4, tuft, 0, 0, -5.6, seg)
        box(1.8, 1.8, 1.6, tuftDeep, 0, 0, -7.8, seg)
      }
      this.tail.push(seg)
      tailParent = seg
      tailZ = -4.6
    }

    // Neck: short and thick, reaching forward from the top of the chest,
    // a ragged blue-white collar round its base
    const neck = new THREE.Group()
    neck.position.set(0, 19.5 * S, 6.6 * S)
    body.add(neck)
    this.neck = neck
    const neckCol = new THREE.Group()
    neckCol.rotation.x = 0.85 // leaning well forward
    neck.add(neckCol)
    box(4, 5.4, 4.4, fur, 0, 2.4, 0, neckCol)
    for (const [x, z, h, m] of [[-1.8, -1.6, 2.6, tuft], [0, -2.2, 3, tuftDeep], [1.8, -1.6, 2.6, tuft], [-2.2, 0.8, 2.2, fur], [2.2, 0.8, 2.2, fur]] as const) {
      box(1.3, h, 1.3, m, x, 0.6 + h / 2, z, neckCol)
    }

    // Head: narrow skull, long tapering snout, pointed ears tipped outward
    const head = new THREE.Group()
    head.position.set(0, 5.4 * S, 0.6 * S)
    head.rotation.x = -0.85 // level the face again
    neckCol.add(head)
    box(4, 3.6, 4.2, fur, 0, 0.8, 0, head) // skull
    box(2.8, 2.2, 2.6, fur, 0, 0.2, 3.3, head) // snout base
    box(2.2, 1.8, 2.4, fur, 0, 0, 5.6, head) // snout tip
    box(1.6, 0.4, 3.8, furShade, 0, 1.25, 4.2, head) // bridge
    box(1.2, 0.9, 0.7, nose, 0, 0.5, 6.9, head) // nose
    for (const side of [-1, 1]) {
      // Brow over each eye
      box(1.6, 0.6, 1.4, furShade, side * 1.3, 2.3, 1.6, head)
      // The eyes: slanted slits that burn ice-blue
      box(1.6, 0.9, 0.4, this.eyeMaterial, side * 1.25, 1.6, 2.2, head)
      box(0.4, 0.8, 1.1, this.eyeMaterial, side * 2.05, 1.6, 1.6, head)
      // Cheek tufts swept back
      for (const [dy, h, m] of [[0.2, 2.2, fur], [-0.9, 1.8, tuft]] as const) {
        const g = new THREE.Group()
        g.position.set(side * 1.9 * S, dy * S, -0.6 * S)
        g.rotation.set(-1.25, 0, -side * 0.45)
        head.add(g)
        box(1, h, 0.9, m, 0, h / 2, 0, g)
      }
      // Ears: pointed, tipped outward, blue inside
      const ear = new THREE.Group()
      ear.position.set(side * 1.3 * S, 2.4 * S, -0.9 * S)
      ear.rotation.z = -side * 0.45
      ear.rotation.x = -0.4
      head.add(ear)
      box(1.8, 1.5, 1.6, fur, 0, 0.75, 0, ear)
      box(1.2, 1.2, 1.2, fur, 0, 2.05, -0.2, ear)
      box(0.6, 0.8, 0.8, furShade, 0, 2.95, -0.45, ear)
      box(0.9, 1.7, 0.3, tuft, 0, 1.3, 0.8, ear)
    }

    // Lower jaw (opens to bite) with a row of ice-white fangs
    const jaw = new THREE.Group()
    jaw.position.set(0, -0.9 * S, 2.2 * S)
    head.add(jaw)
    this.jaw = jaw
    box(2.3, 0.9, 4.2, furShade, 0, -0.3, 2, jaw)
    box(1.7, 0.3, 3.4, mouth, 0, 0.25, 2, jaw)
    for (const side of [-1, 1]) {
      box(0.4, 0.9, 0.4, ice, side * 0.85, 0.6, 3.6, jaw)
      box(0.4, 0.9, 0.4, ice, side * 0.8, -1.1, 5.6, head) // upper fangs
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, neck, this.jaw, ...this.tail, ...this.legs, ...this.lowerLegs],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const material = mesh.material as THREE.Material
      const list = material === this.eyeMaterial ? this.fadeEyes : this.fadeBody
      if (!list.includes(material)) list.push(material)
    })
    root.rotation.y = this.facing
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    this.syncFromBody()

    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    const exit = this.retreat.update(deltaTime, this.position.x, this.position.y, this.position.z)
    if (exit > 0) {
      if (!this.exitStarted) this.startExit()
      this.updateExit(exit, deltaTime)
      if (exit >= 1) this.kill()
      return
    }

    this.stateTimer += deltaTime
    this.pounceCooldown = Math.max(0, this.pounceCooldown - deltaTime)
    if (this.flinchTimer > 0) {
      // Rocked by a blow: the push plays out, no steering
      this.flinchTimer -= deltaTime
    } else {
      this.think(deltaTime)
    }

    this.lastPosition.copy(this.position)
    this.animate(deltaTime)
    this.placeMesh()
  }

  private placeMesh(): void {
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
      mesh.rotation.y = this.facing
    }
  }

  private syncFromBody(): void {
    const body = this.getPhysicsBody()
    if (body) this.position.copy(body.position)
  }

  private enter(state: StalkerState): void {
    this.ai = state
    this.stateTimer = 0
    this.stuckTime = 0
    this.triedJump = false
  }

  /** Back to circling, at the angle it stands at now. */
  private resumeStalking(): void {
    const player = this.playerPositionRef
    if (player) {
      this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
      this.orbitRadius = STALK_RADIUS_MIN + Math.random() * (STALK_RADIUS_MAX - STALK_RADIUS_MIN)
      if (Math.random() < 0.35) this.orbitDir = -this.orbitDir
    }
    this.enter(player ? StalkerState.STALK : StalkerState.ROAM)
  }

  private think(deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (!body) return
    const player = this.playerPositionRef
    const dist = player ? this.horizontalDistanceTo(player) : Infinity

    switch (this.ai) {
      case StalkerState.ROAM: {
        if (player && dist <= DETECTION_RANGE && Math.abs(player.y - this.position.y) < 14) {
          this.resumeStalking()
          break
        }
        if (this.stateTimer > 5 || this.horizontalDistanceTo(this.roamTarget) < 1) {
          this.stateTimer = 0
          const angle = Math.random() * Math.PI * 2
          const reach = 5 + Math.random() * 10
          this.roamTarget.set(this.position.x + Math.cos(angle) * reach, this.position.y, this.position.z + Math.sin(angle) * reach)
        }
        if (this.stateTimer < 3) this.walkToward(this.roamTarget, ROAM_SPEED, deltaTime, body)
        else this.halt(body, deltaTime)
        break
      }
      case StalkerState.STALK: {
        if (!player || dist > LOSE_RANGE) {
          this.enter(StalkerState.ROAM)
          break
        }
        // Circle the player at the edge of the haze
        this.orbitAngle += this.orbitDir * deltaTime * (STALK_SPEED / this.orbitRadius) * 0.85
        this.tmp.set(
          player.x + Math.cos(this.orbitAngle) * this.orbitRadius,
          this.position.y,
          player.z + Math.sin(this.orbitAngle) * this.orbitRadius
        )
        const speed = dist > STALK_RADIUS_MAX + 4 ? STALK_SPEED * 1.5 : STALK_SPEED
        if (this.walkToward(this.tmp, speed, deltaTime, body)) this.orbitDir = -this.orbitDir
        // Watch the player while slinking round
        if (dist < STALK_RADIUS_MAX + 2) this.turnToward(player, deltaTime, 2)
        if (this.pounceCooldown <= 0 && dist <= STALK_RADIUS_MAX + 4 && this.hasLineOfSight(player)) {
          this.enter(StalkerState.CLOSE_IN)
        }
        break
      }
      case StalkerState.CLOSE_IN: {
        if (!player || dist > LOSE_RANGE) {
          this.enter(StalkerState.ROAM)
          break
        }
        if (dist <= POUNCE_RANGE) {
          this.enter(StalkerState.WINDUP)
          playEntitySound('whiteout_stalker', 'idle', this.soundPos.set(this.position.x, this.position.y + 1, this.position.z))
          break
        }
        if (this.stateTimer >= CLOSE_IN_MAX_TIME || this.walkToward(player, CLOSE_SPEED, deltaTime, body)) {
          // Couldn't get at the player: back to circling for a moment
          this.pounceCooldown = 1
          this.resumeStalking()
        }
        break
      }
      case StalkerState.WINDUP: {
        this.halt(body, deltaTime)
        if (!player || dist > LOSE_RANGE) {
          this.enter(StalkerState.ROAM)
          break
        }
        this.turnToward(player, deltaTime, 9)
        if (this.stateTimer >= WINDUP_TIME) this.launch(player, body)
        break
      }
      case StalkerState.LEAP: {
        this.facing = Math.atan2(this.leapDir.x, this.leapDir.z)
        if (!this.hasBitten && player && dist <= BITE_RADIUS && Math.abs(player.y - this.position.y) < 2) {
          this.bite(player)
          this.pounceCooldown = COOLDOWN_AFTER_BITE
          this.enter(StalkerState.RETREAT)
          break
        }
        if ((this.stateTimer > 0.15 && body.isOnGround) || this.stateTimer >= LEAP_MAX_TIME) {
          this.pounceCooldown = COOLDOWN_AFTER_MISS
          this.enter(StalkerState.LAND)
        }
        break
      }
      case StalkerState.LAND: {
        this.halt(body, deltaTime * 0.6)
        if (this.stateTimer >= LAND_TIME) this.enter(StalkerState.RETREAT)
        break
      }
      case StalkerState.RETREAT: {
        if (!player) {
          this.enter(StalkerState.ROAM)
          break
        }
        // Away from the player, out to the circle
        this.tmp.set(this.position.x - player.x, 0, this.position.z - player.z)
        if (this.tmp.lengthSq() < 1e-4) this.tmp.set(Math.cos(this.orbitAngle), 0, Math.sin(this.orbitAngle))
        this.tmp.normalize().multiplyScalar(STALK_RADIUS_MAX + 2).add(player)
        this.tmp.y = this.position.y
        this.walkToward(this.tmp, RETREAT_SPEED, deltaTime, body)
        if (this.stateTimer >= RETREAT_TIME || dist >= STALK_RADIUS_MIN + 1) this.resumeStalking()
        break
      }
    }
    this.speedNow = Math.hypot(body.velocity.x, body.velocity.z)
  }

  /** Spring at the player: a ballistic arc that lands on where they stand. */
  private launch(player: THREE.Vector3, body: { velocity: THREE.Vector3 }): void {
    this.leapDir.set(player.x - this.position.x, 0, player.z - this.position.z)
    const d = this.leapDir.length()
    if (d < 1e-3) this.leapDir.set(Math.sin(this.facing), 0, Math.cos(this.facing))
    else this.leapDir.divideScalar(d)
    const time = Math.min(LEAP_TIME_MAX, Math.max(LEAP_TIME_MIN, d / 12))
    const speed = Math.min(LEAP_SPEED_MAX, d / time)
    const rise = player.y - this.position.y
    body.velocity.x = this.leapDir.x * speed
    body.velocity.z = this.leapDir.z * speed
    body.velocity.y = Math.min(12, Math.max(5, 0.5 * GRAVITY * time + rise / time))
    this.hasBitten = false
    this.enter(StalkerState.LEAP)
  }

  private bite(player: THREE.Vector3): void {
    this.hasBitten = true
    if (!this.playerDamageCallback) return
    this.knockback.set(player.x - this.position.x, 0, player.z - this.position.z)
    if (this.knockback.lengthSq() < 1e-4) this.knockback.copy(this.leapDir)
    this.knockback.normalize().lerp(this.leapDir, 0.5).normalize().multiplyScalar(BITE_KNOCKBACK_H)
    this.knockback.y = BITE_KNOCKBACK_V
    const landed = this.playerDamageCallback(BITE_DAMAGE, this.knockback, 'melee')
    if (landed !== false) playerEffects.apply(StatusEffectIds.SLOWNESS, FROSTBITE_SECONDS, 1)
    // The pounce spends itself on the bite: it drops and turns away
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = -this.leapDir.x * 2
      body.velocity.z = -this.leapDir.z * 2
    }
  }

  /**
   * Walk toward a point, jumping 1-block steps. Returns true when still stuck
   * after a jump (the way is too high) so the caller can change course.
   */
  private walkToward(target: THREE.Vector3, speed: number, deltaTime: number, body: { velocity: THREE.Vector3; isOnGround: boolean }): boolean {
    this.moveDir.set(target.x - this.position.x, 0, target.z - this.position.z)
    const len = this.moveDir.length()
    if (len < 0.4) {
      this.halt(body, deltaTime)
      return false
    }
    this.moveDir.divideScalar(len)
    const stepSpeed = Math.min(speed, len * 2.5)
    body.velocity.x = this.moveDir.x * stepSpeed
    body.velocity.z = this.moveDir.z * stepSpeed
    this.turnToward(target, deltaTime, 7)

    const moved = (this.position.x - this.lastPosition.x) * this.moveDir.x + (this.position.z - this.lastPosition.z) * this.moveDir.z
    if (moved < stepSpeed * deltaTime * 0.2) {
      this.stuckTime += deltaTime
      if (this.stuckTime >= 0.3) {
        this.stuckTime = 0
        if (!this.triedJump && body.isOnGround) {
          body.velocity.y = JUMP_VELOCITY
          this.triedJump = true
        } else if (this.triedJump && body.isOnGround) {
          this.triedJump = false
          return true
        }
      }
    } else {
      this.stuckTime = 0
      if (body.isOnGround) this.triedJump = false
    }
    return false
  }

  private halt(body: { velocity: THREE.Vector3 }, deltaTime: number): void {
    const k = Math.max(0, 1 - deltaTime * 10)
    body.velocity.x *= k
    body.velocity.z *= k
    if (Math.abs(body.velocity.x) < 0.05) body.velocity.x = 0
    if (Math.abs(body.velocity.z) < 0.05) body.velocity.z = 0
  }

  private turnToward(target: THREE.Vector3, deltaTime: number, rate: number): void {
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (dx * dx + dz * dz < 0.01) return
    const want = Math.atan2(dx, dz)
    let delta = want - this.facing
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    this.facing += delta * Math.min(1, deltaTime * rate)
  }

  private horizontalDistanceTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z)
  }

  /** Sampled line from its head to the player's head, free of solid blocks. */
  private hasLineOfSight(player: THREE.Vector3): boolean {
    const solid = this.solidQuery
    if (!solid) return true
    const ox = this.position.x
    const oy = this.position.y + 1.1
    const oz = this.position.z
    const dx = player.x - ox
    const dy = player.y + 1.5 - oy
    const dz = player.z - oz
    const steps = Math.ceil(Math.hypot(dx, dy, dz) / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (solid(Math.floor(ox + dx * t), Math.floor(oy + dy * t), Math.floor(oz + dz * t))) return false
    }
    return true
  }

  // ---- animation ----

  private animate(deltaTime: number): void {
    const k = Math.min(1, deltaTime * 12)
    const ease = (current: number, target: number, rate = k): number => current + (target - current) * rate
    this.idlePhase += deltaTime

    let neckPitch = 0
    let bodyPitch = 0
    let bodyDrop = 0
    let jawOpen = 0
    let tailLift = 0.1
    let tailLash = Math.sin(this.idlePhase * 2.3) * 0.18
    let eye = EYE
    const legs = this.legs
    const lower = this.lowerLegs
    const setLeg = (i: number, upper: number, knee: number, rate = k): void => {
      if (legs[i]) legs[i].rotation.x = ease(legs[i].rotation.x, upper, rate)
      if (lower[i]) lower[i].rotation.x = ease(lower[i].rotation.x, knee, rate)
    }

    switch (this.ai) {
      case StalkerState.WINDUP: {
        // Crouched low on bent legs, rear lifting, tail lashing, eyes flaring
        const p = Math.min(1, this.stateTimer / 0.25)
        bodyDrop = -4 * p
        bodyPitch = 0.05 * p
        neckPitch = 0.3 * p
        jawOpen = 0.15 + 0.1 * Math.sin(this.stateTimer * 30)
        for (const i of [0, 1]) setLeg(i, 0.5 * p, -1.0 * p)
        for (const i of [2, 3]) setLeg(i, -0.4 * p, 0.8 * p)
        tailLift = 0.25
        tailLash = Math.sin(this.stateTimer * 18) * 0.5
        const pulse = 0.5 + 0.5 * Math.sin(this.stateTimer * (10 + this.stateTimer * 14))
        eye = pulse > 0.45 ? EYE_FLARE : EYE
        break
      }
      case StalkerState.LEAP: {
        // Stretched out: forelegs reaching, hind legs trailing, jaws wide
        const body = this.getPhysicsBody()
        const vy = body ? body.velocity.y : 0
        bodyPitch = Math.max(-0.4, Math.min(0.4, -vy * 0.05))
        neckPitch = -0.15
        jawOpen = 0.75
        for (const i of [0, 1]) setLeg(i, -1.15, 0.25, Math.min(1, deltaTime * 20))
        for (const i of [2, 3]) setLeg(i, 1.0, -0.2, Math.min(1, deltaTime * 20))
        tailLift = -0.15
        tailLash = 0
        eye = EYE_FLARE
        break
      }
      case StalkerState.LAND: {
        bodyDrop = -2.5
        neckPitch = 0.2
        for (const i of [0, 1]) setLeg(i, 0.35, -0.6)
        for (const i of [2, 3]) setLeg(i, -0.35, 0.6)
        break
      }
      default: {
        const slinking = this.ai === StalkerState.STALK
        if (this.speedNow > 0.4) {
          // Fast: a bounding gallop; slow: a slinking walk
          const bounding = this.speedNow > 6
          this.walkPhase += deltaTime * (bounding ? 15 : 3 + this.speedNow * 1.8)
          const swing = Math.sin(this.walkPhase) * (bounding ? 0.85 : Math.min(0.65, 0.25 + this.speedNow * 0.09))
          const kneeBend = Math.max(0, Math.sin(this.walkPhase + 1.2))
          if (bounding) {
            setLeg(0, swing, 0.5 * kneeBend, 1)
            setLeg(1, swing * 0.9, 0.5 * kneeBend, 1)
            setLeg(2, -swing, 0.6 * kneeBend, 1)
            setLeg(3, -swing * 0.9, 0.6 * kneeBend, 1)
            bodyPitch = Math.sin(this.walkPhase) * 0.1
          } else {
            setLeg(0, swing, 0.45 * kneeBend, 1)
            setLeg(1, -swing, 0.45 * Math.max(0, -Math.sin(this.walkPhase + 1.2)), 1)
            setLeg(2, -swing, 0.5 * Math.max(0, -Math.sin(this.walkPhase + 1.2)), 1)
            setLeg(3, swing, 0.5 * kneeBend, 1)
          }
          bodyDrop = slinking ? -1.6 : 0
          neckPitch = slinking ? 0.3 : 0.1 + Math.sin(this.walkPhase * 2) * 0.04
          tailLift = slinking ? -0.05 : 0.15
        } else {
          for (let i = 0; i < 4; i++) setLeg(i, 0, 0)
          // Standing: the head lifts and turns, scenting the wind
          neckPitch = this.ai === StalkerState.ROAM ? Math.max(0, Math.sin(this.idlePhase * 0.6)) * -0.4 + 0.15 : 0.25
          bodyDrop = slinking ? -1.2 : 0
        }
        break
      }
    }
    if (this.neck) {
      this.neck.rotation.x = ease(this.neck.rotation.x, neckPitch)
      this.neck.rotation.y = ease(this.neck.rotation.y, this.ai === StalkerState.ROAM ? Math.sin(this.idlePhase * 0.45) * 0.35 : 0)
    }
    if (this.body) {
      this.body.rotation.x = ease(this.body.rotation.x, bodyPitch)
      this.body.position.y = ease(this.body.position.y, bodyDrop * S)
    }
    if (this.jaw) this.jaw.rotation.x = ease(this.jaw.rotation.x, jawOpen, Math.min(1, deltaTime * 18))
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i]
      seg.rotation.x = ease(seg.rotation.x, (i === 0 ? tailLift : 0.12) + Math.sin(this.idlePhase * 1.7 + i) * 0.05)
      seg.rotation.y = tailLash * (0.6 + i * 0.4) * Math.cos(this.idlePhase * 0.9 + i * 0.8)
    }
    if (this.eyeMaterial) this.eyeMaterial.color.setHex(eye)
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
    }
    const fall = Math.min(1, this.deathTimer / DEATH_FALL_TIME)
    const eased = 1 - (1 - fall) * (1 - fall)
    if (this.body) {
      this.body.rotation.z = eased * (Math.PI / 2)
      this.body.position.y = -eased * 0.05
    }
    for (const leg of this.legs) leg.rotation.x *= 0.9
    if (this.jaw) this.jaw.rotation.x += (0.35 - this.jaw.rotation.x) * Math.min(1, deltaTime * 6)
    // The cold light in its eyes goes out
    if (this.eyeMaterial) this.eyeMaterial.color.copy(EYE_COLOR).lerp(EYE_DIM_COLOR, fall)
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    if (this.deathTimer >= DEATH_FALL_TIME + DEATH_LINGER_TIME) this.kill()
  }

  /** The blizzard passed: it turns and lopes off away from the player. */
  private startExit(): void {
    this.exitStarted = true
    const player = this.playerPositionRef
    if (player) this.exitDir.set(this.position.x - player.x, 0, this.position.z - player.z)
    if (!player || this.exitDir.lengthSq() < 1e-4) this.exitDir.set(Math.sin(this.facing), 0, Math.cos(this.facing))
    this.exitDir.normalize()
    playSound('night.vanish', this.soundPos.set(this.position.x, this.position.y + 1, this.position.z))
  }

  /** Lopes away and melts into the snow: the body fades first, the eyes last. */
  private updateExit(progress: number, deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = this.exitDir.x * ROAM_SPEED * 2
      body.velocity.z = this.exitDir.z * ROAM_SPEED * 2
      if (body.isOnGround && Math.abs(this.position.x - this.lastPosition.x) + Math.abs(this.position.z - this.lastPosition.z) < 0.01) {
        body.velocity.y = JUMP_VELOCITY
      }
    }
    this.lastPosition.copy(this.position)
    this.facing = Math.atan2(this.exitDir.x, this.exitDir.z)
    this.speedNow = ROAM_SPEED * 2
    this.ai = StalkerState.ROAM
    this.animate(deltaTime)
    fadeMaterials(this.fadeBody, Math.max(0, 1 - progress / 0.65))
    fadeMaterials(this.fadeEyes, Math.max(0, 1 - Math.max(0, progress - 0.5) / 0.5))
    this.placeMesh()
  }

  // ---- player interaction ----

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying || this.retreat.leaving) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 1
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying || this.retreat.leaving) return false
    this.health -= getPlayerAttackDamage(heldItem)
    const knockback = getPlayerAttackKnockback(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }
    // A blow breaks the crouch or knocks it out of the air: it springs away
    const interrupted = this.ai === StalkerState.WINDUP || this.ai === StalkerState.LEAP
    if (this.ai === StalkerState.ROAM || interrupted) {
      this.pounceCooldown = Math.max(this.pounceCooldown, COOLDOWN_AFTER_MISS)
      this.enter(StalkerState.RETREAT)
    }
    const body = this.getPhysicsBody()
    if (body) {
      this.tmp.set(this.position.x - playerPosition.x, 0, this.position.z - playerPosition.z)
      if (this.tmp.lengthSq() > 1e-4) this.tmp.normalize()
      body.velocity.x = this.tmp.x * HIT_PUSH * knockback
      body.velocity.z = this.tmp.z * HIT_PUSH * knockback
      body.velocity.y = 2.5 * Math.min(1, knockback)
    }
    this.flinchTimer = HIT_FLINCH * Math.min(1, knockback)
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = []
    const count = 1 + (Math.random() < 0.5 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const pelt = createItemFromId('whiteout_pelt')
      if (pelt) drops.push(pelt)
    }
    return drops
  }

  dispose(): void {
    this.body = null
    this.neck = null
    this.jaw = null
    this.tail.length = 0
    this.legs.length = 0
    this.lowerLegs.length = 0
    this.eyeMaterial = null
    this.fadeBody.length = 0
    this.fadeEyes.length = 0
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.solidQuery = null
    super.dispose()
  }
}
