import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import type { IEntity } from '../../interfaces/IEntity.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { playSound } from '../../../audio/SoundHooks.ts'

// Colours: sooty fur, dusky membranes, faint teal-green bioluminescent veins
const FUR = 0x3a3138
const FUR_DARK = 0x271f26
const FUR_LIGHT = 0x544650
const MEMBRANE = 0x4a3a52
const MEMBRANE_DARK = 0x33283a
const BONE = 0x2a2230
const CLAW = 0x1a1418
const VEIN_GLOW = 0x4ee8bc
const EYE_GLOW = 0xa0ffe0
const VEIN_DEAD = 0x1e2a28

const S = 0.0625 // 1 "pixel" = 1/16 block

// Tuning
const MAX_HEALTH = 6
const FLY_SPEED = 4.2
const FLEE_SPEED = 7.5
/** Wander targets around the flock's centre (blocks). */
const WANDER_RADIUS = 6
const WANDER_HEIGHT = 2.5
const RETARGET_MIN = 1.2
const RETARGET_MAX = 2.8
/** Never strays further than this from where it spawned. */
const LEASH = 24
/** Seconds of flight between roosts, and of hanging on a roost. */
const ROOST_EVERY_MIN = 10
const ROOST_EVERY_MAX = 24
const HANG_MIN = 6
const HANG_MAX = 16
/** Highest a roost may be above the bat (blocks). */
const ROOST_SEARCH = 7
const FLEE_TIME = 1.6
/** The player this close startles it (blocks). */
const STARTLE_RANGE = 3
/** Sky light at or above this means open sky: it turns back into the dark. */
const SKY_LIGHT_LIMIT = 7
/** Flock size the spawner's bat brings with it (including itself). */
const FLOCK_MIN = 2
const FLOCK_MAX = 5
/** Body centre above the bat's position (feet of its hitbox). */
const BODY_CENTER = 0.2
const HITBOX_HEIGHT = 0.4
/** Collision half width / height for flight. */
const HALF = 0.22
const COLLIDE_HEIGHT = 0.36
/** Spawned on the ground: rises this far into the air. */
const RISE_MIN = 1.5
const RISE_MAX = 3

type BatState = 'flutter' | 'toRoost' | 'hang' | 'drop' | 'flee'

export interface GlowBatConfig extends Partial<IPeacefulEntityConfig> {
  position: THREE.Vector3
  /**
   * Bring a flock along on spawn (default true - the spawner's bat). Its
   * flockmates are created with false and keep near it.
   */
  flock?: boolean
}

/**
 * Glow Bat - a small cave bat of every cave biome: sooty fur, dusky wing
 * membranes laced with faint teal-green glowing veins, and two bright little
 * eyes - in a dark cave you see a flock as drifting specks of light.
 *
 * Flocks of 2-5 (the spawned bat brings its flockmates) flutter erratically
 * through the cave air around their leader, never leaving 24 blocks of where
 * they appeared and turning back from open sky. Every so often one flies up
 * to a ceiling and hangs there upside down, wings folded, then drops off and
 * flies again. Harmless: a hit, or the player coming within 3 blocks,
 * startles it into a quick zig-zagging escape.
 *
 * Stats: 6 HP. Drops nothing.
 */
export class GlowBatEntity extends PeacefulEntity {
  readonly type = 'glow_bat'

  private batState: BatState = 'flutter'
  private stateTime = 0
  private time = Math.random() * 10
  private retargetTimer = 0
  private roostTimer = ROOST_EVERY_MIN + Math.random() * (ROOST_EVERY_MAX - ROOST_EVERY_MIN)
  private hangTime = 0
  private lurchTimer = 0.3
  private skyLight = 0
  /** Seconds since its last flutter sound (a startled flock doesn't spam it). */
  private sinceFlutter = 10
  private readonly phaseA = Math.random() * Math.PI * 2
  private readonly phaseB = Math.random() * Math.PI * 2
  private readonly phaseC = Math.random() * Math.PI * 2

  private readonly bringsFlock: boolean
  private leader: GlowBatEntity | null = null
  private readonly spawnPoint = new THREE.Vector3()
  private readonly flightVel = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly roost = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly step = new THREE.Vector3()
  private readonly soundPos = { x: 0, y: 0, z: 0 }
  private readonly deadColor = new THREE.Color(VEIN_DEAD)

