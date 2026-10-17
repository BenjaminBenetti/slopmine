import * as THREE from 'three'
import { Entity } from '../Entity.ts'
import type { IEntity } from '../interfaces/IEntity.ts'
import type { DamageSource } from '../../player/DamageModifiers.ts'
import { playerEffects, type StatusEffectId } from '../../player/effects/StatusEffects.ts'
import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../../physics/constants.ts'
import { ProjectileVisual, presetHitRadius, type ProjectilePreset } from './ProjectilePresets.ts'
import { playSound } from '../../audio/SoundHooks.ts'
import type { SoundId } from '../../audio/SoundLibrary.ts'

/** Launch and impact sounds per preset (custom meshes are magic bolts). */
const PROJECTILE_SOUNDS: Record<ProjectilePreset | 'custom', [launch: SoundId, impact: SoundId]> = {
  fireball: ['proj.fire', 'proj.fire.hit'],
  bone_shard: ['proj.bone', 'proj.hit'],
  ice_shard: ['proj.ice', 'proj.shatter'],
  crystal_shard: ['proj.crystal', 'proj.shatter'],
  spore_glob: ['proj.spore', 'proj.splat'],
  custom: ['proj.magic', 'proj.hit'],
}

/** A status effect a projectile applies to the player it hits. */
export interface ProjectileHitEffect {
  readonly id: StatusEffectId
  readonly seconds: number
  /** Default 1. */
  readonly level?: number
}

export interface ProjectileOptions {
  /** Spawn position (the projectile's centre), world blocks. */
  position: THREE.Vector3
  /** Initial velocity, blocks/s. */
  velocity: THREE.Vector3
  /** Damage dealt to the player on hit (before armor/potion modifiers). */
  damage: number
  /** Who fired it (guardian, mob). Projectiles never hit their owner. */
  owner?: IEntity | null
  /** Visual preset. Default 'fireball'. Ignored when `mesh` is given. */
  preset?: ProjectilePreset
  /**
   * Custom visual (built around its local origin, pointing along +Z). It is
   * oriented along the flight direction each frame.
   */
  mesh?: THREE.Object3D
  /** Dispose the custom `mesh` (geometries + materials) with the projectile. Default true. */
  disposeMesh?: boolean
  /** Visual size multiplier for presets. Default 1. */
  scale?: number
  /** Show the preset's trail (default: the preset's own choice). */
  trail?: boolean
  /** Hit radius in blocks (sphere vs player box). Default from the preset size. */
  radius?: number
  /** Downward acceleration, blocks/s² (arcing lobs; ~20-28 feels heavy). Default 0 = straight. */
  gravity?: number
  /** Seconds before it fizzles. Default 6. */
  lifetime?: number
  /** Homing turn rate toward the player's chest, rad/s (0.5 gentle, 2 aggressive). Default 0. */
  homing?: number
  /** Horizontal knockback along the flight direction on hit, blocks/s. Default 0. */
  knockback?: number
  /** Upward knockback on hit, blocks/s. Default 2.5 when `knockback` > 0, else 0. */
  knockbackUp?: number
  /** Status effect applied to the player on hit (e.g. poison, slowness). */
  effect?: ProjectileHitEffect
  /** Damage source for the modifier pipeline. Default 'projectile' (armor applies). */
  damageSource?: DamageSource
  /** Called after the projectile hit the player (damage already dealt). */
  onHitPlayer?: (projectile: ProjectileEntity) => void
  /** Called when it struck a solid block at (x, y, z) (block coords), before it is removed. */
  onHitBlock?: (projectile: ProjectileEntity, x: number, y: number, z: number) => void
  /** Called when its lifetime ran out. */
  onExpire?: (projectile: ProjectileEntity) => void
}

/** Max distance (blocks) a projectile moves per collision sub-step. */
const MAX_STEP = 0.25
/** Height of the aim point on the player (chest), above the feet. */
const PLAYER_CHEST = 1.1

/**
 * A straight, arcing or homing projectile (fireballs, bone shards, ice and
 * crystal shards, spore globs).
 *
 * Wiring comes from EntityManager like any entity: player position, the
 * player damage callback and the world query functions (duck-typed setters
 * below). It collides with solid blocks (sub-stepped, so fast shots don't
 * tunnel) and with the player's box (sphere test); it never collides with
 * other entities, and the player cannot hit it (no physics body).
 *
 * Spawn through `GuardianEntity.spawnProjectile()` (aims for you), or build
 * one directly and hand it to an entity spawn function
 * (`setEntitySpawnFn`, wired by EntityManager) / `entityManager.addEntity`.
 */
export class ProjectileEntity extends Entity {
  readonly type = 'projectile'

  readonly owner: IEntity | null
  readonly damage: number
  readonly radius: number
  readonly gravity: number
  readonly lifetime: number
  readonly homing: number

  private age = 0
  private launched = false
  private readonly options: ProjectileOptions
  private readonly visual: ProjectileVisual | null
  private readonly customMesh: THREE.Object3D | null
  private readonly customMeshHead: THREE.Object3D | null

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  private static readonly tmpDir = new THREE.Vector3()
  private static readonly tmpDesired = new THREE.Vector3()
  private static readonly tmpKnockback = new THREE.Vector3()
  private static readonly forward = new THREE.Vector3(0, 0, 1)

