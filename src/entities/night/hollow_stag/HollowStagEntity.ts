import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { GhostAntlerItem } from '../../../items/materials/ghost_antler/GhostAntlerItem.ts'
import { DawnRetreat, fadeMaterials } from '../NightCreature.ts'
import { playEntitySound, playSound } from '../../../audio/SoundHooks.ts'

/** Behaviour states. */
enum StagState {
  /** No player around: grazes and wanders */
  ROAM,
  /** Circles the player at a distance, looking for a clear line */
  STALK,
  /** Telegraph: stops, lowers its antlers and paws the ground */
  WINDUP,
  /** Straight-line charge at where the player stood */
  CHARGE,
  /** Missed: skids to a halt */
  SKID,
  /** Ran into a tree or a cliff: staggering, vulnerable */
  STUNNED,
  /** Connected: slows down, head up */
  RECOVER,
}

// Combat
const MAX_HEALTH = 50
const CHARGE_DAMAGE = 9
const CHARGE_KNOCKBACK_H = 12
const CHARGE_KNOCKBACK_V = 6
const DETECTION_RANGE = 28
const LOSE_RANGE = 40
/** Horizontal reach of the charge, centre to centre. */
const CHARGE_HIT_RADIUS = 1.4
/** Damage taken while stunned. */
const STUNNED_DAMAGE_MULTIPLIER = 1.5

// Movement (blocks/s)
const ROAM_SPEED = 1.6
const STALK_SPEED = 3.4
const CHARGE_SPEED = 14
const STALK_RADIUS_MIN = 12
const STALK_RADIUS_MAX = 18
const JUMP_VELOCITY = 8

// Timing (s)
const WINDUP_TIME = 1.2
/** Paw scrapes per second of telegraph (matches the pawing animation). */
const PAW_RATE = 13 / (Math.PI * 2)
/** The charge homes in on the player only this long, then runs straight. */
const CHARGE_HOMING_TIME = 0.2
const CHARGE_MAX_TIME = 1.4
const SKID_TIME = 0.6
const STUN_TIME = 2.5
const RECOVER_TIME = 0.8
const COOLDOWN_AFTER_MISS = 1.5
const COOLDOWN_AFTER_HIT = 2.5
const COOLDOWN_AFTER_STUN = 2.0
const FIRST_CHARGE_DELAY = 2.0

// Being hit: a heavy beast that barely budges
const HIT_PUSH = 2.5
const HIT_FLINCH = 0.25

// Body (hitbox 1.0 × 1.8 × 1.0)
const HALF_WIDTH = 0.5
/** Probe heights (above the feet) that count as a wall for the charge (a 1-block step is not one). */
const CHEST_PROBES = [1.2, 1.7] as const
/** A charge making less than this share of its speed for this long has hit something. */
const BLOCKED_RATIO = 0.4
const BLOCKED_TIME = 0.08
/** How far ahead of its centre the charge looks for walls and steps, and across its width. */
const WALL_REACH = HALF_WIDTH + 0.35
const STEP_REACH = HALF_WIDTH + 0.45
const PROBE_SIDES = [-0.4, 0, 0.4] as const

// Death and dawn
const DEATH_FALL_TIME = 0.7
const DEATH_LINGER_TIME = 1.0
const DAWN_EXIT_TIME = 2.4

// Colours: mangy charcoal-umber fur, bleached skull, cold blue light, moss
const FUR = 0x352d27
const FUR_DARK = 0x1a1613
const FUR_UMBER = 0x433427
const BONE = 0xe3dccb
const BONE_SHADE = 0xb9b09c
const ANTLER = 0xcfc5ae
const ANTLER_BASE = 0x8d8372
const SOCKET = 0x0b0c0f
const HOOF = 0x15120f
const MOSS = 0x5a7d37
const MOSS_DARK = 0x334a20
const GLOW = 0xa6dcff
const GLOW_FLARE = 0xf0fbff
const GLOW_DIM = 0x24323e
const RIB_GLOW = 0x5d9fd6

const GLOW_DIM_COLOR = new THREE.Color(GLOW_DIM)

const S = 0.0625 // 1 "pixel" = 1/16 block

