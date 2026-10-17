import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { GlowcapItem } from '../../../items/food/glowcap/GlowcapItem.ts'
import { CorruptedEssenceItem } from '../../../items/materials/corrupted_essence/CorruptedEssenceItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

// Colours: crimson puffball body, teal glowing abdomen, pale membrane wings
const BODY = 0x8a2a2e
const BODY_DARK = 0x4e161a
const STINGER = 0x2a0e10
const WING = 0xd8b8b4
const GLOW_TEAL = 0x5ae6cc
const EYE_EMBER = 0xffa040

const S = 0.0625 // 1 "pixel" = 1/16 block

// Tuning (DESIGN §8: Hell mobs 16-45 HP, hits 4-9)
const MAX_HEALTH = 16
const STING_DAMAGE = 4
const STING_POISON_SECONDS = 2.5
const DETECTION_RANGE = 20
/** Orbit ring around the player while waiting to strike. */
const ORBIT_RADIUS_MIN = 3.2
const ORBIT_RADIUS_MAX = 5.2
const ORBIT_HEIGHT_MIN = 1.4
const ORBIT_HEIGHT_MAX = 3.2
const CRUISE_SPEED = 5.5
const DART_SPEED = 11
const DART_MAX_TIME = 0.75
/** Telegraph before a dart: stops, glows bright, wings blur. */
const WINDUP_TIME = 0.65
const RETREAT_TIME = 0.8
const ATTACK_COOLDOWN_MIN = 2.4
const ATTACK_COOLDOWN_MAX = 3.8
/** Sting reach from the player's chest. */
const STING_REACH = 0.95
const PLAYER_CHEST = 1.1
/** Body half size for block collision. */
const HALF = 0.28

type DroneState = 'idle' | 'orbit' | 'windup' | 'dart' | 'retreat'

/**
 * Spore drone - a small flying brood guard of the Sporeheart Hive (dungeon
 * garrisons only, swarms of 3-4): a crimson puffball on four buzzing membrane
 * wings with a glowing teal spore abdomen and a stinger.
 *
 * It orbits the player out of reach, then telegraphs a strike - it halts,
 * its abdomen flares bright and its wings blur - and darts straight at the
 * player's chest: a sting (4 + 2.5 s poison) if it connects, then it
 * retreats and circles again. Each drone keeps its own jittered rhythm, so a
 * swarm strikes one after another rather than all at once. Fragile (16 HP):
 * swat it as it comes in.
 *
 * Drops: 0-1 glowcap, rarely corrupted essence.
 */
export class SporeDroneEntity extends AggressiveEntity {
  readonly type = 'spore_drone'

  private droneState: DroneState = 'idle'
  private stateTime = 0
  private attackTimer = ATTACK_COOLDOWN_MIN + Math.random() * (ATTACK_COOLDOWN_MAX - ATTACK_COOLDOWN_MIN)
  private orbitAngle = Math.random() * Math.PI * 2
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  private orbitRadius = ORBIT_RADIUS_MIN + Math.random() * (ORBIT_RADIUS_MAX - ORBIT_RADIUS_MIN)
  private orbitHeight = ORBIT_HEIGHT_MIN + Math.random() * (ORBIT_HEIGHT_MAX - ORBIT_HEIGHT_MIN)
  private time = Math.random() * 10
  private stung = false

  private readonly flightVel = new THREE.Vector3()
  private readonly dartDir = new THREE.Vector3()
  private readonly home = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  private player: THREE.Vector3 | null = null
  private damageCb: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private solidAt: ((x: number, y: number, z: number) => boolean) | null = null