  constructor(options: ProjectileOptions) {
    super('projectile', { position: options.position, velocity: options.velocity, hasPhysics: false })
    this.options = options
    this.owner = options.owner ?? null
    this.damage = options.damage
    this.gravity = options.gravity ?? 0
    this.lifetime = options.lifetime ?? 6
    this.homing = options.homing ?? 0

    const scale = options.scale ?? 1
    const preset = options.preset ?? 'fireball'
    this.radius = options.radius ?? presetHitRadius(preset, scale)

    if (options.mesh) {
      this.visual = null
      this.customMeshHead = options.mesh
      this.customMesh = new THREE.Group().add(options.mesh)
    } else {
      this.visual = new ProjectileVisual(preset, scale, options.trail)
      this.customMesh = null
      this.customMeshHead = null
    }
  }

  /** Seconds since the projectile was fired. */
  get ageSeconds(): number {
    return this.age
  }

  // --- EntityManager wiring (duck-typed) -----------------------------------

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

  // --- Entity ---------------------------------------------------------------

  protected createMesh(): THREE.Object3D {
    return this.visual ? this.visual.root : this.customMesh!
  }

  /** Remove the projectile now (no hit callbacks). */
  destroy(): void {
    this.kill()
  }

  update(deltaTime: number): void {
    if (!this.isAlive) return
    const velocity = this.velocity!

    if (!this.launched) {
      this.launched = true
      playSound(this.sounds()[0], this.position)
    }

    this.age += deltaTime
    if (this.age >= this.lifetime) {
      this.options.onExpire?.(this)
      this.kill()
      return
    }

    if (this.homing > 0 && this.playerPositionRef) this.steerTowardPlayer(velocity, deltaTime)

    const speed = velocity.length() + Math.abs(this.gravity) * deltaTime
    const steps = Math.max(1, Math.ceil((speed * deltaTime) / MAX_STEP))
    const h = deltaTime / steps
    for (let i = 0; i < steps; i++) {
      velocity.y -= this.gravity * h
      this.position.addScaledVector(velocity, h)

      if (this.solidQuery) {
        const bx = Math.floor(this.position.x)
        const by = Math.floor(this.position.y)
        const bz = Math.floor(this.position.z)
        if (this.solidQuery(bx, by, bz)) {
          playSound(this.sounds()[1], this.position)
          this.options.onHitBlock?.(this, bx, by, bz)
          this.kill()
          return
        }
      }

      if (this.hitsPlayer()) {
        playSound(this.sounds()[1], this.position)
        this.hitPlayer(velocity)
        this.kill()
        return
      }
    }

    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    if (this.visual) {
      this.visual.update(deltaTime, velocity)
    } else if (this.customMeshHead && velocity.lengthSq() > 1e-8) {
      this.customMeshHead.quaternion.setFromUnitVectors(
        ProjectileEntity.forward,
        ProjectileEntity.tmpDir.copy(velocity).normalize()
      )
    }
  }

  /** Turn the velocity toward the player's chest by at most homing·dt radians. */
  private steerTowardPlayer(velocity: THREE.Vector3, deltaTime: number): void {
    const speed = velocity.length()
    if (speed < 1e-4) return
    const dir = ProjectileEntity.tmpDir.copy(velocity).divideScalar(speed)
    const desired = ProjectileEntity.tmpDesired.copy(this.playerPositionRef!)
    desired.y += PLAYER_CHEST
    desired.sub(this.position)
    const distance = desired.length()
    if (distance < 1e-4) return
    desired.divideScalar(distance)
    const angle = dir.angleTo(desired)
    if (angle < 1e-4) return
    const t = Math.min(1, (this.homing * deltaTime) / angle)
    dir.lerp(desired, t).normalize()
    velocity.copy(dir).multiplyScalar(speed)
  }

  /** Sphere (centre, radius) against the player's box (feet position, 0.6 × 1.8 × 0.6). */
  private hitsPlayer(): boolean {
    const player = this.playerPositionRef
    if (!player) return false
    const half = PLAYER_WIDTH / 2
    const cx = Math.max(player.x - half, Math.min(this.position.x, player.x + half))
    const cy = Math.max(player.y, Math.min(this.position.y, player.y + PLAYER_HEIGHT))
    const cz = Math.max(player.z - half, Math.min(this.position.z, player.z + half))
    const dx = this.position.x - cx
    const dy = this.position.y - cy
    const dz = this.position.z - cz
    return dx * dx + dy * dy + dz * dz <= this.radius * this.radius
  }

  private sounds(): [SoundId, SoundId] {
    return PROJECTILE_SOUNDS[this.options.mesh ? 'custom' : (this.options.preset ?? 'fireball')]
  }

  private hitPlayer(velocity: THREE.Vector3): void {
    const knockback = ProjectileEntity.tmpKnockback.set(0, 0, 0)
    const horizontal = this.options.knockback ?? 0
    if (horizontal > 0) {
      knockback.set(velocity.x, 0, velocity.z)
      if (knockback.lengthSq() > 1e-8) knockback.normalize().multiplyScalar(horizontal)
    }
    knockback.y = this.options.knockbackUp ?? (horizontal > 0 ? 2.5 : 0)

    // false = the hit was absorbed (i-frames, dead player): no on-hit effect either
    const landed = this.playerDamageCallback?.(this.damage, knockback, this.options.damageSource ?? 'projectile')
    const effect = this.options.effect
    if (effect && landed !== false) playerEffects.apply(effect.id, effect.seconds, effect.level ?? 1)
    this.options.onHitPlayer?.(this)
  }

  dispose(): void {
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.solidQuery = null
    // Preset visuals share geometry/materials across projectiles: never
    // dispose them. A custom mesh is disposed unless the caller keeps it.
    if (this.customMesh && (this.options.disposeMesh ?? true)) {
      super.dispose()
    }
  }
}
