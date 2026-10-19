import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import type { IItem } from '../../../items/Item.ts'
import { MothDustItem } from '../../../items/materials/moth_dust/MothDustItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { DawnRetreat, fadeMaterials } from '../NightCreature.ts'
import { getBlockLight, isPlayerCarryingLight } from '../NightSenses.ts'
import { playSound } from '../../../audio/SoundHooks.ts'

// Colours: pale grey-lilac fur, mottled dusty wings, moon-white eye spots
const FUR = 0xb8aec6
const FUR_PALE = 0xe0d9e8
const FUR_DARK = 0x8a7f99
const WING = 0xa69bb3
const WING_LIGHT = 0xcbc2d6
const WING_DARK = 0x6e6380
const HINDWING = 0xbba6bf
const EYE = 0x1c1826
const LEG = 0x4a4256
const SPOT_RING = 0x2c2536
const SPOT_GLOW = 0xd2f6ff
const SPOT_FLARE = 0xffffff
const SPOT_DEAD = 0x404a56
const DUST = 0xb4ecff

const S = 0.0625 // 1 "pixel" = 1/16 block

// Tuning
const MAX_HEALTH = 12
const SWOOP_DAMAGE = 3
/** Light draws them in: notice range with the player in light / in the dark. */
const NOTICE_RANGE_LIT = 40
const NOTICE_RANGE_DARK = 10
const LOSE_RANGE_LIT = 48
const LOSE_RANGE_DARK = 16
/** Block light at the player's head that counts as "standing in light". */
const LIT_BLOCK_LIGHT = 8
const SENSE_INTERVAL = 0.25
/** Seconds without a clear line to the head before it looks for a way in (a doorway). */
const SEEK_OPENING_AFTER = 1.5
const OPENING_SEEK_TIME = 4
const CRUISE_SPEED = 6
const SWOOP_SPEED = 11
const DRIFT_SPEED = 2.5
/** Erratic loops around the player's head while waiting to strike. */
const ORBIT_RADIUS_MIN = 2.4
const ORBIT_RADIUS_MAX = 4.2
const ORBIT_HEIGHT_MIN = 1.8
const ORBIT_HEIGHT_MAX = 3.2
/** Telegraph: hovers, wings swept back, eye spots flare. */
const WINDUP_TIME = 0.5
const SWOOP_MAX_TIME = 0.8
const FLEE_TIME = 1.1
const TUMBLE_TIME = 0.6
const ATTACK_COOLDOWN_MIN = 2.2
const ATTACK_COOLDOWN_MAX = 3.8
/** Strike reach from the moth's body to the player's head. */
const HIT_REACH = 0.9
const PLAYER_HEAD = 1.5
/** Body centre above the moth's position. */
const BODY_CENTER = 0.35
/** Body half width / height for block collision (fits a 1-wide doorway). */
const HALF = 0.3
const COLLIDE_HEIGHT = 0.55
/** Idle flutter height above the ground. */
const HOVER_MIN = 3
const HOVER_MAX = 6
/** Dawn: flutters up and away, fading. */
const EXIT_SECONDS = 3

type MothState = 'drift' | 'circle' | 'windup' | 'swoop' | 'flee' | 'tumble'

/**
 * Duskmoth - a moth the size of a large dog that haunts the vegetated
 * surface at night: fuzzy lilac-grey body, feathery antennae and broad
 * dusty wings with two glowing moon-white eye spots, the first thing you see
 * of it in the dark.
 *
 * Drawn to light: a player carrying a torch (or standing in torchlight) is
 * noticed from 40 blocks, one in the dark only from 10. It loops erratically
 * around the player's head, then telegraphs - hovers, sweeps its wings back,
 * eye spots flaring - and swoops at the head. After a strike it flutters off
 * and loops again; each moth keeps its own jittered rhythm, so a pair takes
 * turns. Fragile: a blow sends it tumbling away and breaks a swoop. Flies
 * around blocks (never through them) and climbs over walls in its way.
 *
 * Stats: 12 HP, 3 damage per swoop, cruise 6 / swoop 11 blocks/s.
 * Drops: 1-2 moth dust.
 */