/**
 * Hollow Stag - a huge, gaunt stag of the pine forests that walks only at
 * night: a bleached skull for a face with cold blue pinpoints in its empty
 * sockets, vast moss-hung antlers tipped with pale light, and a hollow in its
 * mangy flank where a faint blue glow shows between the ribs. In the dark you
 * see the lights and the skull long before the beast.
 *
 * It keeps its distance, circling through the trees. When it has a clear line
 * to the player it stops, lowers its antlers and paws the ground (the glow
 * flares - a 1.2 s warning), then charges in a straight line at where the
 * player stood: a hit tramples for heavy damage and hurls the player away.
 * A missed charge skids out; a charge into a tree trunk or a cliff slams it
 * to a stagger, stunned for 2.5 s and taking extra damage - keep a tree
 * between you and the stag.
 *
 * Stats: 50 HP, 9 damage + heavy knockback, 28 block detection, 14 blocks/s
 * charge; +50% damage taken while stunned.
 * Drops: 1 ghost antler, 0-2 bones.
 */
export class HollowStagEntity extends Entity {
  readonly type = 'hollow_stag'

  private ai = StagState.ROAM
  private stateTimer = 0
  private health = MAX_HEALTH
  private chargeCooldown = FIRST_CHARGE_DELAY
  private flinchTimer = 0
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false
  private readonly dawn = new DawnRetreat(DAWN_EXIT_TIME)

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  private readonly moveDir = new THREE.Vector3()
  private readonly chargeDir = new THREE.Vector3()
  private readonly roamTarget = new THREE.Vector3()
  private readonly lastPosition = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly knockback = new THREE.Vector3()
  private orbitAngle = Math.random() * Math.PI * 2
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  private orbitRadius = STALK_RADIUS_MIN + Math.random() * (STALK_RADIUS_MAX - STALK_RADIUS_MIN)
  private stuckTime = 0
  private triedJump = false
  private blockedTime = 0
  private pawScrapes = 0
  private vanishPlayed = false
  private readonly soundPos = new THREE.Vector3()
  private facing = Math.random() * Math.PI * 2

  // Animation
  private walkPhase = Math.random() * Math.PI * 2
  private idlePhase = Math.random() * Math.PI * 2
  private speedNow = 0