  private player: THREE.Vector3 | null = null
  private solidAt: ((x: number, y: number, z: number) => boolean) | null = null
  private spawnFn: ((entity: IEntity) => boolean) | null = null

  // Model parts
  /** Body pose, pivoting at the body centre: rolled over while hanging. */
  private pose: THREE.Group | null = null
  /** Wing hinges: [left, right]; tips: [left, right]. */
  private wings: THREE.Group[] = []
  private wingTips: THREE.Group[] = []
  private ears: THREE.Group[] = []
  private veinMaterial: THREE.MeshBasicMaterial | null = null
  private eyeMaterial: THREE.MeshBasicMaterial | null = null

  constructor(config: GlowBatConfig) {
    super('glow_bat', {
      ...config,
      hasPhysics: true, // hitbox for player attacks; flight is manual
      hitboxSize: new THREE.Vector3(0.6, HITBOX_HEIGHT, 0.6),
      maxHealth: MAX_HEALTH,
      knockbackHorizontal: 8,
      knockbackVertical: 3,
      knockbackStunTime: 0.2,
      drops: [],
    })
    this.bringsFlock = config.flock ?? true
    this.spawnPoint.copy(config.position)
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
  }

  // ---- wiring (EntityManager duck-typed setters) ----

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.player = positionRef
  }

  setWorldQueryFns(_blockQuery: (x: number, y: number, z: number) => number, solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.solidAt = solidQuery
  }

  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.spawnFn = spawn
  }

  /** Sky light at the bat (the EntityManager feeds world light every frame). */
  updateWorldLight(packedLight: number): void {
    super.updateWorldLight(packedLight)
    this.skyLight = packedLight >> 4
  }

  onSpawn(): void {
    super.onSpawn()
    // Spawned on the ground: flutter up into the cave air (as far as it is clear)
    const rise = RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN)
    for (let climbed = 0; climbed < rise; climbed += 0.5) {
      if (!this.clear(this.position.x, this.position.y + 0.5, this.position.z)) break
      this.position.y += 0.5
    }
    this.spawnPoint.copy(this.position)
    this.syncTransform()
    if (this.bringsFlock) this.spawnFlock()
  }

  /** The spawner's bat brings 1-4 flockmates, in clear air around it. */
  private spawnFlock(): void {
    if (!this.spawnFn) return
    const extra = FLOCK_MIN - 1 + Math.floor(Math.random() * (FLOCK_MAX - FLOCK_MIN + 1))
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.8 + Math.random() * 1.4
      const pos = new THREE.Vector3(this.position.x + Math.cos(a) * r, this.position.y + (Math.random() - 0.5), this.position.z + Math.sin(a) * r)
      if (!this.clear(pos.x, pos.y, pos.z)) pos.copy(this.position)
      const mate = new GlowBatEntity({ position: pos, flock: false })
      mate.leader = this
      this.spawnFn(mate)
    }
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const fur = new THREE.MeshLambertMaterial({ color: FUR })
    const furDark = new THREE.MeshLambertMaterial({ color: FUR_DARK })
    const furLight = new THREE.MeshLambertMaterial({ color: FUR_LIGHT })
    const membrane = new THREE.MeshLambertMaterial({ color: MEMBRANE })
    const membraneDark = new THREE.MeshLambertMaterial({ color: MEMBRANE_DARK })
    const bone = new THREE.MeshLambertMaterial({ color: BONE })
    const claw = new THREE.MeshLambertMaterial({ color: CLAW })
    for (const m of [fur, furDark, furLight, membrane, membraneDark, bone, claw]) this.registerMaterialForLighting(m)
    // Glowing veins and eyes are unlit: they show in a pitch-dark cave
    this.veinMaterial = new THREE.MeshBasicMaterial({ color: VEIN_GLOW })
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE_GLOW })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }

    const pose = new THREE.Group()
    pose.position.y = BODY_CENTER
    root.add(pose)
    this.pose = pose

    // Plump furry body with a paler belly, head in front (+Z)
    box(3.4, 3, 4.6, fur, 0, 0, -0.4, pose)
    box(2.6, 1, 3.6, furLight, 0, -1.4, -0.2, pose)
    box(1.6, 1.2, 1.4, furDark, 0, -0.2, -3.2, pose) // stubby rump
    // Head: round, a short snout with a dark nose, big glowing eyes
    box(3, 2.8, 2.6, fur, 0, 0.5, 2.6, pose)
    box(1.6, 1.2, 1.2, furLight, 0, 0, 4.2, pose)
    box(0.8, 0.5, 0.4, claw, 0, 0.3, 4.9, pose)
    for (const side of [-1, 1]) box(0.8, 0.8, 0.4, this.eyeMaterial, side * 0.8, 1, 3.9, pose)
    // Tall pointed ears (twitch in updateAnimations)
    this.ears = []
    for (const side of [-1, 1]) {
      const ear = new THREE.Group()
      ear.position.set(side * 0.9 * S, 1.8 * S, 2.4 * S)
      ear.rotation.z = -side * 0.25
      box(1.1, 2.2, 0.5, furDark, 0, 1.1, 0, ear)
      box(0.5, 1.6, 0.3, membrane, 0, 1, 0.2, ear)
      pose.add(ear)
      this.ears.push(ear)
    }
    // Feet with tiny claws at the back (it hangs by them)
    for (const side of [-1, 1]) {
      box(0.6, 1.2, 0.6, bone, side * 0.9, -1.4, -2.6, pose)
      box(0.8, 0.4, 0.9, claw, side * 0.9, -2.1, -2.6, pose)
    }

    // Wings: hinged at the shoulders, built along +X (mirrored left). An inner
    // membrane on the arm, a folding outer tip on the long finger bones, both
    // laced with glowing veins
    this.wings = []
    this.wingTips = []
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group()
      hinge.position.set(side * 1.6 * S, 0.8 * S, 0.6 * S)
      const part = (x0: number, x1: number, z0: number, z1: number, m: THREE.Material, parent: THREE.Object3D, lift = 0, thick = 0.35): THREE.Mesh =>
        box(x1 - x0, thick, z1 - z0, m, side * (x0 + x1) / 2, lift, (z0 + z1) / 2, parent)
      // Arm bone along the leading edge, membrane trailing back to the body
      part(0, 3.4, 0.6, 1.3, bone, hinge, 0.1, 0.55)
      part(0, 3.4, -2.6, 0.6, membrane, hinge)
      part(0, 2.2, -3.4, -2.6, membraneDark, hinge)
      // Glowing veins radiating across the inner membrane
      part(0.6, 3.2, -0.4, -0.1, this.veinMaterial, hinge, 0.1, 0.4)
      part(1.6, 1.9, -2.6, 0.5, this.veinMaterial, hinge, 0.1, 0.4)
      const tip = new THREE.Group()
      tip.position.set(side * 3.4 * S, 0, 0)
      part(0, 3, 0.4, 1, bone, tip, 0.1, 0.5)
      part(0, 3, -2.2, 0.4, membrane, tip)
      part(0, 1.6, -3, -2.2, membraneDark, tip)
      part(3, 3.8, -0.6, 0.8, membraneDark, tip) // scalloped tip
      part(0.4, 2.8, -0.9, -0.6, this.veinMaterial, tip, 0.1, 0.4)
      part(1.4, 1.7, -2.4, 0.3, this.veinMaterial, tip, 0.1, 0.4)
      hinge.add(tip)
      pose.add(hinge)
      this.wings.push(hinge)
      this.wingTips.push(tip)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [pose, ...this.wings, ...this.wingTips, ...this.ears],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    const physics = this.getPhysicsBody()
    if (this._isDying) {
      // Drops out of the air, wings folding, glow dying
      if (physics) physics.skipPhysics = false
      if (this.pose) this.pose.rotation.z += (0 - this.pose.rotation.z) * Math.min(1, deltaTime * 6)
      super.update(deltaTime)
      this.animateDeath(deltaTime)
      return
    }
    if (physics) physics.skipPhysics = true
    this.time += deltaTime
    this.stateTime += deltaTime
    this.sinceFlutter += deltaTime

    const player = this.player
    const playerDist = player
      ? this.tmp.set(player.x - this.position.x, player.y + 1 - this.position.y - BODY_CENTER, player.z - this.position.z).length()
      : Infinity
    if (playerDist < STARTLE_RANGE && this.batState !== 'flee') this.startle()

    let speed = FLY_SPEED
    let wobble = 1
    switch (this.batState) {
      case 'flutter': {
        this.roostTimer -= deltaTime
        this.retargetTimer -= deltaTime
        if (this.retargetTimer <= 0 || this.position.distanceTo(this.target) < 0.6) this.pickTarget()
        if (this.roostTimer <= 0) {
          if (this.findRoost()) this.enter('toRoost')
          else this.roostTimer = 3 + Math.random() * 4
        }
        break
      }
      case 'toRoost': {
        this.target.copy(this.roost)
        speed = FLY_SPEED * 0.8
        wobble = 0.4
        if (this.position.distanceTo(this.roost) < 0.35) {
          this.position.copy(this.roost)
          this.flightVel.set(0, 0, 0)
          this.hangTime = HANG_MIN + Math.random() * (HANG_MAX - HANG_MIN)
          this.enter('hang')
        } else if (this.stateTime > 6 || !this.ceilingAbove(this.roost)) {
          this.roostTimer = 4 + Math.random() * 6
          this.enter('flutter')
        }
        break
      }
      case 'hang': {
        // Folded under the ceiling; let go if the roost is mined out
        this.flightVel.set(0, 0, 0)
        if (this.stateTime >= this.hangTime || !this.ceilingAbove(this.position)) this.enter('drop')
        break
      }
      case 'drop': {
        // Let go: falls a moment before the wings catch the air
        this.flightVel.y = Math.max(this.flightVel.y - 14 * deltaTime, -5)
        this.flightVel.x *= 0.9
        this.flightVel.z *= 0.9
        if (this.stateTime >= 0.45) {
          this.roostTimer = ROOST_EVERY_MIN + Math.random() * (ROOST_EVERY_MAX - ROOST_EVERY_MIN)
          this.enter('flutter')
          this.pickTarget()
        }
        break
      }
      case 'flee': {
        // Zig-zag away from the player, then calm down
        const from = player ?? this.spawnPoint
        this.tmp.set(this.position.x - from.x, 0, this.position.z - from.z)
        if (this.tmp.lengthSq() < 1e-4) this.tmp.set(Math.random() - 0.5, 0, Math.random() - 0.5)
        this.tmp.normalize()
        this.target.set(this.position.x + this.tmp.x * 5, this.position.y + Math.sin(this.time * 3 + this.phaseA) * 1.5, this.position.z + this.tmp.z * 5)
        speed = FLEE_SPEED
        wobble = 1.4
        if (this.stateTime >= FLEE_TIME) {
          this.enter('flutter')
          this.pickTarget()
        }
        break
      }
    }

    // Too far from home, or out under the sky: head back into the dark
    if (this.batState === 'flutter' || this.batState === 'flee') {
      const centre = this.flockCentre()
      if (this.position.distanceTo(this.spawnPoint) > LEASH || this.skyLight >= SKY_LIGHT_LIMIT) {
        this.target.copy(centre)
        if (this.batState === 'flee') this.enter('flutter')
      }
    }

    if (this.batState !== 'hang' && this.batState !== 'drop') this.steer(speed, wobble, deltaTime)
    if (this.batState !== 'hang') this.flyStep(deltaTime)
    this.face(deltaTime)
    this.syncTransform()
    this.isWalking = this.batState !== 'hang'
    this.updateAnimations(deltaTime)
  }

  private enter(state: BatState): void {
    this.batState = state
    this.stateTime = 0
  }

  /** Startled (hit, or the player too close): drop off a roost and flee. */
  private startle(): void {
    if (this.batState === 'hang' || this.batState === 'toRoost') {
      this.flightVel.set(0, -2, 0)
    }
    this.enter('flee')
    this.playFlutter()
  }

  /** The point the flock circles: the leader while it lives, else its own spawn point. */
  private flockCentre(): THREE.Vector3 {
    const leader = this.leader
    if (leader && leader.isAlive && !leader.isDying) return leader.position
    return this.spawnPoint
  }

  /** A new spot in clear cave air around the flock centre. */
  private pickTarget(): void {
    this.retargetTimer = RETARGET_MIN + Math.random() * (RETARGET_MAX - RETARGET_MIN)
    const centre = this.flockCentre()
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * WANDER_RADIUS
      const x = centre.x + Math.cos(a) * r
      const y = centre.y + (Math.random() * 2 - 1) * WANDER_HEIGHT
      const z = centre.z + Math.sin(a) * r
      if (this.tmp.set(x - this.spawnPoint.x, y - this.spawnPoint.y, z - this.spawnPoint.z).length() > LEASH) continue
      if (!this.clear(x, y, z)) continue
      this.target.set(x, y, z)
      return
    }
    this.target.copy(centre)
  }

  /**
   * A roost: the nearest ceiling straight above, with clear air all the way
   * up to it. Sets `roost` to the hanging position (hitbox just under it).
   */
  private findRoost(): boolean {
    const solid = this.solidAt
    if (!solid) return false
    const x = this.position.x
    const z = this.position.z
    for (let dy = 1; dy <= ROOST_SEARCH; dy++) {
      const by = Math.floor(this.position.y + HITBOX_HEIGHT) + dy - 1
      if (solid(Math.floor(x), by, Math.floor(z))) {
        const hangY = by - HITBOX_HEIGHT - 0.02
        if (hangY <= this.position.y - 0.5) return false
        if (!this.clear(x, hangY, z)) return false
        this.roost.set(x, hangY, z)
        return true
      }
      if (!this.clear(x, this.position.y + dy, z)) return false
    }
    return false
  }

  /** Solid block right above a hanging position (its roost still there). */
  private ceilingAbove(at: THREE.Vector3): boolean {
    const solid = this.solidAt
    if (!solid) return true
    return solid(Math.floor(at.x), Math.floor(at.y + HITBOX_HEIGHT + 0.1), Math.floor(at.z))
  }

  /** Steer toward the target, wobbling and darting - bats never fly straight. */
  private steer(speed: number, wobble: number, deltaTime: number): void {
    this.tmp.copy(this.target).sub(this.position)
    const dist = this.tmp.length()
    if (dist > 0.05) this.tmp.multiplyScalar(Math.min(speed, dist * 3) / dist)
    else this.tmp.set(0, 0, 0)
    const t = this.time
    this.tmp.x += Math.sin(t * 9.1 + this.phaseA) * 1.4 * wobble
    this.tmp.y += (Math.sin(t * 12.7 + this.phaseB) * 1.1 + Math.sin(t * 5.3) * 0.5) * wobble
    this.tmp.z += Math.cos(t * 8.3 + this.phaseC) * 1.4 * wobble
    this.flightVel.lerp(this.tmp, Math.min(1, deltaTime * 5))
    // Sharp little darts
    this.lurchTimer -= deltaTime
    if (this.lurchTimer <= 0 && wobble >= 1) {
      this.lurchTimer = 0.25 + Math.random() * 0.5
      const a = Math.random() * Math.PI * 2
      const m = 2 + Math.random() * 2.5
      this.flightVel.x += Math.cos(a) * m
      this.flightVel.z += Math.sin(a) * m
      this.flightVel.y += (Math.random() - 0.5) * m * 0.7
    }
  }

  /** Move by velocity·dt, sliding along solid blocks - never into rock. */
  private flyStep(deltaTime: number): void {
    const pos = this.position
    if (!this.clear(pos.x, pos.y, pos.z)) {
      // Knocked into a wall or foliage: drift down out of it
      pos.y -= deltaTime * 2
      return
    }
    const step = this.step.copy(this.flightVel).multiplyScalar(deltaTime)
    if (this.clear(pos.x + step.x, pos.y, pos.z)) pos.x += step.x
    else this.flightVel.x *= -0.4
    if (this.clear(pos.x, pos.y, pos.z + step.z)) pos.z += step.z
    else this.flightVel.z *= -0.4
    if (this.clear(pos.x, pos.y + step.y, pos.z)) pos.y += step.y
    else this.flightVel.y *= -0.4
  }

  /** The collision box (feet at y) is free of solid blocks. */
  private clear(x: number, y: number, z: number): boolean {
    const solid = this.solidAt
    if (!solid) return true
    for (const oy of [0.04, COLLIDE_HEIGHT]) {
      const by = Math.floor(y + oy)
      if (solid(Math.floor(x - HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x - HALF), by, Math.floor(z + HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z + HALF))) return false
    }
    return true
  }

  /** Turn toward the flight direction, banking into turns; rolled over while hanging. */
  private face(deltaTime: number): void {
    const mesh = this.getMesh()
    const pose = this.pose
    if (!mesh || !pose) return
    const dx = this.flightVel.x
    const dz = this.flightVel.z
    let bank = 0
    if (this.batState !== 'hang' && dx * dx + dz * dz > 0.04) {
      let delta = Math.atan2(dx, dz) - mesh.rotation.y
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      mesh.rotation.y += delta * Math.min(1, deltaTime * 9)
      bank = -delta * 0.7
    }
    const roll = this.batState === 'hang' ? Math.PI : bank
    pose.rotation.z += (roll - pose.rotation.z) * Math.min(1, deltaTime * (this.batState === 'hang' ? 6 : 8))
    const pitch = this.batState === 'hang' ? 0 : Math.max(-0.5, Math.min(0.5, -this.flightVel.y * 0.08))
    pose.rotation.x += (pitch - pose.rotation.x) * Math.min(1, deltaTime * 8)
  }

  private playFlutter(): void {
    if (this.sinceFlutter < 3) return
    this.sinceFlutter = 0
    this.soundPos.x = this.position.x
    this.soundPos.y = this.position.y + BODY_CENTER
    this.soundPos.z = this.position.z
    playSound('night.flutter', this.soundPos, { volume: 0.45, pitch: 1.6 })
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const physics = this.getPhysicsBody()
    if (physics) physics.position.copy(this.position)
  }

  protected updateAnimations(deltaTime: number): void {
    const hanging = this.batState === 'hang'
    // Fast leathery wingbeats; folded tight on a roost
    const rate = this.batState === 'flee' ? 30 : this.batState === 'drop' ? 14 : 24
    for (let i = 0; i < this.wings.length; i++) {
      const side = i === 0 ? -1 : 1
      const w = this.wings[i]
      const tip = this.wingTips[i]
      if (hanging) {
        w.rotation.z += (side * -1.1 - w.rotation.z) * Math.min(1, deltaTime * 8)
        w.rotation.y += (side * 0.9 - w.rotation.y) * Math.min(1, deltaTime * 8)
        tip.rotation.y += (side * 2.4 - tip.rotation.y) * Math.min(1, deltaTime * 8)
      } else {
        const beat = Math.sin(this.time * rate)
        w.rotation.z = side * (0.2 + 0.85 * beat)
        w.rotation.y += (0 - w.rotation.y) * Math.min(1, deltaTime * 10)
        // The tips lag the stroke, folding a little on the upstroke
        tip.rotation.z = side * 0.45 * Math.sin(this.time * rate - 0.9)
        tip.rotation.y += (side * (beat > 0 ? 0.35 : 0) - tip.rotation.y) * Math.min(1, deltaTime * 14)
      }
    }
    // Ears twitch now and then
    for (let i = 0; i < this.ears.length; i++) {
      const side = i === 0 ? -1 : 1
      const twitch = Math.max(0, Math.sin(this.time * 1.3 + i * 1.7 + this.phaseB) - 0.92) * 6
      this.ears[i].rotation.x = -twitch * 0.5
      this.ears[i].rotation.z = -side * (0.25 + twitch * 0.2)
    }
    // Veins breathe a soft glow; eyes stay bright
    if (this.veinMaterial) {
      this.veinMaterial.color.setHex(VEIN_GLOW).multiplyScalar(0.7 + 0.3 * Math.sin(this.time * 1.8 + this.phaseA))
    }
  }

  private animateDeath(deltaTime: number): void {
    for (let i = 0; i < this.wings.length; i++) {
      const side = i === 0 ? -1 : 1
      const w = this.wings[i]
      w.rotation.z += (side * -1 - w.rotation.z) * Math.min(1, deltaTime * 5)
      this.wingTips[i].rotation.y += (side * 2 - this.wingTips[i].rotation.y) * Math.min(1, deltaTime * 5)
    }
    if (this.veinMaterial) this.veinMaterial.color.lerp(this.deadColor, Math.min(1, deltaTime * 2))
    if (this.eyeMaterial) this.eyeMaterial.color.lerp(this.deadColor, Math.min(1, deltaTime * 2))
  }

  /** A hit startles it into flight (or kills it - 6 HP). */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!handled || this._isDying) return handled
    // The base class wrote the knockback into the physics body: fly it
    const physics = this.getPhysicsBody()
    if (physics) {
      this.flightVel.copy(physics.velocity)
      physics.velocity.set(0, 0, 0)
    }
    this.startle()
    return handled
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    return super.canPlayerInteract(playerPosition, maxDistance + 0.4)
  }

  dispose(): void {
    this.pose = null
    this.wings = []
    this.wingTips = []
    this.ears = []
    this.veinMaterial = null
    this.eyeMaterial = null
    this.player = null
    this.solidAt = null
    this.spawnFn = null
    this.leader = null
    super.dispose()
  }
}