export class DuskmothEntity extends AggressiveEntity {
  readonly type = 'duskmoth'

  private mothState: MothState = 'drift'
  private stateTime = 0
  private time = Math.random() * 10
  private attackTimer = ATTACK_COOLDOWN_MIN + Math.random() * (ATTACK_COOLDOWN_MAX - ATTACK_COOLDOWN_MIN)
  private orbitAngle = Math.random() * Math.PI * 2
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  private orbitRadius = ORBIT_RADIUS_MIN + Math.random() * (ORBIT_RADIUS_MAX - ORBIT_RADIUS_MIN)
  private orbitHeight = ORBIT_HEIGHT_MIN + Math.random() * (ORBIT_HEIGHT_MAX - ORBIT_HEIGHT_MIN)
  /** Per-moth phases of the flutter wobble. */
  private readonly phaseA = Math.random() * Math.PI * 2
  private readonly phaseB = Math.random() * Math.PI * 2
  private readonly phaseC = Math.random() * Math.PI * 2
  private lurchTimer = 0.4
  private senseTimer = 0
  private lit = false
  private engaged = false
  private struck = false
  /** Seconds the player's head has been out of sight while circling. */
  private blindTime = 0
  /** A spot with a clear line to the head (outside a doorway) it is heading for. */
  private seekTime = 0
  private readonly opening = new THREE.Vector3()

  private readonly dawn = new DawnRetreat(EXIT_SECONDS)
  private readonly exitDir = new THREE.Vector3()

  private readonly flightVel = new THREE.Vector3()
  private readonly swoopDir = new THREE.Vector3()
  private readonly home = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly head = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly step = new THREE.Vector3()
  /** Where its sounds play from (the body), reused. */
  private readonly soundPos = { x: 0, y: 0, z: 0 }
  private readonly flareColor = new THREE.Color(SPOT_FLARE)
  private readonly deadColor = new THREE.Color(SPOT_DEAD)

  private player: THREE.Vector3 | null = null
  private damageCb: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private solidAt: ((x: number, y: number, z: number) => boolean) | null = null