  // Mesh parts
  private body: THREE.Group | null = null
  private neck: THREE.Group | null = null
  private tail: THREE.Group | null = null
  private readonly legs: THREE.Group[] = []
  private glowMaterial: THREE.MeshBasicMaterial | null = null
  private ribGlowMaterial: THREE.MeshBasicMaterial | null = null
  /** What dissolves at dawn: the (merged) body materials, then the lights. */
  private readonly fadeBody: THREE.Material[] = []
  private readonly fadeLights: THREE.Material[] = []

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('hollow_stag', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(HALF_WIDTH * 2, 1.8, HALF_WIDTH * 2),
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
    const furDark = new THREE.MeshLambertMaterial({ color: FUR_DARK })
    const furUmber = new THREE.MeshLambertMaterial({ color: FUR_UMBER })
    const bone = new THREE.MeshLambertMaterial({ color: BONE })
    const boneShade = new THREE.MeshLambertMaterial({ color: BONE_SHADE })
    const antler = new THREE.MeshLambertMaterial({ color: ANTLER })
    const antlerBase = new THREE.MeshLambertMaterial({ color: ANTLER_BASE })
    const socket = new THREE.MeshLambertMaterial({ color: SOCKET })
    const hoof = new THREE.MeshLambertMaterial({ color: HOOF })
    const moss = new THREE.MeshLambertMaterial({ color: MOSS })
    const mossDark = new THREE.MeshLambertMaterial({ color: MOSS_DARK })
    for (const m of [fur, furDark, furUmber, bone, boneShade, antler, antlerBase, socket, hoof, moss, mossDark]) {
      this.registerMaterialForLighting(m)
    }
    // Cold light stays full-bright: eye pinpoints and antler tips, and the hollow
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: GLOW })
    this.ribGlowMaterial = new THREE.MeshBasicMaterial({ color: RIB_GLOW })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Legs: long and thin, pivoting at the hips/shoulders (y 15), dark hooves
    const legSpots: Array<[number, number, number]> = [
      [-3.1, 7, 16], // front left
      [3.1, 7, 16], // front right
      [-2.9, -7, 15], // back left
      [2.9, -7, 15], // back right
    ]
    for (const [x, z, top] of legSpots) {
      const leg = new THREE.Group()
      leg.position.set(x * S, top * S, z * S)
      box(2.6, 4, 3, fur, 0, -1.5, 0, leg) // upper leg / haunch
      box(1.7, top - 2.5, 1.7, furDark, 0, -(top - 2.5) / 2 - 2, 0, leg)
      box(2.1, 1.5, 2.1, boneShade, 0, -top * 0.56, 0.1, leg) // bony knee
      box(2.2, 1.6, 2.6, hoof, 0, -top + 0.8, 0.3, leg)
      body.add(leg)
      this.legs.push(leg)
    }

    // Torso: gaunt, the back sloping down toward the hips
    box(10.4, 9, 11, fur, 0, 20.5, 3, body) // chest and shoulders
    box(9.2, 8, 10, fur, 0, 19.5, -5, body) // flank and hips
    box(8.4, 2, 18, furUmber, 0, 24.6, -0.5, body) // back
    box(9.4, 2, 7, furDark, 0, 15.6, 4, body) // brisket
    box(8, 2, 8, furDark, 0, 15.8, -5, body) // belly
    // Mangy patches
    box(0.4, 3, 4, furUmber, -4.7, 21, -6, body)
    box(0.4, 2, 3, furDark, 4.7, 18, -7, body)
    box(3, 0.4, 3, furDark, 1.5, 25.7, -6, body)
    // Spine ridge: bony knuckles along the back
    for (const z of [-7, -4, -1, 2, 5]) box(1.6, 1.2, 1.4, boneShade, 0, 26.1, z, body)
    // The hollow: the left and right flank open on a cold glow between bare ribs
    for (const side of [-1, 1]) {
      box(0.4, 5.5, 7, socket, side * 5.25, 20, 1.5, body)
      box(0.3, 4.2, 5.8, this.ribGlowMaterial, side * 5.45, 20.2, 1.5, body)
      for (const z of [-1.6, 0.4, 2.4, 4.4]) box(0.6, 6, 0.9, bone, side * 5.65, 20.3, z, body)
      box(0.6, 0.9, 7.6, boneShade, side * 5.65, 23.4, 1.5, body) // spine-side rib root
    }
    // Shaggy mane hanging under the neck root, moss on the shoulders
    for (const [x, z, h] of [[-2, 8.4, 5], [0, 8.8, 6], [2, 8.4, 5], [-1, 7.6, 4], [1.2, 7.4, 4.5]] as const) {
      box(1.6, h, 1.4, furDark, x, 17.5 - h / 2 + 2, z, body)
    }
    box(4, 1, 3, moss, -2.5, 25.7, 3, body)
    box(2.5, 1, 4, mossDark, 2.6, 25.6, 0, body)
    box(0.5, 3, 1.5, moss, -5.4, 23, 6.5, body)

    // Tail: a ragged dark tuft
    const tail = new THREE.Group()
    tail.position.set(0, 23.5 * S, -10 * S)
    box(2.2, 4, 1.6, furDark, 0, -1.6, -0.4, tail)
    body.add(tail)
    this.tail = tail

    // Neck: pivots at the top-front of the chest; the head rides on it
    const neck = new THREE.Group()
    neck.position.set(0, 22 * S, 8 * S)
    body.add(neck)
    this.neck = neck
    const neckCol = new THREE.Group()
    neckCol.rotation.x = 0.45 // reaching up and forward
    neck.add(neckCol)
    box(5, 10.5, 5.6, fur, 0, 4.6, 0.5, neckCol)
    box(4, 9.5, 1.4, furDark, 0, 4.2, -2.5, neckCol) // mane along the nape
    box(3.6, 7, 1.6, furUmber, 0, 3.5, 3.4, neckCol) // throat

    // Skull: a bleached deer skull - long tapering muzzle, hollow sockets
    // set wide above it, each holding a cold pinpoint
    const head = new THREE.Group()
    head.position.set(0, 9.5 * S, 1 * S)
    head.rotation.x = -0.45 // level the face again
    head.scale.setScalar(1.15)
    neckCol.add(head)
    box(5, 5.5, 5, bone, 0, 1.75, 0, head) // cranium
    box(3.8, 3.2, 3.6, bone, 0, 0.6, 4.2, head) // muzzle
    box(3, 2.6, 3.2, bone, 0, 0.2, 7.4, head) // muzzle tip
    box(3, 1.2, 6, boneShade, 0, -1.7, 5.2, head) // lower jaw
    for (const side of [-1, 1]) box(0.5, 0.9, 0.3, socket, side * 0.55, 0.6, 9.05, head) // nostrils
    box(0.4, 2.4, 3.2, boneShade, 0.8, 4.4, 0.2, head) // crack along the brow
    box(3.2, 0.4, 0.4, boneShade, 0, 2.4, 5.9, head) // suture
    for (const side of [-1, 1]) {
      // Orbits open to the front and to the side, a pinpoint deep in each
      box(1.5, 1.9, 2, socket, side * 1.6, 2.75, 2.7, head)
      box(0.4, 1.7, 1.9, socket, side * 2.45, 2.75, 1.7, head)
      box(0.7, 0.7, 0.3, this.glowMaterial, side * 1.6, 2.7, 3.75, head)
      box(0.3, 0.7, 0.7, this.glowMaterial, side * 2.6, 2.7, 1.9, head)
      box(0.4, 1, 3.4, boneShade, side * 1.75, -0.4, 4.6, head) // cheek line
    }

    // Antlers: a great beam sweeping up and out on each side with a brow,
    // bez and trez tine forward and a three-pointed crown; every tip lit.
    // Moss hangs off them in strands.
    const tip = (x: number, y: number, z: number, parent: THREE.Object3D): void => {
      box(1.1, 1.1, 1.1, this.glowMaterial!, x, y, z, parent)
    }
    const tine = (parent: THREE.Object3D, y: number, rx: number, rz: number, len: number): THREE.Group => {
      const t = new THREE.Group()
      t.position.set(0, y * S, 0)
      t.rotation.set(rx, 0, rz)
      parent.add(t)
      box(0.9, len, 0.9, antler, 0, len / 2, 0, t)
      tip(0, len + 0.3, 0, t)
      return t
    }
    const strand = (parent: THREE.Object3D, side: number, y: number, len: number, m: THREE.Material, dz: number): void => {
      // Counter the beam's tilt so the moss hangs roughly straight down
      const g = new THREE.Group()
      g.position.set(0, y * S, dz * S)
      g.rotation.set(0.3, 0, side * 0.72)
      parent.add(g)
      box(0.6, len, 0.6, m, 0, -len / 2, 0, g)
    }
    for (const side of [-1, 1]) {
      const beam = new THREE.Group()
      beam.position.set(side * 1.7 * S, 4.2 * S, -0.6 * S)
      beam.rotation.z = -side * 0.72
      beam.rotation.x = -0.3
      head.add(beam)
      box(1.7, 2, 1.7, antlerBase, 0, 0.6, 0, beam) // burr
      box(1.3, 13, 1.3, antler, 0, 7.5, 0, beam) // main beam
      tine(beam, 2.4, 1.25, 0, 5.2) // brow
      tine(beam, 4.6, 0.95, side * 0.15, 4.2) // bez
      tine(beam, 8, 0.7, 0, 4.6) // trez
      // Crown at the top of the beam: up-in, outward and back
      tine(beam, 13.2, 0.15, side * 0.35, 4)
      tine(beam, 12.4, 0, -side * 0.85, 4.6)
      tine(beam, 12, -0.7, 0, 3.6)
      strand(beam, side, 3.5, 4.5, moss, 0.7)
      strand(beam, side, 7.5, 3.5, mossDark, -0.7)
      strand(beam, side, 11, 5, moss, 0.6)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, neck, this.tail, ...this.legs],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const material = mesh.material as THREE.Material
      const list = material === this.glowMaterial || material === this.ribGlowMaterial ? this.fadeLights : this.fadeBody
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

    const exit = this.dawn.update(deltaTime)
    if (exit > 0) {
      if (!this.vanishPlayed) {
        this.vanishPlayed = true
        playSound('night.vanish', this.soundPos.set(this.position.x, this.position.y + 1.2, this.position.z))
      }
      this.updateDawnExit(exit, deltaTime)
      if (exit >= 1) this.kill()
      return
    }

    this.stateTimer += deltaTime
    this.chargeCooldown = Math.max(0, this.chargeCooldown - deltaTime)
    if (this.flinchTimer > 0) {
      // Rocked by a blow: the push plays out, no steering
      this.flinchTimer -= deltaTime
    } else {
      this.think(deltaTime)
    }

    this.lastPosition.copy(this.position)
    this.animate(deltaTime)
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

  private enter(state: StagState): void {
    this.ai = state
    this.stateTimer = 0
    this.stuckTime = 0
    this.triedJump = false
    this.blockedTime = 0
    this.pawScrapes = 0
  }

  private think(deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (!body) return
    const player = this.playerPositionRef
    const dist = player ? this.horizontalDistanceTo(player) : Infinity

    switch (this.ai) {
      case StagState.ROAM: {
        if (player && dist <= DETECTION_RANGE && Math.abs(player.y - this.position.y) < 16) {
          this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
          this.enter(StagState.STALK)
          break
        }
        if (this.stateTimer > 6 || this.horizontalDistanceTo(this.roamTarget) < 1) {
          this.stateTimer = 0
          const angle = Math.random() * Math.PI * 2
          const reach = 5 + Math.random() * 9
          this.roamTarget.set(this.position.x + Math.cos(angle) * reach, this.position.y, this.position.z + Math.sin(angle) * reach)
        }
        // Pauses to stand and look about between strolls
        if (this.stateTimer < 2.5) this.walkToward(this.roamTarget, ROAM_SPEED, deltaTime, body)
        else this.halt(body, deltaTime)
        break
      }
      case StagState.STALK: {
        if (!player || dist > LOSE_RANGE) {
          this.enter(StagState.ROAM)
          break
        }
        // Circle the player at a distance
        this.orbitAngle += this.orbitDir * deltaTime * (STALK_SPEED / this.orbitRadius) * 0.8
        this.tmp.set(
          player.x + Math.cos(this.orbitAngle) * this.orbitRadius,
          this.position.y,
          player.z + Math.sin(this.orbitAngle) * this.orbitRadius
        )
        // Close the distance faster when far off, back away when crowded
        const speed = dist > STALK_RADIUS_MAX + 4 ? STALK_SPEED * 1.4 : STALK_SPEED
        if (this.walkToward(this.tmp, speed, deltaTime, body)) {
          // Blocked even after a jump: circle the other way round
          this.orbitDir = -this.orbitDir
        }
        if (this.chargeCooldown <= 0 && dist <= DETECTION_RANGE && this.hasLineOfSight(player)) {
          this.enter(StagState.WINDUP)
        }
        break
      }
      case StagState.WINDUP: {
        this.halt(body, deltaTime)
        if (!player || dist > LOSE_RANGE) {
          this.enter(StagState.ROAM)
          break
        }
        // Keep the antlers on the player until the moment it goes
        this.turnToward(player, deltaTime, 7)
        // A scrape each time the hoof rakes back
        const scrapes = Math.floor(this.stateTimer * PAW_RATE + 0.5)
        if (scrapes > this.pawScrapes) {
          this.pawScrapes = scrapes
          playSound('night.hoof', this.soundPos.set(
            this.position.x + Math.sin(this.facing) * 0.5,
            this.position.y,
            this.position.z + Math.cos(this.facing) * 0.5
          ))
        }
        if (this.stateTimer >= WINDUP_TIME) {
          this.chargeDir.set(player.x - this.position.x, 0, player.z - this.position.z)
          if (this.chargeDir.lengthSq() < 1e-4) this.chargeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing))
          this.chargeDir.normalize()
          this.enter(StagState.CHARGE)
          playEntitySound('hollow_stag', 'idle', this.soundPos.set(this.position.x, this.position.y + 1.6, this.position.z))
        }
        break
      }
      case StagState.CHARGE: {
        if (player && this.stateTimer < CHARGE_HOMING_TIME) {
          this.tmp.set(player.x - this.position.x, 0, player.z - this.position.z)
          if (this.tmp.lengthSq() > 1) this.chargeDir.lerp(this.tmp.normalize(), Math.min(1, deltaTime * 6)).normalize()
        }
        this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z)
        if (player && dist <= CHARGE_HIT_RADIUS && Math.abs(player.y - this.position.y) < 2) {
          this.trample(player)
          this.chargeCooldown = COOLDOWN_AFTER_HIT
          this.enter(StagState.RECOVER)
          break
        }
        // A low step only trips it into a bound (it stalls at the face until
        // its hooves clear it); anything taller brings it up short: a wall at
        // chest height, or the body stopped dead on the ground
        const step = this.stepAhead()
        if (body.isOnGround && step) body.velocity.y = JUMP_VELOCITY
        const moved = (this.position.x - this.lastPosition.x) * this.chargeDir.x + (this.position.z - this.lastPosition.z) * this.chargeDir.z
        if (this.stateTimer > 0.1 && body.isOnGround && !step && moved < CHARGE_SPEED * deltaTime * BLOCKED_RATIO) this.blockedTime += deltaTime
        else this.blockedTime = 0
        if (this.wallAhead() || this.blockedTime >= BLOCKED_TIME) {
          // Antlers first into the trunk: stunned
          playSound('night.slam', this.soundPos.set(
            this.position.x + this.chargeDir.x * WALL_REACH,
            this.position.y + 1.4,
            this.position.z + this.chargeDir.z * WALL_REACH
          ))
          body.velocity.x = -this.chargeDir.x * 2
          body.velocity.z = -this.chargeDir.z * 2
          body.velocity.y = 2.5
          this.chargeCooldown = COOLDOWN_AFTER_STUN
          this.enter(StagState.STUNNED)
          break
        }
        body.velocity.x = this.chargeDir.x * CHARGE_SPEED
        body.velocity.z = this.chargeDir.z * CHARGE_SPEED
        if (this.stateTimer >= CHARGE_MAX_TIME) {
          this.chargeCooldown = COOLDOWN_AFTER_MISS
          this.enter(StagState.SKID)
        }
        break
      }
      case StagState.SKID: {
        const k = Math.max(0, 1 - this.stateTimer / SKID_TIME)
        body.velocity.x = this.chargeDir.x * CHARGE_SPEED * 0.6 * k * k
        body.velocity.z = this.chargeDir.z * CHARGE_SPEED * 0.6 * k * k
        if (this.stateTimer >= SKID_TIME) {
          if (player) this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
          this.enter(player ? StagState.STALK : StagState.ROAM)
        }
        break
      }
      case StagState.STUNNED: {
        if (body.isOnGround) this.halt(body, deltaTime)
        if (this.stateTimer >= STUN_TIME) {
          if (player) this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
          this.enter(player ? StagState.STALK : StagState.ROAM)
        }
        break
      }
      case StagState.RECOVER: {
        const k = Math.max(0, 1 - this.stateTimer / RECOVER_TIME)
        body.velocity.x = this.chargeDir.x * CHARGE_SPEED * 0.4 * k
        body.velocity.z = this.chargeDir.z * CHARGE_SPEED * 0.4 * k
        if (this.stateTimer >= RECOVER_TIME) {
          if (player) this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
          this.enter(player ? StagState.STALK : StagState.ROAM)
        }
        break
      }
    }
    this.speedNow = Math.hypot(body.velocity.x, body.velocity.z)
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
    const stepSpeed = Math.min(speed, len * 2)
    body.velocity.x = this.moveDir.x * stepSpeed
    body.velocity.z = this.moveDir.z * stepSpeed
    this.turnToward(target, deltaTime, 5)

    // Stuck: no progress along the way we want to go
    const moved = (this.position.x - this.lastPosition.x) * this.moveDir.x + (this.position.z - this.lastPosition.z) * this.moveDir.z
    if (moved < stepSpeed * deltaTime * 0.2) {
      this.stuckTime += deltaTime
      if (this.stuckTime >= 0.35) {
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

  /** A solid block at chest or head height just ahead of the charge, across the body's width. */
  private wallAhead(): boolean {
    const solid = this.solidQuery
    if (!solid) return false
    for (const side of PROBE_SIDES) {
      const x = this.position.x + this.chargeDir.x * WALL_REACH - this.chargeDir.z * side
      const z = this.position.z + this.chargeDir.z * WALL_REACH + this.chargeDir.x * side
      for (const h of CHEST_PROBES) {
        if (solid(Math.floor(x), Math.floor(this.position.y + h), Math.floor(z))) return true
      }
    }
    return false
  }

  /** A 1-block step at the hooves just ahead (anywhere across the body), clear above it. */
  private stepAhead(): boolean {
    const solid = this.solidQuery
    if (!solid) return false
    const y = Math.floor(this.position.y + 0.3)
    for (const side of PROBE_SIDES) {
      const x = Math.floor(this.position.x + this.chargeDir.x * STEP_REACH - this.chargeDir.z * side)
      const z = Math.floor(this.position.z + this.chargeDir.z * STEP_REACH + this.chargeDir.x * side)
      if (solid(x, y, z) && !solid(x, y + 1, z)) return true
    }
    return false
  }

  /** Sampled line from the stag's head to the player's head, free of solid blocks. */
  private hasLineOfSight(player: THREE.Vector3): boolean {
    const solid = this.solidQuery
    if (!solid) return true
    const ox = this.position.x
    const oy = this.position.y + 1.6
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

  private trample(player: THREE.Vector3): void {
    if (!this.playerDamageCallback) return
    this.knockback.set(player.x - this.position.x, 0, player.z - this.position.z)
    // Thrown along the charge, a little to the side it was struck from
    if (this.knockback.lengthSq() < 1e-4) this.knockback.copy(this.chargeDir)
    this.knockback.normalize().lerp(this.chargeDir, 0.6).normalize()
    this.knockback.multiplyScalar(CHARGE_KNOCKBACK_H)
    this.knockback.y = CHARGE_KNOCKBACK_V
    this.playerDamageCallback(CHARGE_DAMAGE, this.knockback, 'melee')
  }

  // ---- animation ----

  private animate(deltaTime: number): void {
    const k = Math.min(1, deltaTime * 10)
    const ease = (current: number, target: number, rate = k): number => current + (target - current) * rate
    this.idlePhase += deltaTime

    // Neck pitch: lowered for the charge, raised to watch while stalking
    let neckPitch = 0
    let neckRoll = 0
    let bodyPitch = 0
    let bodyRoll = 0
    let glow = GLOW
    const legs = this.legs
    switch (this.ai) {
      case StagState.WINDUP: {
        const p = Math.min(1, this.stateTimer / 0.35)
        neckPitch = 1.15 * p
        bodyPitch = -0.08 * p
        // Front right hoof paws the ground: lifted forward, then raked back
        const paw = Math.sin(this.stateTimer * 13)
        if (legs[1]) legs[1].rotation.x = ease(legs[1].rotation.x, -0.55 + paw * 0.5, Math.min(1, deltaTime * 20))
        for (const i of [0, 2, 3]) if (legs[i]) legs[i].rotation.x = ease(legs[i].rotation.x, i < 2 ? -0.1 : 0.15)
        // The tips flare in a quickening pulse
        const pulse = 0.5 + 0.5 * Math.sin(this.stateTimer * (8 + this.stateTimer * 10))
        glow = pulse > 0.5 ? GLOW_FLARE : GLOW
        break
      }
      case StagState.CHARGE: {
        neckPitch = 1.2
        bodyPitch = 0.1
        // Gallop: front pair together, back pair together
        this.walkPhase += deltaTime * 17
        const gallop = Math.sin(this.walkPhase) * 0.7
        if (legs[0]) legs[0].rotation.x = gallop
        if (legs[1]) legs[1].rotation.x = gallop * 0.9
        if (legs[2]) legs[2].rotation.x = -gallop
        if (legs[3]) legs[3].rotation.x = -gallop * 0.9
        glow = GLOW_FLARE
        break
      }
      case StagState.SKID: {
        // Braced: forelegs planted forward, leaning back
        neckPitch = 0.5
        bodyPitch = -0.12
        for (const i of [0, 1]) if (legs[i]) legs[i].rotation.x = ease(legs[i].rotation.x, -0.6)
        for (const i of [2, 3]) if (legs[i]) legs[i].rotation.x = ease(legs[i].rotation.x, 0.35)
        break
      }
      case StagState.STUNNED: {
        // Head hanging, swaying drunkenly, legs splayed, the lights out
        neckPitch = 1.35
        const sway = Math.sin(this.stateTimer * 4.2)
        neckRoll = sway * 0.3
        bodyRoll = sway * 0.08
        if (legs[0]) legs[0].rotation.z = ease(legs[0].rotation.z, 0.18)
        if (legs[1]) legs[1].rotation.z = ease(legs[1].rotation.z, -0.18)
        for (const leg of legs) leg.rotation.x = ease(leg.rotation.x, 0)
        glow = GLOW_DIM
        break
      }
      default: {
        // Walking, standing, watching
        if (this.speedNow > 0.4) {
          this.walkPhase += deltaTime * (3 + this.speedNow * 1.6)
          const swing = Math.sin(this.walkPhase) * Math.min(0.6, 0.2 + this.speedNow * 0.1)
          if (legs[0]) legs[0].rotation.x = swing
          if (legs[1]) legs[1].rotation.x = -swing
          if (legs[2]) legs[2].rotation.x = -swing
          if (legs[3]) legs[3].rotation.x = swing
          neckPitch = 0.08 + Math.sin(this.walkPhase * 2) * 0.04
        } else {
          for (const leg of legs) leg.rotation.x = ease(leg.rotation.x, 0)
          // Standing: the head lifts and slowly turns, as if scenting the dark
          neckPitch = this.ai === StagState.ROAM ? Math.max(0, Math.sin(this.idlePhase * 0.5)) * 0.6 - 0.1 : -0.12
          neckRoll = Math.sin(this.idlePhase * 0.7) * 0.12
        }
        for (const leg of legs) leg.rotation.z = ease(leg.rotation.z, 0)
        break
      }
    }
    if (this.ai !== StagState.STUNNED) for (const leg of legs) leg.rotation.z = ease(leg.rotation.z, 0)
    if (this.neck) {
      this.neck.rotation.x = ease(this.neck.rotation.x, neckPitch)
      this.neck.rotation.z = ease(this.neck.rotation.z, neckRoll)
    }
    if (this.body) {
      this.body.rotation.x = ease(this.body.rotation.x, bodyPitch)
      this.body.rotation.z = ease(this.body.rotation.z, bodyRoll)
    }
    if (this.tail) this.tail.rotation.x = 0.25 + Math.sin(this.idlePhase * 3.1) * 0.12
    if (this.glowMaterial) this.glowMaterial.color.setHex(glow)
    if (this.ribGlowMaterial) {
      const breathe = this.ai === StagState.STUNNED ? 0.35 : 0.75 + 0.25 * Math.sin(this.idlePhase * 1.7)
      this.ribGlowMaterial.color.setHex(RIB_GLOW).multiplyScalar(breathe)
    }
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
      this.body.position.y = -eased * 0.1
    }
    for (const leg of this.legs) leg.rotation.x *= 0.9
    if (this.neck) this.neck.rotation.x += (0.6 - this.neck.rotation.x) * Math.min(1, deltaTime * 6)
    // The cold light goes out as it falls
    if (this.glowMaterial) this.glowMaterial.color.setHex(GLOW).lerp(GLOW_DIM_COLOR, fall)
    if (this.ribGlowMaterial) this.ribGlowMaterial.color.setHex(RIB_GLOW).multiplyScalar(1 - fall * 0.85)
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    if (this.deathTimer >= DEATH_FALL_TIME + DEATH_LINGER_TIME) this.kill()
  }

  /** Dawn: the stag stops, lifts its head and dissolves into mist; its lights go last. */
  private updateDawnExit(progress: number, deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = true
      body.velocity.set(0, 0, 0)
    }
    this.position.y += deltaTime * 0.35
    if (body) body.position.copy(this.position)
    const bodyFade = Math.max(0, 1 - progress / 0.7)
    const lightFade = Math.max(0, 1 - Math.max(0, progress - 0.45) / 0.55)
    fadeMaterials(this.fadeBody, bodyFade)
    fadeMaterials(this.fadeLights, lightFade)
    if (this.neck) this.neck.rotation.x += (-0.35 - this.neck.rotation.x) * Math.min(1, deltaTime * 3)
    for (const leg of this.legs) leg.rotation.x *= 0.92
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
      // Mist spreading as it thins
      mesh.scale.setScalar(1 + progress * 0.12)
    }
  }

  // ---- player interaction ----

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying || this.dawn.leaving) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 1
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying || this.dawn.leaving) return false
    const stunned = this.ai === StagState.STUNNED
    this.health -= getPlayerAttackDamage(heldItem) * (stunned ? STUNNED_DAMAGE_MULTIPLIER : 1)
    const knockback = getPlayerAttackKnockback(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }
    // Woken from its roaming by the blow
    if (this.ai === StagState.ROAM) this.enter(StagState.STALK)
    // A charge or a telegraph shrugs the blow off; otherwise it gives a little ground
    if (this.ai === StagState.STALK || this.ai === StagState.ROAM || stunned) {
      const body = this.getPhysicsBody()
      if (body) {
        this.tmp.set(this.position.x - playerPosition.x, 0, this.position.z - playerPosition.z)
        if (this.tmp.lengthSq() > 1e-4) this.tmp.normalize()
        body.velocity.x = this.tmp.x * HIT_PUSH * knockback
        body.velocity.z = this.tmp.z * HIT_PUSH * knockback
        body.velocity.y = 1.5 * Math.min(1, knockback)
      }
      if (!stunned) this.flinchTimer = HIT_FLINCH * Math.min(1, knockback)
    }
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = [new GhostAntlerItem()]
    const bones = Math.floor(Math.random() * 3)
    for (let i = 0; i < bones; i++) drops.push(new BoneItem())
    return drops
  }

  dispose(): void {
    this.body = null
    this.neck = null
    this.tail = null
    this.legs.length = 0
    this.glowMaterial = null
    this.ribGlowMaterial = null
    this.fadeBody.length = 0
    this.fadeLights.length = 0
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.solidQuery = null
    super.dispose()
  }
}
