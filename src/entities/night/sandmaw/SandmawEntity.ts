import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { BlockIds } from '../../../world/blocks/BlockIds.ts'
import { BlockRegistry } from '../../../world/blocks/BlockRegistry.ts'
import { SandmawFangItem } from '../../../items/materials/sandmaw_fang/SandmawFangItem.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { DawnRetreat } from '../NightCreature.ts'
import { playSound } from '../../../audio/SoundHooks.ts'

/** Behaviour states. */
type SandmawState =
  /** Gliding under the dunes, no prey */
  | 'roam'
  /** Circling the player under the sand, spines showing */
  | 'circle'
  /** Sinking out of sight before a strike */
  | 'dive'
  /** Sand churns where the player stood: the strike is coming */
  | 'telegraph'
  /** Bursting straight up out of the sand, maw open */
  | 'erupt'
  /** Reared up out of the sand - the window to hit it */
  | 'surfaced'
  /** Sliding back down into the sand */
  | 'sink'

// Combat
const MAX_HEALTH = 36
const BITE_DAMAGE = 8
const DETECTION_RANGE = 24
const LOSE_RANGE = 34
/** Horizontal reach of an eruption from its centre. */
const STRIKE_RADIUS = 1.35
/** A player this high above the sand (a jump) is still caught. */
const STRIKE_HEIGHT = 2.4
/** The bite lands during the first part of the rise. */
const STRIKE_WINDOW = 0.2
const LAUNCH_UP = 9
const LAUNCH_OUT = 2.5

// Movement (blocks/s) and timings (s)
const ROAM_SPEED = 2.2
const CIRCLE_SPEED = 5.5
const ORBIT_RADIUS_MIN = 6
const ORBIT_RADIUS_MAX = 8
const DIVE_TIME = 0.45
const TELEGRAPH_TIME = 0.9
const RISE_TIME = 0.32
const SURFACED_TIME = 2.5
const SINK_TIME = 0.55
const ATTACK_COOLDOWN_MIN = 3.2
const ATTACK_COOLDOWN_MAX = 4.8
const DEATH_DURATION = 1.8
const EXIT_DURATION = 2.4
/** Steepest step it follows under the sand per move. */
const MAX_STEP = 2

// Colours: ochre armour plates with dark bands, pale belly, dark spines with
// bone tips, a blood-red ringed throat, glowing orange sensory pits
const PLATE = 0xb8864a
const BAND = 0x6e4a26
const BELLY = 0xd8bf8e
const SPINE = 0x4a3420
const SPINE_TIP = 0xe9dcc0
const THROAT = 0x6a1c1c
const TOOTH = 0xf0e6cc
const PIT_GLOW = 0xff8a2a
const SAND = 0xd9ba84
const SAND_DARK = 0xc2a06c

const S = 0.0625 // 1 "pixel" = 1/16 block

/** Body links from the tail tip to the neck: cross-section and dorsal spine height (px). */
const SECTIONS = [6, 8, 10, 12, 14, 15]
const SPINE_HEIGHTS = [4, 6, 8, 9, 9, 8]
const SEG_LEN = 6
const HEAD_SECTION = 16
const HEAD_LEN = 10
const JAW_LEN = 7
/** Full body length, tail tip to closed jaw tips (blocks). */
const BODY_LENGTH = (SECTIONS.length * SEG_LEN + HEAD_LEN + JAW_LEN) * S
/** Body axis below the sand surface while hunting: only the spine tips show. */
const SWIM_AXIS = -0.5
/** Extra depth that hides the spines too. */
const HIDE_DEPTH = 0.65
/** Length left under the sand when fully reared up. */
const BURIED_LENGTH = 0.7
/** Forward arch of each link (tail → neck) when reared up. */
const ARCH = [0, 0, 0.06, 0.14, 0.2, 0.24]
/** Jaw petal angles: closed (tilted inward) and open (flared outward). */
const JAW_CLOSED = 0.32
const JAW_OPEN = 1.05
const CHURN_CUBES = 12
const CHURN_RADIUS = 0.85

const SAND_IDS: ReadonlySet<number> = new Set([BlockIds.SAND, BlockIds.SANDSTONE])