  // Model parts
  private body: THREE.Group | null = null
  /** Wing hinges: [left fore, left hind, right fore, right hind]. */
  private wings: THREE.Group[] = []
  private spots: THREE.Group[] = []
  private motes: THREE.Mesh[] = []
  private spotMaterial: THREE.MeshBasicMaterial | null = null
  /** Every material of the finished (optimized) model, for the dawn fade. */
  private fadeList: THREE.Material[] = []
  private readonly baseOpacity = new Map<THREE.Material, number>()

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('duskmoth', {
      ...config,
      hasPhysics: true, // hitbox for player attacks; flight is manual
      hitboxSize: new THREE.Vector3(1.0, 0.7, 1.0),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: SWOOP_DAMAGE,
      detectionRange: NOTICE_RANGE_DARK,
      knockbackHorizontal: 11,
      knockbackVertical: 4,
      knockbackStunTime: 0.2,
      drops: [{ createItem: () => new MothDustItem(), minCount: 1, maxCount: 2 }],
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

  setWorldQueryFns(_blockQuery: (x: number, y: number, z: number) => number, solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.solidAt = solidQuery
  }

  onSpawn(): void {
    // Spawned on the ground: flutter up to its idle height (as far as it is clear)
    const rise = HOVER_MIN + Math.random() * (HOVER_MAX - HOVER_MIN)
    for (let climbed = 0; climbed < rise; climbed += 0.5) {
      if (!this.clear(this.position.x, this.position.y + 0.5, this.position.z)) break
      this.position.y += 0.5
    }
    this.home.copy(this.position)
    this.syncTransform()
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const fur = new THREE.MeshLambertMaterial({ color: FUR })
    const furPale = new THREE.MeshLambertMaterial({ color: FUR_PALE })
    const furDark = new THREE.MeshLambertMaterial({ color: FUR_DARK })
    const wing = new THREE.MeshLambertMaterial({ color: WING })
    const wingLight = new THREE.MeshLambertMaterial({ color: WING_LIGHT })
    const wingDark = new THREE.MeshLambertMaterial({ color: WING_DARK })
    const hindwing = new THREE.MeshLambertMaterial({ color: HINDWING })
    const eye = new THREE.MeshLambertMaterial({ color: EYE })
    const leg = new THREE.MeshLambertMaterial({ color: LEG })
    const ring = new THREE.MeshLambertMaterial({ color: SPOT_RING })
    for (const m of [fur, furPale, furDark, wing, wingLight, wingDark, hindwing, eye, leg, ring]) this.registerMaterialForLighting(m)
    // Eye spots and dust glow in the dark
    this.spotMaterial = new THREE.MeshBasicMaterial({ color: SPOT_GLOW })
    const dust = new THREE.MeshBasicMaterial({ color: DUST, transparent: true, opacity: 0.85, depthWrite: false })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }

    const body = new THREE.Group()
    body.position.y = BODY_CENTER
    root.add(body)
    this.body = body

    // Thorax with a pale fur ruff, head in front (+Z), tapering abdomen behind
    box(5, 5, 5, fur, 0, 0, 0, body)
    box(6.4, 2.6, 4.2, furPale, 0, 1.4, 1.2, body)
    box(4, 3.6, 3, fur, 0, 0.2, 3.8, body)
    box(4.6, 1.4, 1.6, furPale, 0, -1.1, 3.4, body) // shaggy chin
    box(4.2, 4, 5, fur, 0, -0.4, -4.6, body)
    box(4.4, 0.8, 5.2, furDark, 0, 0.6, -4.6, body) // abdomen bands
    box(4.4, 0.8, 5.2, furDark, 0, -1.4, -4.6, body)
    box(3, 3, 3.5, fur, 0, -0.9, -8.5, body)
    box(1.8, 1.8, 1.4, furDark, 0, -1.2, -10.6, body)
    // Dark compound eyes bulging at the sides of the head
    for (const side of [-1, 1]) box(1.4, 2, 2, eye, side * 2.2, 0.6, 4.2, body)
    // Feathery antennae: a dark stalk between two pale tapering vanes, swept up and out
    for (const side of [-1, 1]) {
      const antenna = new THREE.Group()
      antenna.position.set(side * 1.1 * S, 1.9 * S, 5 * S)
      antenna.rotation.set(-0.8, side * 0.45, side * 0.2)
      box(0.5, 0.5, 7.5, furDark, 0, 0, 3.75, antenna)
      const vanes: Array<[number, number, number]> = [[1.6, 1.4, 1.8], [3.4, 2.4, 1.8], [5.2, 2.2, 1.8], [6.8, 1.2, 1.4]]
      for (const [z, width, len] of vanes) box(width * 2 + 0.5, 0.25, len, furPale, 0, 0, z, antenna)
      body.add(antenna)
    }
    // Six thin legs dangling under the thorax
    for (const side of [-1, 1]) {
      for (const z of [1.6, 0, -1.6]) {
        const l = box(0.5, 3.2, 0.5, leg, side * 1.8, -3.6, z, body)
        l.rotation.z = side * 0.35
      }
    }

    // Wings: hinged at the thorax sides, built along +X (mirrored for the left)
    this.wings = []
    this.spots = []
    const makeWing = (side: number, fore: boolean): THREE.Group => {
      const hinge = new THREE.Group()
      hinge.position.set(side * 2.4 * S, 1.6 * S, (fore ? 0.8 : -1.8) * S)
      const part = (x0: number, x1: number, z0: number, z1: number, m: THREE.Material, lift = 0, thick = 0.4): THREE.Mesh =>
        box(x1 - x0, thick, z1 - z0, m, side * (x0 + x1) / 2, lift, (z0 + z1) / 2, hinge)
      if (fore) {
        // Broad forewing: narrow at the hinge, the trailing edge sweeping back
        // to a wide outer margin, rounded tip
        part(0, 3, -2.2, 2.2, wing)
        part(3, 6, -3.8, 2.8, wing)
        part(6, 9, -5.4, 3, wing)
        part(9, 11.6, -6, 2.6, wing)
        part(11.6, 12.8, -5, 1.2, wing)
        // Mottling: a pale leading band, dusky patches and a dark outer margin
        part(1, 11, 1.8, 2.8, wingLight, 0.05, 0.45)
        part(2.5, 5, -3.4, -1.2, wingDark, 0.05, 0.45)
        part(3, 11.6, -6, -5.2, wingDark, 0.05, 0.45)
        part(11.6, 12.8, -5, -1, wingDark, 0.05, 0.45)
        part(5, 6.2, -2, 2, wingLight, 0.05, 0.45)
        // Eye spot: a dark rounded ring around a big glowing centre, both faces
        part(5.8, 10.6, -3.4, 0.2, ring, 0, 0.55)
        part(6.6, 9.8, -4.2, 1, ring, 0, 0.55)
        const spot = new THREE.Group()
        spot.position.set(side * 8.2 * S, 0, -1.6 * S)
        box(3.4, 0.7, 2.2, this.spotMaterial!, 0, 0, 0, spot)
        box(2.2, 0.7, 3.4, this.spotMaterial!, 0, 0, 0, spot)
        hinge.add(spot)
        this.spots.push(spot)
      } else {
        // Smaller, rounder hindwing tucked behind
        part(0, 3, -3.4, 0.8, hindwing)
        part(3, 6.6, -4.8, 0.6, hindwing)
        part(6.6, 8.6, -4.2, -0.4, hindwing)
        part(8.6, 9.4, -3.2, -1.2, hindwing)
        part(2, 6, -1.4, -0.6, wingDark, 0.05, 0.45)
        part(1, 8.6, -5, -4.4, wingDark, 0.05, 0.45)
      }
      body.add(hinge)
      return hinge
    }
    this.wings.push(makeWing(-1, true), makeWing(-1, false), makeWing(1, true), makeWing(1, false))

    // Glowing dust shaken from the wings (cycled in updateAnimations)
    this.motes = []
    const moteGeo = new THREE.BoxGeometry(1.1 * S, 1.1 * S, 1.1 * S)
    for (let i = 0; i < 5; i++) {
      const mote = new THREE.Mesh(moteGeo, dust)
      root.add(mote)
      this.motes.push(mote)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, ...this.wings, ...this.spots, ...this.motes],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // The finished model's materials (merging replaced most), for the dawn fade
    const seen = new Set<THREE.Material>()
    root.traverse((o) => {
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
    if (this._isDying) {
      // Falls out of the air, wings folding, glow fading
      if (physics) physics.skipPhysics = false
      super.update(deltaTime)
      this.animateDeath(deltaTime)
      return
    }
    if (physics) physics.skipPhysics = true
    this.time += deltaTime

    const exit = this.dawn.update(deltaTime)
    if (exit > 0) {
      this.updateExit(deltaTime, exit)
      return
    }

    this.stateTime += deltaTime
    this.attackTimer -= deltaTime
    this.senseTimer -= deltaTime
    if (this.senseTimer <= 0) {
      this.senseTimer = SENSE_INTERVAL
      this.sense()
    }

    const player = this.player
    if (player) this.head.set(player.x, player.y + PLAYER_HEAD, player.z)
    const dist = player ? this.tmp.set(this.position.x, this.position.y + BODY_CENTER, this.position.z).distanceTo(this.head) : Infinity
    if (!this.engaged && dist <= (this.lit ? NOTICE_RANGE_LIT : NOTICE_RANGE_DARK)) {
      this.engaged = true
      this.enter('circle')
    } else if (this.engaged && dist > (this.lit ? LOSE_RANGE_LIT : LOSE_RANGE_DARK)) {
      this.engaged = false
      this.setHomeHere()
      this.enter('drift')
    }

    let speed = CRUISE_SPEED
    let wobble = 1
    switch (this.mothState) {
      case 'drift': {
        // Lazy looping flutter around its patch of air
        this.target.set(
          this.home.x + Math.sin(this.time * 0.5 + this.phaseA) * 3,
          this.home.y + Math.sin(this.time * 0.9 + this.phaseB),
          this.home.z + Math.sin(this.time * 0.37 + this.phaseC) * 3
        )
        speed = DRIFT_SPEED
        break
      }
      case 'circle': {
        // Erratic loops around the head: radius, height and pace all wander
        if (Math.random() < deltaTime * 0.15) this.orbitDir = -this.orbitDir
        this.orbitAngle += this.orbitDir * deltaTime * (1.1 + 0.6 * Math.sin(this.time * 0.8 + this.phaseA))
        const r = this.orbitRadius + 0.8 * Math.sin(this.time * 1.7 + this.phaseB)
        this.target.set(
          this.head.x + Math.cos(this.orbitAngle) * r,
          player!.y + this.orbitHeight + 0.6 * Math.sin(this.time * 2.3 + this.phaseC),
          this.head.z + Math.sin(this.orbitAngle) * r
        )
        const clearLine = dist < 9 && this.hasClearLine()
        this.blindTime = clearLine ? 0 : this.blindTime + deltaTime
        // Shut out (a wall, a roof): make for a spot that sees the head - a doorway
        if (this.seekTime > 0) {
          this.seekTime -= deltaTime
          this.target.copy(this.opening)
          if (clearLine || this.position.distanceTo(this.opening) < 0.8) this.seekTime = 0
        } else if (this.blindTime > SEEK_OPENING_AFTER) {
          this.blindTime = 0
          if (this.findOpening()) this.seekTime = OPENING_SEEK_TIME
        }
        if (this.attackTimer <= 0 && dist < 7 && clearLine) this.enter('windup')
        break
      }
      case 'windup': {
        // Hover in place facing the head: the telegraph
        this.target.copy(this.position)
        speed = 0
        wobble = 0.2
        if (this.stateTime >= WINDUP_TIME) {
          this.swoopDir.copy(this.head).sub(this.tmp.set(this.position.x, this.position.y + BODY_CENTER, this.position.z))
          if (this.swoopDir.lengthSq() < 1e-4) this.swoopDir.set(0, -1, 0)
          this.swoopDir.normalize()
          this.struck = false
          this.enter('swoop')
          this.playAt('night.flutter')
        }
        break
      }
      case 'swoop': {
        // Committed dive with a little homing toward the head
        this.tmp.copy(this.head)
        this.tmp.y -= this.position.y + BODY_CENTER
        this.tmp.x -= this.position.x
        this.tmp.z -= this.position.z
        const toHead = this.tmp.length()
        if (toHead > 0.01) this.swoopDir.lerp(this.tmp.divideScalar(toHead), Math.min(1, deltaTime * 1.5)).normalize()
        this.flightVel.copy(this.swoopDir).multiplyScalar(SWOOP_SPEED)
        if (!this.struck && toHead <= HIT_REACH) this.strike()
        if (this.struck || this.stateTime >= SWOOP_MAX_TIME) this.enter('flee')
        break
      }
      case 'flee': {
        // Flutter up and away from the player, then loop back in
        const from = player ?? this.home
        this.tmp.set(this.position.x - from.x, 0, this.position.z - from.z)
        if (this.tmp.lengthSq() < 1e-4) this.tmp.set(1, 0, 0)
        this.tmp.normalize()
        this.target.set(this.position.x + this.tmp.x * 4, from.y + this.orbitHeight + 1.5, this.position.z + this.tmp.z * 4)
        speed = CRUISE_SPEED * 1.1
        if (this.stateTime >= FLEE_TIME) {
          if (player) this.orbitAngle = Math.atan2(this.position.z - player.z, this.position.x - player.x)
          this.enter(this.engaged ? 'circle' : 'drift')
        }
        break
      }
      case 'tumble': {
        // Knocked away: no steering, the blow's momentum fades
        this.flightVel.multiplyScalar(Math.max(0, 1 - deltaTime * 2.5))
        if (this.stateTime >= TUMBLE_TIME) this.enter('flee')
        break
      }
    }

    if (this.mothState !== 'swoop' && this.mothState !== 'tumble') this.steer(speed, wobble, deltaTime)
    this.flyStep(deltaTime)
    this.face(deltaTime)
    this.syncTransform()
    this.isWalking = true
    this.updateAnimations(deltaTime)
  }

  private enter(state: MothState): void {
    this.mothState = state
    this.stateTime = 0
    this.blindTime = 0
    this.seekTime = 0
    if (state === 'flee') {
      this.attackTimer = ATTACK_COOLDOWN_MIN + Math.random() * (ATTACK_COOLDOWN_MAX - ATTACK_COOLDOWN_MIN)
    }
  }

  /** Is the player carrying or standing in light? */
  private sense(): void {
    const p = this.player
    if (!p) {
      this.lit = false
      return
    }
    this.lit = isPlayerCarryingLight() || getBlockLight(Math.floor(p.x), Math.floor(p.y + PLAYER_HEAD), Math.floor(p.z)) >= LIT_BLOCK_LIGHT
  }

  /** Idle around the current spot, at flutter height above the ground below. */
  private setHomeHere(): void {
    this.home.copy(this.position)
    if (!this.solidAt) return
    for (let dy = 0; dy < 12; dy++) {
      const y = Math.floor(this.position.y) - dy
      if (this.solidAt(Math.floor(this.position.x), y, Math.floor(this.position.z))) {
        this.home.y = Math.max(this.position.y, y + 1 + HOVER_MIN)
        return
      }
    }
  }

  /** Steer toward the target, wobbling and lurching - a moth never flies straight. */
  private steer(speed: number, wobble: number, deltaTime: number): void {
    this.tmp.copy(this.target).sub(this.position)
    const dist = this.tmp.length()
    if (dist > 0.05) this.tmp.multiplyScalar(Math.min(speed, dist * 2.5) / dist)
    else this.tmp.set(0, 0, 0)
    const t = this.time
    this.tmp.x += Math.sin(t * 7.3 + this.phaseA) * 1.6 * wobble
    this.tmp.y += (Math.sin(t * 11.1 + this.phaseB) * 1.3 + Math.sin(t * 4.1) * 0.6) * wobble
    this.tmp.z += Math.cos(t * 6.7 + this.phaseC) * 1.6 * wobble
    this.flightVel.lerp(this.tmp, Math.min(1, deltaTime * 3.5))
    if (wobble < 1) return
    // Sudden sideways lurches
    this.lurchTimer -= deltaTime
    if (this.lurchTimer <= 0) {
      this.lurchTimer = 0.35 + Math.random() * 0.55
      const a = Math.random() * Math.PI * 2
      const m = 2.5 + Math.random() * 2
      this.flightVel.x += Math.cos(a) * m
      this.flightVel.z += Math.sin(a) * m
      this.flightVel.y += (Math.random() - 0.4) * m * 0.6
    }
  }

  private strike(): void {
    this.struck = true
    if (!this.damageCb) return
    const push = this.tmp.copy(this.swoopDir).setY(0)
    if (push.lengthSq() > 1e-6) push.normalize()
    push.multiplyScalar(2)
    push.y = 1.5
    this.damageCb(SWOOP_DAMAGE, push, 'melee')
  }

  /**
   * Pick a free spot around the player, near head height, with a clear line
   * to the head and open air above it up to the moth's height - outside, in
   * front of a doorway or window, where it can drop in from above. False
   * when there is none.
   */
  private findOpening(): boolean {
    const start = Math.random() * Math.PI * 2
    const y = this.head.y - BODY_CENTER - 0.1
    for (const radius of [3, 4.5, 6, 7.5]) {
      for (let i = 0; i < 12; i++) {
        const a = start + (i / 12) * Math.PI * 2
        const x = this.head.x + Math.cos(a) * radius
        const z = this.head.z + Math.sin(a) * radius
        if (!this.clear(x, y, z) || !this.hasClearLine(x, y, z) || !this.openAbove(x, y, z)) continue
        this.opening.set(x, y, z)
        return true
      }
    }
    return false
  }

  /** Free air from (x, y, z) up to just above the moth: no roof over the spot. */
  private openAbove(x: number, y: number, z: number): boolean {
    const top = Math.max(this.position.y, y) + 1
    for (let yy = y + 1; yy <= top; yy += 1) {
      if (!this.clear(x, yy, z)) return false
    }
    return true
  }

  /** No solid block between the moth's body (at feet x, y, z) and the player's head (sampled). */
  private hasClearLine(x: number = this.position.x, y: number = this.position.y, z: number = this.position.z): boolean {
    if (!this.solidAt) return true
    const sx = x
    const sy = y + BODY_CENTER
    const sz = z
    const dx = this.head.x - sx
    const dy = this.head.y - sy
    const dz = this.head.z - sz
    const steps = Math.ceil(Math.hypot(dx, dy, dz) / 0.4)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidAt(Math.floor(sx + dx * t), Math.floor(sy + dy * t), Math.floor(sz + dz * t))) return false
    }
    return true
  }

  /** Move by velocity·dt, sliding along solid blocks; climbs over what blocks it. */
  private flyStep(deltaTime: number): void {
    const pos = this.position
    if (!this.clear(pos.x, pos.y, pos.z)) {
      // Spawned or knocked into foliage: rise out of it
      pos.y += deltaTime * 3
      return
    }
    const step = this.step.copy(this.flightVel).multiplyScalar(deltaTime)
    let blockedSide = false
    if (this.clear(pos.x + step.x, pos.y, pos.z)) pos.x += step.x
    else {
      this.flightVel.x *= -0.3
      blockedSide = true
    }
    if (this.clear(pos.x, pos.y, pos.z + step.z)) pos.z += step.z
    else {
      this.flightVel.z *= -0.3
      blockedSide = true
    }
    if (this.clear(pos.x, pos.y + step.y, pos.z)) pos.y += step.y
    else this.flightVel.y *= -0.3
    // A wall or tree in the way: flutter up over it
    if (blockedSide && this.mothState !== 'swoop') this.flightVel.y = Math.max(this.flightVel.y, 3)
    if (pos.y > 480) pos.y = 480
  }

  /** The collision box (feet at y) is free of solid blocks. */
  private clear(x: number, y: number, z: number): boolean {
    const solid = this.solidAt
    if (!solid) return true
    for (const oy of [0.05, COLLIDE_HEIGHT]) {
      const by = Math.floor(y + oy)
      if (solid(Math.floor(x - HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x - HALF), by, Math.floor(z + HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z + HALF))) return false
    }
    return true
  }

  /** Turn toward the flight direction (toward the head while winding up), banking and pitching. */
  private face(deltaTime: number): void {
    const mesh = this.getMesh()
    if (!mesh) return
    let dx = this.flightVel.x
    let dz = this.flightVel.z
    if (this.mothState === 'windup' && this.player) {
      dx = this.head.x - this.position.x
      dz = this.head.z - this.position.z
    }
    if (dx * dx + dz * dz > 0.04) {
      let delta = Math.atan2(dx, dz) - mesh.rotation.y
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      mesh.rotation.y += delta * Math.min(1, deltaTime * 7)
      if (this.body) this.body.rotation.z += (-delta * 0.5 - this.body.rotation.z) * Math.min(1, deltaTime * 6)
    }
    if (this.body) {
      const pitch = this.mothState === 'windup' ? -0.35 : Math.max(-0.6, Math.min(0.7, -this.flightVel.y * 0.08))
      this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, deltaTime * 6)
    }
  }