  private wings: THREE.Object3D[] = []
  private abdomen: THREE.Object3D | null = null
  private body: THREE.Object3D | null = null
  private glowMaterial: THREE.MeshBasicMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('spore_drone', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.6, 0.6, 0.6),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: STING_DAMAGE,
      detectionRange: DETECTION_RANGE,
      knockbackStunTime: 0.25,
      drops: [
        { createItem: () => new GlowcapItem(), minCount: 0, maxCount: 1 },
        { createItem: () => new CorruptedEssenceItem(), minCount: 0, maxCount: 0.2 },
      ],
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

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshLambertMaterial({ color: BODY })
    const darkMat = new THREE.MeshLambertMaterial({ color: BODY_DARK })
    const stingMat = new THREE.MeshLambertMaterial({ color: STINGER })
    for (const m of [bodyMat, darkMat, stingMat]) this.registerMaterialForLighting(m)
    const wingMat = new THREE.MeshLambertMaterial({ color: WING, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    this.registerMaterialForLighting(wingMat)
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: GLOW_TEAL })
    const eyeMat = new THREE.MeshBasicMaterial({ color: EYE_EMBER })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }

    const body = new THREE.Group()
    body.position.y = 5 * S
    group.add(body)
    this.body = body
    // Puffball thorax with a darker band and a crown of nubs
    box(7, 6, 7, bodyMat, 0, 0, 0.5, body)
    box(7.6, 1.4, 7.6, darkMat, 0, -1, 0.5, body)
    box(2, 1.2, 2, bodyMat, -1.6, 3.4, 1.4, body)
    box(2, 1.2, 2, bodyMat, 1.6, 3.4, -0.4, body)
    // Ember eyes
    box(1.2, 1.2, 0.4, eyeMat, -1.5, 0.8, 4.1, body)
    box(1.2, 1.2, 0.4, eyeMat, 1.5, 0.8, 4.1, body)
    // Glowing spore abdomen hanging behind/below, with a stinger
    const abdomen = new THREE.Group()
    abdomen.position.set(0, -1.5 * S, -3 * S)
    box(5, 5, 5, this.glowMaterial, 0, -1.5, -1.5, abdomen)
    box(5.6, 1, 5.6, darkMat, 0, 0.8, -1.5, abdomen)
    box(1.2, 1.2, 3, stingMat, 0, -3.4, -2.5, abdomen)
    body.add(abdomen)
    this.abdomen = abdomen
    // Two pairs of membrane wings, hinged at the back of the thorax
    this.wings = []
    for (const side of [-1, 1]) {
      for (const [z, len] of [[1.5, 9], [-1.2, 7]] as const) {
        const hinge = new THREE.Group()
        hinge.position.set(side * 3 * S, 2.6 * S, z * S)
        box(len, 0.3, 3.4, wingMat, side * (len / 2), 0, 0, hinge)
        body.add(hinge)
        this.wings.push(hinge)
      }
    }

    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [body, abdomen, ...this.wings],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return group
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    const physics = this.getPhysicsBody()
    if (this._isDying) {
      // Drop out of the air while the death animation plays
      if (physics) physics.skipPhysics = false
      super.update(deltaTime)
      return
    }
    if (physics) physics.skipPhysics = true
    this.time += deltaTime
    this.stateTime += deltaTime
    this.attackTimer -= deltaTime

    // Player hits push the drone (AggressiveEntity writes the knockback into the body)
    if (physics && physics.velocity.lengthSq() > 0) {
      this.flightVel.addScaledVector(physics.velocity, 0.8)
      physics.velocity.set(0, 0, 0)
      if (this.droneState === 'dart' || this.droneState === 'windup') this.enter('retreat')
    }

    const player = this.player
    const engaged = !!player && this.position.distanceTo(player) <= DETECTION_RANGE
    if (!engaged && this.droneState !== 'idle') this.enter('idle')
    if (engaged && this.droneState === 'idle') this.enter('orbit')

    let speed = CRUISE_SPEED
    switch (this.droneState) {
      case 'idle': {
        // Lazy figure-eights around where it was fielded
        this.target.set(
          this.home.x + Math.sin(this.time * 0.6) * 2.5,
          this.home.y + 1.5 + Math.sin(this.time * 1.3) * 0.5,
          this.home.z + Math.sin(this.time * 0.3) * 2.5
        )
        speed = 2
        break
      }
      case 'orbit': {
        this.orbitAngle += this.orbitDir * deltaTime * 0.9
        const p = player!
        this.target.set(
          p.x + Math.cos(this.orbitAngle) * this.orbitRadius,
          p.y + this.orbitHeight + Math.sin(this.time * 2.3) * 0.35,
          p.z + Math.sin(this.orbitAngle) * this.orbitRadius
        )
        if (this.attackTimer <= 0 && this.hasClearLine(p)) this.enter('windup')
        break
      }
      case 'windup': {
        // Hold position (hover) facing the player: the telegraph
        this.target.copy(this.position)
        speed = 0
        if (this.stateTime >= WINDUP_TIME) {
          const p = player!
          this.dartDir.set(p.x - this.position.x, p.y + PLAYER_CHEST - this.position.y, p.z - this.position.z).normalize()
          this.stung = false
          this.enter('dart')
        }
        break
      }
      case 'dart': {
        const p = player!
        // Barely steerable: commit to the line chosen at the end of the windup
        this.tmp.set(p.x - this.position.x, p.y + PLAYER_CHEST - this.position.y, p.z - this.position.z)
        const dist = this.tmp.length()
        if (dist > 0.01) this.dartDir.lerp(this.tmp.divideScalar(dist), Math.min(1, deltaTime * 1.2)).normalize()
        this.flightVel.copy(this.dartDir).multiplyScalar(DART_SPEED)
        if (!this.stung && dist <= STING_REACH) this.sting()
        if (this.stung || this.stateTime >= DART_MAX_TIME) this.enter('retreat')
        break
      }
      case 'retreat': {
        const p = player ?? this.home
        // Up and away from the player
        this.tmp.set(this.position.x - p.x, 0, this.position.z - p.z)
        if (this.tmp.lengthSq() < 1e-4) this.tmp.set(1, 0, 0)
        this.tmp.normalize()
        this.target.set(this.position.x + this.tmp.x * 4, p.y + this.orbitHeight + 1, this.position.z + this.tmp.z * 4)
        speed = CRUISE_SPEED * 1.1
        if (this.stateTime >= RETREAT_TIME) {
          this.orbitAngle = Math.atan2(this.position.z - p.z, this.position.x - p.x)
          this.enter('orbit')
        }
        break
      }
    }

    if (this.droneState !== 'dart') {
      // Steer toward the target with a little inertia
      this.tmp.copy(this.target).sub(this.position)
      const dist = this.tmp.length()
      const desired = dist > 0.05 ? this.tmp.multiplyScalar(Math.min(speed, dist * 3) / dist) : this.tmp.set(0, 0, 0)
      this.flightVel.lerp(desired, Math.min(1, deltaTime * 4))
    }
    this.flyStep(deltaTime)
    this.faceAlong(deltaTime)

    if (physics) physics.position.copy(this.position)
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    this.isWalking = this.flightVel.lengthSq() > 0.25
    this.updateAnimations(deltaTime)
  }

  private enter(state: DroneState): void {
    this.droneState = state
    this.stateTime = 0
    if (state === 'retreat') {
      this.attackTimer = ATTACK_COOLDOWN_MIN + Math.random() * (ATTACK_COOLDOWN_MAX - ATTACK_COOLDOWN_MIN)
    }
  }

  private sting(): void {
    this.stung = true
    if (!this.damageCb || !this.player) return
    const push = this.tmp.copy(this.dartDir).setY(0)
    if (push.lengthSq() > 1e-6) push.normalize()
    push.multiplyScalar(2.5)
    push.y = 1.5
    const landed = this.damageCb(STING_DAMAGE, push, 'melee')
    if (landed !== false) playerEffects.apply(StatusEffectIds.POISON, STING_POISON_SECONDS, 1)
  }

  /** No solid block between the drone and the player's chest (sampled). */
  private hasClearLine(p: THREE.Vector3): boolean {
    if (!this.solidAt) return true
    const dx = p.x - this.position.x
    const dy = p.y + PLAYER_CHEST - this.position.y
    const dz = p.z - this.position.z
    const steps = Math.ceil(Math.hypot(dx, dy, dz) / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidAt(Math.floor(this.position.x + dx * t), Math.floor(this.position.y + dy * t), Math.floor(this.position.z + dz * t))) return false
    }
    return true
  }

  /** Move by velocity·dt, sliding along solid blocks axis by axis. */
  private flyStep(deltaTime: number): void {
    const step = this.tmp.copy(this.flightVel).multiplyScalar(deltaTime)
    const pos = this.position
    if (this.clear(pos.x + step.x, pos.y, pos.z)) pos.x += step.x
    else this.flightVel.x *= -0.3
    if (this.clear(pos.x, pos.y + step.y, pos.z)) pos.y += step.y
    else this.flightVel.y *= -0.3
    if (this.clear(pos.x, pos.y, pos.z + step.z)) pos.z += step.z
    else this.flightVel.z *= -0.3
    // Knockback impulses fade
    this.flightVel.multiplyScalar(this.droneState === 'dart' ? 1 : Math.max(0, 1 - deltaTime * 0.8))
  }

  /** The 0.6 box (feet at y) is free of solid blocks. */
  private clear(x: number, y: number, z: number): boolean {
    const solid = this.solidAt
    if (!solid) return true
    for (const oy of [0.05, 0.55]) {
      for (const [ox, oz] of [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]]) {
        if (solid(Math.floor(x + ox), Math.floor(y + oy), Math.floor(z + oz))) return false
      }
    }
    return true
  }

  private faceAlong(deltaTime: number): void {
    const mesh = this.getMesh()
    if (!mesh) return
    let dx = this.flightVel.x
    let dz = this.flightVel.z
    if (this.player && (this.droneState === 'windup' || this.droneState === 'orbit' || this.droneState === 'dart')) {
      dx = this.player.x - this.position.x
      dz = this.player.z - this.position.z
    }
    if (dx * dx + dz * dz < 1e-4) return
    const desired = Math.atan2(dx, dz)
    let delta = desired - mesh.rotation.y
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    mesh.rotation.y += delta * Math.min(1, deltaTime * 8)
  }

  protected updateAnimations(deltaTime: number): void {
    const windup = this.droneState === 'windup' ? Math.min(1, this.stateTime / WINDUP_TIME) : 0
    // Wings buzz; they blur faster through the telegraph
    const rate = this.droneState === 'windup' ? 70 : this.droneState === 'dart' ? 55 : 38
    const flap = Math.sin(this.time * rate) * 0.55
    for (let i = 0; i < this.wings.length; i++) {
      const side = i < 2 ? -1 : 1
      this.wings[i].rotation.z = side * (0.25 + flap * (i % 2 === 0 ? 1 : 0.8))
    }
    // Body bob, and a tilt into the strike
    if (this.body) {
      this.body.position.y = 5 * 0.0625 + Math.sin(this.time * 6) * 0.03
      this.body.rotation.x = this.droneState === 'dart' ? 0.5 : -0.35 * windup
    }
    // Abdomen pulses; flares bright and swells during the telegraph
    if (this.abdomen) {
      const s = 1 + 0.25 * windup + 0.05 * Math.sin(this.time * 5)
      this.abdomen.scale.set(s, s, s)
      this.abdomen.rotation.x = 0.6 * windup
    }
    if (this.glowMaterial) {
      const k = this.droneState === 'windup' ? 1.0 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 40)) : 0.7 + 0.2 * Math.sin(this.time * 3)
      this.glowMaterial.color.setHex(GLOW_TEAL).multiplyScalar(k)
    }
    void deltaTime
  }

  dispose(): void {
    this.wings = []
    this.abdomen = null
    this.body = null
    this.glowMaterial = null
    this.player = null
    this.damageCb = null
    this.solidAt = null
    super.dispose()
  }
}