/**
 * Sandmaw - a blind, eel-like burrower of the desert night, three blocks of
 * banded ochre armour behind a round lamprey maw that opens in four toothed
 * petals. It swims under the sand: all you see is a ridge of dark spines
 * gliding through the dunes, circling.
 *
 * It strikes only where its prey stands on sand. It dives out of sight, the
 * sand under the player's feet starts to churn and rumble, and a moment later
 * it bursts straight up from that spot, maw open - biting and flinging
 * whoever is still standing there into the air. Step off the churning ring to
 * dodge. Then it rears there, arched over the dunes, for a few seconds (the
 * only time it can be hit) before sliding back under. Stand on stone or your
 * own blocks and it can only circle and wait.
 *
 * Stats: 36 HP, 8 damage + launch, 24 block detection.
 * Drops: 1-2 sandmaw fangs, 0-2 bones.
 */
export class SandmawEntity extends Entity {
  readonly type = 'sandmaw'

  private ai: SandmawState = 'roam'
  private stateTime = 0
  private health = MAX_HEALTH
  private attackTimer = 2 + Math.random() * 1.5
  private hasStruck = false
  private _isDying = false
  private deathTimer = 0
  private deathRise = 0
  private dropsCollected = false
  private readonly dawn = new DawnRetreat(EXIT_DURATION)
  private exitStarted = false
  private exitRise = 0
  private exitRidge = 0
  private needsSnap = true

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private blockQuery: ((x: number, y: number, z: number) => number) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  /** Logical sand surface under the creature (position.y eases toward it). */
  private groundY = 0
  private readonly roamTarget = new THREE.Vector3()
  private roamTimer = 0
  private readonly target = new THREE.Vector3()
  private readonly strikePoint = new THREE.Vector3()
  private readonly knockback = new THREE.Vector3()
  private orbitAngle = Math.random() * Math.PI * 2
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  private orbitRadius = ORBIT_RADIUS_MIN + Math.random() * (ORBIT_RADIUS_MAX - ORBIT_RADIUS_MIN)
  private blockedTime = 0

  // Pose: 'swim' = horizontal under the sand, 'rear' = upright out of it
  private pose: 'swim' | 'rear' = 'swim'
  /** Spines out of the sand (0 hidden .. 1 showing). */
  private ridge = 0
  /** Reared up out of the sand (0 hidden .. 1 fully up). */
  private rise = 0
  private jaw = 0
  private churn = 0
  private flinch = 0
  private yaw = Math.random() * Math.PI * 2
  private targetYaw = this.yaw
  private slopePitch = 0
  private swimPhase = Math.random() * Math.PI * 2
  private moveSpeed = 0
  private time = Math.random() * 10

  // Mesh parts
  private root: THREE.Group | null = null
  private tilt: THREE.Group | null = null
  private rig: THREE.Group | null = null
  private readonly links: THREE.Group[] = []
  private head: THREE.Group | null = null
  private readonly jaws: THREE.Group[] = []
  private churnGroup: THREE.Group | null = null
  private readonly churnCubes: THREE.Mesh[] = []
  private bulge: THREE.Mesh | null = null
  private wake: THREE.Group | null = null
  private readonly wakeCubes: THREE.Mesh[] = []
  private readonly churnFling: number[] = []
  private readonly churnGlows: THREE.Mesh[] = []

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('sandmaw', {
      ...config,
      hasPhysics: true, // hitbox for player attacks while reared up; movement is manual
      hitboxSize: new THREE.Vector3(1.1, 2.6, 1.1),
    })
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
    this.groundY = this.position.y
    this.roamTarget.copy(this.position)
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
    blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.blockQuery = blockQuery
    this.solidQuery = solidQuery
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    this.root = root