  private playAt(id: 'night.flutter' | 'night.vanish'): void {
    this.soundPos.x = this.position.x
    this.soundPos.y = this.position.y + BODY_CENTER
    this.soundPos.z = this.position.z
    playSound(id, this.soundPos)
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const physics = this.getPhysicsBody()
    if (physics) physics.position.copy(this.position)
  }

  /** Dawn: flutter straight up and away, fading out, then gone. */
  private updateExit(deltaTime: number, progress: number): void {
    if (this.exitDir.lengthSq() === 0) {
      const a = Math.random() * Math.PI * 2
      this.exitDir.set(Math.cos(a), 0, Math.sin(a))
      this.mothState = 'flee'
      this.playAt('night.vanish')
    }
    this.tmp.set(
      this.exitDir.x * 2.5 + Math.sin(this.time * 7.3 + this.phaseA) * 1.2,
      5.5 + Math.sin(this.time * 11.1 + this.phaseB),
      this.exitDir.z * 2.5 + Math.cos(this.time * 6.7 + this.phaseC) * 1.2
    )
    this.flightVel.lerp(this.tmp, Math.min(1, deltaTime * 2))
    this.position.addScaledVector(this.flightVel, deltaTime)
    this.face(deltaTime)
    this.syncTransform()
    this.updateAnimations(deltaTime)
    const fade = 1 - progress * progress * (3 - 2 * progress)
    fadeMaterials(this.fadeList, fade, this.baseOpacity)
    if (progress >= 1) this.kill()
  }

  protected updateAnimations(deltaTime: number): void {
    const state = this.mothState
    const windup = state === 'windup' ? Math.min(1, this.stateTime / WINDUP_TIME) : 0
    // Broad, visible wingbeats; swept back and barely beating through the telegraph and dive
    let rate = 15
    let amp = 0.8
    let sweep = 0
    if (state === 'windup') {
      rate = 22
      amp = 0.8 - 0.6 * windup
      sweep = 0.95 * windup
    } else if (state === 'swoop') {
      rate = 24
      amp = 0.15
      sweep = 1.1
    } else if (state === 'flee' || state === 'tumble') {
      rate = 18
      amp = 0.95
    } else if (state === 'drift') {
      rate = 11
      amp = 0.75
    }
    for (let i = 0; i < this.wings.length; i++) {
      const w = this.wings[i]
      const side = i < 2 ? -1 : 1
      const hind = i % 2 === 1
      const flap = 0.15 + amp * (hind ? 0.85 : 1) * Math.sin(this.time * rate - (hind ? 0.5 : 0))
      w.rotation.z = side * flap
      w.rotation.y += (side * sweep * (hind ? 0.8 : 1) - w.rotation.y) * Math.min(1, deltaTime * 12)
    }
    // Eye spots: a slow breathing glow; flaring bright and swelling in the telegraph
    if (this.spotMaterial) {
      if (windup > 0 || state === 'swoop') {
        const k = state === 'swoop' ? 1 : windup
        this.spotMaterial.color.setHex(SPOT_GLOW).lerp(this.flareColor, k)
      } else {
        this.spotMaterial.color.setHex(SPOT_GLOW).multiplyScalar(0.82 + 0.18 * Math.sin(this.time * 2 + this.phaseA))
      }
    }
    const swell = 1 + 0.35 * (state === 'swoop' ? 1 : windup)
    for (const spot of this.spots) spot.scale.set(swell, 1, swell)
    // Glowing dust drifting down behind it
    for (let i = 0; i < this.motes.length; i++) {
      const cycle = (this.time * 0.7 + i / this.motes.length) % 1
      const m = this.motes[i]
      m.position.set(
        Math.sin(i * 2.3 + this.time * 1.3) * 0.25,
        BODY_CENTER + 0.1 - cycle * 0.9,
        -0.25 - cycle * 0.35 + Math.cos(i * 1.7) * 0.1
      )
      m.scale.setScalar(Math.max(0.01, 1 - cycle))
    }
  }