    const plate = new THREE.MeshLambertMaterial({ color: PLATE })
    const band = new THREE.MeshLambertMaterial({ color: BAND })
    const belly = new THREE.MeshLambertMaterial({ color: BELLY })
    const spine = new THREE.MeshLambertMaterial({ color: SPINE })
    const spineTip = new THREE.MeshLambertMaterial({ color: SPINE_TIP })
    const throat = new THREE.MeshLambertMaterial({ color: THROAT })
    const tooth = new THREE.MeshLambertMaterial({ color: TOOTH })
    const sand = new THREE.MeshLambertMaterial({ color: SAND })
    const sandDark = new THREE.MeshLambertMaterial({ color: SAND_DARK })
    for (const m of [plate, band, belly, spine, spineTip, throat, tooth, sand, sandDark]) this.registerMaterialForLighting(m)
    // Sensory pits glow faintly in the dark
    const glow = new THREE.MeshBasicMaterial({ color: PIT_GLOW })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }
    // A dorsal spine leaning back toward the tail, bone-tipped
    const addSpine = (height: number, y: number, z: number, parent: THREE.Object3D): void => {
      const g = new THREE.Group()
      g.position.set(0, y * S, z * S)
      g.rotation.x = -0.38
      box(2, height, 2, spine, 0, height / 2, 0, g)
      box(1.4, 2.5, 1.4, spineTip, 0, height + 1, 0, g)
      parent.add(g)
    }

    const tilt = new THREE.Group()
    root.add(tilt)
    this.tilt = tilt
    const rig = new THREE.Group()
    tilt.add(rig)
    this.rig = rig

    // Armoured links chained from the tail tip (the rig's origin) to the neck
    let parent: THREE.Object3D = rig
    SECTIONS.forEach((s, i) => {
      const link = new THREE.Group()
      link.position.z = i === 0 ? 0 : SEG_LEN * S
      parent.add(link)
      const h = s * 0.9
      box(s, h, SEG_LEN + 0.6, plate, 0, 0, SEG_LEN / 2, link)
      box(s + 1, h + 1, 1.6, band, 0, 0, SEG_LEN - 0.4, link)
      box(s * 0.7, 1, SEG_LEN - 1, belly, 0, -h / 2 - 0.3, SEG_LEN / 2, link)
      addSpine(SPINE_HEIGHTS[i], h / 2, SEG_LEN * 0.45, link)
      this.links.push(link)
      parent = link
    })

    // Head: a blunt armoured cylinder ending in the ringed maw
    const head = new THREE.Group()
    head.position.z = SEG_LEN * S
    parent.add(head)
    this.head = head
    const hw = HEAD_SECTION
    const hh = HEAD_SECTION * 0.9
    box(hw, hh, HEAD_LEN, plate, 0, 0, HEAD_LEN / 2, head)
    box(hw + 1, hh + 1, 1.6, band, 0, 0, 2.2, head)
    box(hw + 1.4, hh + 1.4, 2, band, 0, 0, HEAD_LEN - 1, head)
    box(hw - 4, 1, HEAD_LEN - 2, belly, 0, -hh / 2 - 0.5, HEAD_LEN / 2, head)
    addSpine(7, hh / 2, 2.8, head)
    addSpine(5, hh / 2, 6.2, head)
    // Rows of glowing sensory pits along the sides and two on the brow
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) box(0.6, 1.4, 1.4, glow, side * (hw / 2 + 0.2), 2.2 - k * 1.6, 3.4 + k * 2, head)
      box(1.4, 0.6, 1.4, glow, side * 3, hh / 2 + 0.2, 7.2, head)
    }
    // Throat and the rings of inward-pointing teeth
    box(hw - 3, hh - 2, 0.6, throat, 0, 0, HEAD_LEN + 0.1, head)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      box(1.4, 1.4, 2.2, tooth, Math.cos(a) * hw * 0.32, Math.sin(a) * hh * 0.32, HEAD_LEN + 0.6, head)
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.5
      box(1, 1, 1.6, tooth, Math.cos(a) * hw * 0.16, Math.sin(a) * hh * 0.16, HEAD_LEN + 0.4, head)
    }

    // Four tapering jaw petals hinged on the mouth rim, toothed on the inside
    const petal = (hx: number, hy: number, vertical: boolean): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(hx * S, hy * S, HEAD_LEN * S)
      head.add(g)
      // Inward is toward the mouth's axis
      const ix = -Math.sign(hx)
      const iy = -Math.sign(hy)
      // [width, length, start] of each tapering step
      const k = HEAD_SECTION / 14
      const steps: Array<[number, number, number]> = [[12 * k, 3, 0], [9 * k, 2.5, 3], [5 * k, 2, 5.5]]
      for (const [w, len, z0] of steps) {
        const m = z0 === 0 ? band : plate
        if (vertical) box(2, w, len, m, ix * 1, 0, z0 + len / 2, g)
        else box(w, 2, len, m, 0, iy * 1, z0 + len / 2, g)
      }
      for (const [t, z] of [[-3.5, 1.5], [0, 2.2], [3.5, 1.5], [-2, 4.2], [2, 4.2]]) {
        if (vertical) box(2, 1.2, 1.2, tooth, ix * 2.6, t * k, z, g)
        else box(1.2, 2, 1.2, tooth, t * k, iy * 2.6, z, g)
      }
      this.jaws.push(g)
      return g
    }
    petal(0, hh / 2, false)
    petal(hw / 2, 0, true)
    petal(0, -hh / 2, false)
    petal(-hw / 2, 0, true)

    // Churning sand ring: the telegraph under the player's feet
    const churn = new THREE.Group()
    churn.visible = false
    root.add(churn)
    this.churnGroup = churn
    this.bulge = box(22, 2, 22, sand, 0, 0.5, 0, churn)
    // Its glowing pits glimpsed through the sand just before it bursts out
    for (let k = 0; k < 4; k++) this.churnGlows.push(box(1.2, 1.2, 1.2, glow, 0, 0, 0, churn))
    for (let k = 0; k < CHURN_CUBES; k++) {
      const size = 3.5 + ((k * 7) % 5) * 0.6
      const cube = box(size, size, size, k % 2 === 0 ? sand : sandDark, 0, 0, 0, churn)
      this.churnCubes.push(cube)
      this.churnFling.push(0.6 + ((k * 13) % 7) / 10)
    }

    // A little sand kicked up ahead of the spines while it swims
    const wake = new THREE.Group()
    wake.position.z = BODY_LENGTH * 0.42
    root.add(wake)
    this.wake = wake
    for (let k = 0; k < 3; k++) this.wakeCubes.push(box(3, 2, 3, k === 1 ? sandDark : sand, (k - 1) * 4, 0.6, k === 1 ? 2 : 0, wake))

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [tilt, rig, ...this.links, head, ...this.jaws, churn, this.bulge, ...this.churnCubes, ...this.churnGlows, wake, ...this.wakeCubes],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    this.applyPose()
    return root
  }

  update(deltaTime: number): void {
    if (this.needsSnap) this.snapToSand()
    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    const exit = this.dawn.update(deltaTime)
    if (exit > 0) {
      this.updateExit(exit, deltaTime)
      if (exit >= 1) this.kill()
      return
    }

    this.time += deltaTime
    this.stateTime += deltaTime
    this.attackTimer -= deltaTime
    this.flinch = Math.max(0, this.flinch - deltaTime * 5)

    this.think(deltaTime)
    this.followGround(deltaTime)
    this.animate(deltaTime)
    this.syncTransform()
  }

  /** First update: settle on the sand surface under the spawn point (none: leave quietly). */
  private snapToSand(): void {
    this.needsSnap = false
    const surface = this.surfaceAt(this.position.x, this.position.z, this.position.y)
    if (surface === null) {
      this.kill()
      return
    }
    this.groundY = surface
    this.position.y = surface
    this.ridge = 0
  }

  private enter(state: SandmawState): void {
    this.ai = state
    this.stateTime = 0
  }

  private horizontalDistanceTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z)
  }

  private think(deltaTime: number): void {
    const player = this.playerPositionRef
    const dist = player ? this.horizontalDistanceTo(player) : Infinity
    const dy = player ? Math.abs(player.y - this.position.y) : Infinity

    switch (this.ai) {
      case 'roam': {
        this.pose = 'swim'
        this.ridge = Math.min(1, this.ridge + deltaTime * 2)
        if (player && dist <= DETECTION_RANGE && dy < 10) {
          this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
          this.enter('circle')
          break
        }
        this.roamTimer -= deltaTime
        if (this.roamTimer <= 0 || this.horizontalDistanceTo(this.roamTarget) < 0.6) {
          this.roamTimer = 4 + Math.random() * 3
          this.roamTarget.set(this.position.x + (Math.random() - 0.5) * 20, this.position.y, this.position.z + (Math.random() - 0.5) * 20)
        }
        if (!this.swimToward(this.roamTarget, ROAM_SPEED, deltaTime)) this.roamTimer = Math.min(this.roamTimer, 0.5)
        break
      }
      case 'circle': {
        this.pose = 'swim'
        this.ridge = Math.min(1, this.ridge + deltaTime * 2)
        if (!player || dist > LOSE_RANGE || dy > 14) {
          this.enter('roam')
          break
        }
        this.orbitAngle += this.orbitDir * deltaTime * (CIRCLE_SPEED / this.orbitRadius) * 0.8
        this.target.set(player.x + Math.cos(this.orbitAngle) * this.orbitRadius, this.position.y, player.z + Math.sin(this.orbitAngle) * this.orbitRadius)
        if (this.swimToward(this.target, CIRCLE_SPEED, deltaTime)) {
          this.blockedTime = 0
        } else {
          // The ring runs off the sand: turn around, try another radius
          this.blockedTime += deltaTime
          if (this.blockedTime > 0.5) {
            this.blockedTime = 0
            this.orbitDir = -this.orbitDir
            this.orbitRadius = 5 + Math.random() * 4
          }
        }
        if (this.attackTimer <= 0 && dist <= DETECTION_RANGE && this.ridge >= 1 && this.playerSandSurface(player) !== null) {
          this.enter('dive')
        }
        break
      }
      case 'dive': {
        // The spines sink out of sight; it keeps sliding toward its prey
        this.pose = 'swim'
        this.ridge = Math.max(0, 1 - this.stateTime / DIVE_TIME)
        if (player) this.swimToward(player, CIRCLE_SPEED * 0.6, deltaTime)
        if (this.stateTime >= DIVE_TIME) {
          const surface = player ? this.playerSandSurface(player) : null
          if (!player || surface === null) {
            // Prey stepped off the sand: surface the spines and keep circling
            this.attackTimer = 1.5
            this.enter(player ? 'circle' : 'roam')
            break
          }
          // Tunnel to right under the prey's feet as they stand now
          this.strikePoint.set(player.x, surface, player.z)
          this.position.copy(this.strikePoint)
          this.groundY = surface
          this.pose = 'rear'
          this.rise = 0
          this.ridge = 0
          this.enter('telegraph')
          playSound('night.rumble', this.strikePoint)
        }
        break
      }
      case 'telegraph': {
        this.churn = Math.min(1, this.stateTime / TELEGRAPH_TIME)
        if (this.stateTime >= TELEGRAPH_TIME) {
          if (player) this.targetYaw = Math.atan2(player.x - this.position.x, player.z - this.position.z)
          this.yaw = this.targetYaw
          this.hasStruck = false
          this.enter('erupt')
          playSound('night.erupt', this.strikePoint)
        }
        break
      }
      case 'erupt': {
        const t = Math.min(1, this.stateTime / RISE_TIME)
        this.rise = 1 - (1 - t) * (1 - t)
        this.jaw = t
        this.churn = 1
        if (!this.hasStruck && this.stateTime <= STRIKE_WINDOW && player) this.tryStrike(player)
        if (t >= 1) {
          this.hasStruck = true
          this.enter('surfaced')
        }
        break
      }
      case 'surfaced': {
        this.rise = 1
        this.churn = Math.max(0, 1 - this.stateTime / 0.6)
        // Snapping slowly at the air, swaying toward the prey
        this.jaw = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 3.6))
        if (player && dist < DETECTION_RANGE) this.targetYaw = Math.atan2(player.x - this.position.x, player.z - this.position.z)
        if (this.stateTime >= SURFACED_TIME) this.enter('sink')
        break
      }
      case 'sink': {
        const t = Math.min(1, this.stateTime / SINK_TIME)
        this.rise = 1 - t * t
        this.jaw = Math.max(0, this.jaw - deltaTime * 3)
        this.churn = 0
        if (t >= 1) {
          this.pose = 'swim'
          this.rise = 0
          this.ridge = 0
          this.attackTimer = ATTACK_COOLDOWN_MIN + Math.random() * (ATTACK_COOLDOWN_MAX - ATTACK_COOLDOWN_MIN)
          if (player) this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
          this.enter(player && dist <= LOSE_RANGE ? 'circle' : 'roam')
        }
        break
      }
    }
  }

  /** The eruption bites whoever still stands in the churned ring and flings them up. */
  private tryStrike(player: THREE.Vector3): void {
    const dx = player.x - this.strikePoint.x
    const dz = player.z - this.strikePoint.z
    const up = player.y - this.strikePoint.y
    if (dx * dx + dz * dz > STRIKE_RADIUS * STRIKE_RADIUS || up < -1 || up > STRIKE_HEIGHT) return
    this.hasStruck = true
    if (!this.playerDamageCallback) return
    const len = Math.hypot(dx, dz)
    if (len > 0.05) this.knockback.set((dx / len) * LAUNCH_OUT, LAUNCH_UP, (dz / len) * LAUNCH_OUT)
    else this.knockback.set(Math.sin(this.yaw) * LAUNCH_OUT, LAUNCH_UP, Math.cos(this.yaw) * LAUNCH_OUT)
    this.playerDamageCallback(BITE_DAMAGE, this.knockback, 'melee')
  }

  /**
   * Swim toward a point under the sand. Returns false when the sand ends in
   * that direction (no step taken).
   */
  private swimToward(target: THREE.Vector3, speed: number, deltaTime: number): boolean {
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    const len = Math.hypot(dx, dz)
    if (len < 0.1) {
      this.moveSpeed = 0
      return true
    }
    this.targetYaw = Math.atan2(dx, dz)
    const step = Math.min(speed * deltaTime, len)
    const nx = this.position.x + (dx / len) * step
    const nz = this.position.z + (dz / len) * step
    const moved = this.tryMoveTo(nx, nz) || this.tryMoveTo(nx, this.position.z) || this.tryMoveTo(this.position.x, nz)
    this.moveSpeed = moved ? speed : 0
    return moved
  }

  private tryMoveTo(x: number, z: number): boolean {
    if (x === this.position.x && z === this.position.z) return false
    const surface = this.surfaceAt(x, z, this.groundY)
    if (surface === null || Math.abs(surface - this.groundY) > MAX_STEP) return false
    this.position.x = x
    this.position.z = z
    this.groundY = surface
    return true
  }

  /**
   * Height of the sand surface (the air cell above the top sand block) in the
   * column at (x, z) near `nearY`, or null where the top is not loose sand
   * (stone, a player's blocks, water over a sand bed, a wall).
   */
  private surfaceAt(x: number, z: number, nearY: number): number | null {
    const solid = this.solidQuery
    const block = this.blockQuery
    if (!solid || !block) return nearY
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    const top = Math.floor(nearY) + MAX_STEP
    for (let y = top; y >= top - 7; y--) {
      if (!solid(bx, y, bz)) continue
      if (y === top && solid(bx, y + 1, bz)) return null
      if (!SAND_IDS.has(block(bx, y, bz))) return null
      const above = block(bx, y + 1, bz)
      if (above !== 0 && BlockRegistry.getInstance().getBlock(above).properties.isLiquid) return null
      return y + 1
    }
    return null
  }

  /** The sand surface the player stands on (or hovers just above), or null off the sand. */
  private playerSandSurface(player: THREE.Vector3): number | null {
    const solid = this.solidQuery
    const block = this.blockQuery
    if (!solid || !block) return Math.floor(player.y)
    const bx = Math.floor(player.x)
    const bz = Math.floor(player.z)
    const start = Math.floor(player.y - 0.01)
    for (let y = start; y >= start - 3; y--) {
      if (!solid(bx, y, bz)) continue
      if (!SAND_IDS.has(block(bx, y, bz))) return null
      const above = block(bx, y + 1, bz)
      if (above !== 0 && BlockRegistry.getInstance().getBlock(above).properties.isLiquid) return null
      return y + 1
    }
    return null
  }

  /** Ease the visible height toward the sand surface and pitch the body along the slope. */
  private followGround(deltaTime: number): void {
    const dy = this.groundY - this.position.y
    this.position.y += Math.sign(dy) * Math.min(Math.abs(dy), deltaTime * 8)
    if (this.pose !== 'swim') return
    const fx = Math.sin(this.yaw)
    const fz = Math.cos(this.yaw)
    const ahead = this.surfaceAt(this.position.x + fx * 1.2, this.position.z + fz * 1.2, this.groundY) ?? this.groundY
    const behind = this.surfaceAt(this.position.x - fx * 1.2, this.position.z - fz * 1.2, this.groundY) ?? this.groundY
    const pitch = Math.atan2(ahead - behind, 2.4)
    this.slopePitch += (pitch - this.slopePitch) * Math.min(1, deltaTime * 4)
  }

  private animate(deltaTime: number): void {
    // Turn toward the heading (shortest way round)
    let turn = this.targetYaw - this.yaw
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    this.yaw += turn * Math.min(1, deltaTime * 6)
    this.swimPhase += deltaTime * (2 + this.moveSpeed * 1.4)
    this.applyPose()
  }

  /** Apply the pose variables (ridge, rise, jaw, churn, flinch) to the model. */
  private applyPose(): void {
    const tilt = this.tilt
    const rig = this.rig
    if (!tilt || !rig) return
    if (this.root) this.root.rotation.y = this.yaw

    if (this.pose === 'swim') {
      tilt.position.set(0, SWIM_AXIS - (1 - this.ridge) * HIDE_DEPTH, 0)
      tilt.rotation.set(-this.slopePitch, 0, 0)
      rig.position.set(0, 0, -BODY_LENGTH * 0.55)
      // Side-to-side undulation running down the body
      this.links.forEach((link, i) => link.rotation.set(0, Math.sin(this.swimPhase - i * 0.9) * 0.16, 0))
      if (this.head) this.head.rotation.set(0, Math.sin(this.swimPhase - SECTIONS.length * 0.9) * 0.1, 0)
    } else {
      const base = -(BODY_LENGTH + 0.15) + this.rise * (BODY_LENGTH + 0.15 - BURIED_LENGTH)
      tilt.position.set(0, base, 0)
      tilt.rotation.set(-Math.PI / 2 - this.flinch * 0.3 + this.deathTopple(), Math.sin(this.time * 1.7) * 0.06 * this.rise, 0)
      rig.position.set(0, 0, 0)
      // Arched over toward its prey, the upper body weaving
      this.links.forEach((link, i) => link.rotation.set(ARCH[i] * this.rise, Math.sin(this.time * 2.4 - i * 0.7) * 0.05 * this.rise, 0))
      if (this.head) this.head.rotation.set(0.3 * this.rise + Math.sin(this.time * 3.1) * 0.05, 0, 0)
    }

    // Jaw petals: closed (tilted in) → flared open
    const a = JAW_CLOSED + (-JAW_OPEN - JAW_CLOSED) * this.jaw
    if (this.jaws.length === 4) {
      this.jaws[0].rotation.x = a
      this.jaws[1].rotation.y = -a
      this.jaws[2].rotation.x = -a
      this.jaws[3].rotation.y = a
    }

    this.applyChurn()

    if (this.wake) {
      const show = this.pose === 'swim' && this.ridge > 0.5 && this.moveSpeed > 0
      this.wake.visible = show
      if (show) {
        this.wakeCubes.forEach((cube, k) => {
          cube.position.y = (0.6 + Math.abs(Math.sin(this.swimPhase * 1.6 + k * 2.1)) * 1.6) * S
          cube.rotation.y = this.swimPhase * 0.7 + k
        })
      }
    }
  }

  /** The churning ring: jittering sand and a growing bulge, flung outward as it erupts. */
  private applyChurn(): void {
    const group = this.churnGroup
    if (!group) return
    group.visible = this.churn > 0
    if (!group.visible) return
    const erupting = this.ai === 'erupt' || this.ai === 'surfaced'
    const fling = erupting ? Math.min(1, (this.ai === 'erupt' ? this.stateTime : RISE_TIME + this.stateTime) / 0.6) : 0
    const c = this.churn
    if (this.bulge) {
      this.bulge.visible = !erupting
      this.bulge.scale.set(0.6 + c * 0.5, 1 + c * 2.2, 0.6 + c * 0.5)
    }
    this.churnCubes.forEach((cube, k) => {
      const a = (k / CHURN_CUBES) * Math.PI * 2 + this.time * (0.8 + c)
      let r = CHURN_RADIUS * (1 - 0.25 * c)
      let y = 0.08 + Math.abs(Math.sin(this.time * (9 + k) + k * 1.7)) * 0.18 * c
      if (erupting) {
        // Thrown out and up, falling back
        r += fling * 1.6 * this.churnFling[k]
        y += Math.sin(fling * Math.PI) * 1.1 * this.churnFling[k]
      }
      cube.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      cube.rotation.set(this.time * 3 + k, this.time * 2 + k * 0.6, 0)
      cube.visible = !erupting || fling < 1
    })
    const glowing = !erupting && c > 0.55
    this.churnGlows.forEach((g, k) => {
      g.visible = glowing
      if (!glowing) return
      const a = k * 1.9 + this.time * 0.6
      // Just breaking the top of the bulge
      g.position.set(Math.cos(a) * 0.3, (1.1 + 1 + c * 2.2) * S + Math.abs(Math.sin(this.time * 7 + k)) * 0.05, Math.sin(a) * 0.3)
    })
  }

  /** Extra pitch while toppling over in death (0 otherwise). */
  private deathTopple(): number {
    if (!this._isDying) return 0
    const t = Math.min(1, this.deathTimer / 0.7)
    return (1 - (1 - t) * (1 - t)) * (Math.PI / 2 - 0.3)
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const body = this.getPhysicsBody()
    if (body) {
      // Over the reared-up body, which leans a little toward the way it faces
      body.position.set(this.position.x + Math.sin(this.yaw) * 0.35, this.position.y, this.position.z + Math.cos(this.yaw) * 0.35)
    }
  }

  /** Dawn: slide back under if reared up, then a last spine ridge glides on and sinks. */
  private updateExit(progress: number, deltaTime: number): void {
    if (!this.exitStarted) {
      this.exitStarted = true
      this.exitRise = this.pose === 'rear' ? this.rise : 0
      this.exitRidge = this.pose === 'swim' ? this.ridge : 0
      this.churn = 0
      playSound('night.vanish', this.position)
    }
    this.time += deltaTime
    const sinkPart = this.exitRise > 0 ? 0.3 : 0
    if (progress < sinkPart) {
      this.pose = 'rear'
      this.rise = this.exitRise * (1 - progress / sinkPart)
      this.jaw = Math.max(0, this.jaw - deltaTime * 3)
    } else {
      this.pose = 'swim'
      this.rise = 0
      const q = (progress - sinkPart) / (1 - sinkPart)
      const shown = Math.max(this.exitRidge, Math.min(1, q / 0.25))
      this.ridge = shown * (1 - smoothstep(0.35, 1, q))
      // Gliding away, slowing as it goes down
      const fx = Math.sin(this.yaw)
      const fz = Math.cos(this.yaw)
      this.target.set(this.position.x + fx * 2, this.position.y, this.position.z + fz * 2)
      this.swimToward(this.target, 1.8 * (1 - q), deltaTime)
    }
    this.followGround(deltaTime)
    this.animate(deltaTime)
    this.syncTransform()
  }

  /** Death: the reared body topples onto the sand, then the dunes swallow it. */
  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    this.time += deltaTime
    this.jaw += (0.4 - this.jaw) * Math.min(1, deltaTime * 4)
    this.churn = 0
    this.flinch = 0
    this.pose = 'rear'
    this.rise = this.deathRise
    this.applyPose()
    const sink = Math.max(0, this.deathTimer - 0.8) / (DEATH_DURATION - 0.8)
    if (this.tilt) this.tilt.position.y -= sink * sink * 1.6
    this.syncTransform()
    if (this.deathTimer >= DEATH_DURATION) this.kill()
  }

  /** Reared up enough to reach (never while submerged). */
  private get isExposed(): boolean {
    return (this.ai === 'erupt' || this.ai === 'surfaced' || this.ai === 'sink') && this.rise > 0.35
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying || this.dawn.leaving || !this.isExposed) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 2.5
  }

  onPlayerInteract(_playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying || this.dawn.leaving || !this.isExposed) return false
    this.health -= getPlayerAttackDamage(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.deathRise = this.rise
      return true
    }
    // Rooted in the sand: a blow only rocks it back
    this.flinch = Math.max(this.flinch, Math.min(1, 0.4 + getPlayerAttackKnockback(heldItem)))
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = [new SandmawFangItem()]
    if (Math.random() < 0.4) drops.push(new SandmawFangItem())
    const bones = Math.floor(Math.random() * 3)
    for (let i = 0; i < bones; i++) drops.push(new BoneItem())
    return drops
  }

  dispose(): void {
    this.root = null
    this.tilt = null
    this.rig = null
    this.links.length = 0
    this.head = null
    this.jaws.length = 0
    this.churnGroup = null
    this.churnCubes.length = 0
    this.churnGlows.length = 0
    this.bulge = null
    this.wake = null
    this.wakeCubes.length = 0
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.blockQuery = null
    this.solidQuery = null
    super.dispose()
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