  private animateDeath(deltaTime: number): void {
    // Wings fold down over the body; the glow dies
    for (let i = 0; i < this.wings.length; i++) {
      const w = this.wings[i]
      const side = i < 2 ? -1 : 1
      w.rotation.z += (side * -0.9 - w.rotation.z) * Math.min(1, deltaTime * 5)
      w.rotation.y += (side * 0.6 - w.rotation.y) * Math.min(1, deltaTime * 5)
    }
    if (this.spotMaterial) this.spotMaterial.color.lerp(this.deadColor, Math.min(1, deltaTime * 2))
    for (const m of this.motes) m.visible = false
  }

  /** A blow sends it tumbling away and breaks a swoop. */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (this.dawn.leaving) return false
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!handled || this._isDying) return handled
    // The base class wrote the knockback into the physics body: fly it
    const physics = this.getPhysicsBody()
    if (physics) {
      this.flightVel.copy(physics.velocity)
      physics.velocity.set(0, 0, 0)
    }
    this.engaged = true
    this.enter('tumble')
    return handled
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (this.dawn.leaving) return false
    return super.canPlayerInteract(playerPosition, maxDistance + 0.5)
  }

  dispose(): void {
    this.body = null
    this.wings = []
    this.spots = []
    this.motes = []
    this.spotMaterial = null
    this.fadeList = []
    this.baseOpacity.clear()
    this.player = null
    this.damageCb = null
    this.solidAt = null
    super.dispose()
  }
}
