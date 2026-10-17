import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { RimeCrystalItem } from '../../../items/materials/rime_crystal/RimeCrystalItem.ts'
import { CorruptedEssenceItem } from '../../../items/materials/corrupted_essence/CorruptedEssenceItem.ts'

enum WraithState {
  /** Drifting around its haunt, waiting */
  HOVER = 'hover',
  /** Circling above the player at a distance */
  STALK = 'stalk',
  /** Telegraph: stops, raises its claws, eyes flare */
  WINDUP = 'windup',
  /** Diving at the player */
  DIVE = 'dive',
  /** Pulling away after a dive */
  RETREAT = 'retreat',
}

// Combat (DESIGN §8: Hell mobs 16-45 HP, hits 4-9)
const MAX_HEALTH = 22
const ATTACK_DAMAGE = 5
const DETECTION_RANGE = 28
const LOSE_RANGE = 44
const HIT_RADIUS = 1.4
const FROSTBITE_SECONDS = 4
const ATTACK_KNOCKBACK_H = 4.5
const ATTACK_KNOCKBACK_V = 3
const ATTACK_COOLDOWN = 3.5

// Movement (blocks/s)
const HOVER_SPEED = 2.2
const STALK_SPEED = 4.5
const DIVE_SPEED = 11
const RETREAT_SPEED = 6
const STALK_RADIUS = 6
const STALK_HEIGHT = 3.5
const WINDUP_TIME = 0.55
const DIVE_MAX_TIME = 1.6
const RETREAT_TIME = 1.3
const MAX_Y = 125

// Being hit
const KNOCKBACK_SPEED = 7
const KNOCKBACK_TIME = 0.6

// Death: sinks and fades into frost
const DEATH_TIME = 1.1

const ROBE = 0x56677d
const ROBE_DARK = 0x3d4a5c
const HOOD = 0x2a3342
const FROST = 0xbcd3e6
const VOID = 0x05070b
const EYE = 0xaef6ff

export interface IFrostWraithConfig extends Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'> {}

/**
 * Frost Wraith - a hooded, tattered shade of the frozen lake. Haunts Cocytus
 * in the air: it circles above its prey, stops to raise its claws (eyes
 * flaring - the telegraph), then dives. A hit chills the player with
 * Frostbite (slowness). Knocked back by blows, it pulls away and circles
 * again. Flies freely (no gravity) but cannot pass through ice or rock.
 *
 * Stats: 22 HP, 5 damage + Frostbite 4 s, 28-block detection.
 * Drops: 0-1 rime crystal (35%), 0-1 corrupted essence.
 */
export class FrostWraithEntity extends Entity {
  readonly type = 'frost_wraith'

  private state_ = WraithState.HOVER
  private stateTimer = 0
  private health = MAX_HEALTH
  private attackCooldown = 1.5
  private hasHit = false
  private knockbackTimer = 0
  private readonly knockbackVelocity = new THREE.Vector3()
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false

  private readonly home = new THREE.Vector3()
  private orbitAngle = Math.random() * Math.PI * 2
  private time = Math.random() * 100

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null
  private solidQueryFn: ((x: number, y: number, z: number) => boolean) | null = null

  // Mesh parts
  private body: THREE.Group | null = null
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private readonly tatters: THREE.Group[] = []
  private eyeMaterial: THREE.MeshBasicMaterial | null = null

  private readonly tmp = new THREE.Vector3()
  private readonly moveDir = new THREE.Vector3()

  constructor(config: IFrostWraithConfig) {
    super('frost_wraith', {
      ...config,
      hasPhysics: true, // hitbox for player attacks
      hitboxSize: new THREE.Vector3(0.8, 1.9, 0.8),
    })
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
    // Spawned on the ground: rise to haunting height
    this.position.y += 3
    this.home.copy(this.position)
  }

  get isDying(): boolean {
    return this._isDying
  }

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    this.playerDamageCallback = callback
  }

  setWorldQueryFns(
    _blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.solidQueryFn = solidQuery
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.body = body

    const robe = new THREE.MeshLambertMaterial({ color: ROBE })
    const robeDark = new THREE.MeshLambertMaterial({ color: ROBE_DARK })
    const hood = new THREE.MeshLambertMaterial({ color: HOOD })
    const frost = new THREE.MeshLambertMaterial({ color: FROST })
    const voidMat = new THREE.MeshLambertMaterial({ color: VOID })
    for (const m of [robe, robeDark, hood, frost, voidMat]) this.registerMaterialForLighting(m)
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE })

    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      parent.add(mesh)
      return mesh
    }

    // Hood, face void, eyes, frost rim
    box(body, 0.62, 0.6, 0.62, 0, 1.58, -0.02, hood)
    box(body, 0.66, 0.12, 0.5, 0, 1.92, -0.06, hood) // peak
    box(body, 0.42, 0.38, 0.05, 0, 1.52, 0.29, voidMat)
    box(body, 0.09, 0.06, 0.02, -0.1, 1.56, 0.32, this.eyeMaterial)
    box(body, 0.09, 0.06, 0.02, 0.1, 1.56, 0.32, this.eyeMaterial)
    box(body, 0.66, 0.06, 0.08, 0, 1.3, 0.3, frost) // rimed hood edge
    // Robe: three tapering tiers
    box(body, 0.86, 0.5, 0.56, 0, 1.08, 0, robe)
    box(body, 0.74, 0.5, 0.5, 0, 0.64, 0, robeDark)
    box(body, 0.6, 0.42, 0.42, 0, 0.22, 0, robe)
    box(body, 0.88, 0.07, 0.58, 0, 1.33, 0, frost) // frosted shoulders

    // Tattered hem strips (sway)
    const hem: ReadonlyArray<readonly [number, number]> = [[-0.22, 0.16], [0.02, 0.18], [0.24, 0.14], [-0.18, -0.16], [0.2, -0.17]]
    for (const [x, z] of hem) {
      const strip = new THREE.Group()
      strip.position.set(x, 0.02, z)
      box(strip, 0.12, 0.5, 0.08, 0, -0.25, 0, robeDark)
      body.add(strip)
      this.tatters.push(strip)
    }

    // Arms: long sleeves with frost-white claws, pivot at the shoulders
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 0.47, 1.22, 0.02)
      box(arm, 0.2, 0.72, 0.2, 0, -0.34, 0, robe)
      box(arm, 0.24, 0.08, 0.24, 0, -0.7, 0, frost)
      for (const cx of [-0.06, 0, 0.06]) box(arm, 0.04, 0.2, 0.04, cx, -0.84, 0.04, frost)
      body.add(arm)
      return arm
    }
    this.leftArm = makeArm(-1)
    this.rightArm = makeArm(1)

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, this.leftArm, this.rightArm, ...this.tatters],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  update(deltaTime: number): void {
    this.time += deltaTime
    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      this.tmp.copy(this.knockbackVelocity).multiplyScalar(deltaTime)
      this.tryMove(this.tmp)
      this.knockbackVelocity.multiplyScalar(Math.max(0, 1 - deltaTime * 3))
      this.syncTransforms()
      this.animate(deltaTime)
      return
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)
    this.stateTimer += deltaTime
    const player = this.playerPositionRef
    const dist = player ? this.position.distanceTo(player) : Infinity

    switch (this.state_) {
      case WraithState.HOVER: {
        this.tmp.set(
          this.home.x + Math.sin(this.time * 0.37) * 3,
          this.home.y + Math.sin(this.time * 0.9) * 0.6,
          this.home.z + Math.cos(this.time * 0.29) * 3
        )
        this.flyToward(this.tmp, HOVER_SPEED, deltaTime)
        if (dist <= DETECTION_RANGE) this.setState(WraithState.STALK)
        break
      }
      case WraithState.STALK: {
        if (!player || dist > LOSE_RANGE) {
          this.home.copy(this.position)
          this.setState(WraithState.HOVER)
          break
        }
        this.orbitAngle += deltaTime * 0.7
        this.tmp.set(
          player.x + Math.cos(this.orbitAngle) * STALK_RADIUS,
          player.y + STALK_HEIGHT + Math.sin(this.time * 1.3) * 0.5,
          player.z + Math.sin(this.orbitAngle) * STALK_RADIUS
        )
        this.flyToward(this.tmp, STALK_SPEED, deltaTime)
        if (this.attackCooldown <= 0 && dist < 11) this.setState(WraithState.WINDUP)
        break
      }
      case WraithState.WINDUP: {
        this.faceToward(player)
        if (this.stateTimer >= WINDUP_TIME) {
          this.hasHit = false
          this.setState(WraithState.DIVE)
        }
        break
      }
      case WraithState.DIVE: {
        if (!player) {
          this.setState(WraithState.RETREAT)
          break
        }
        this.tmp.set(player.x, player.y + 0.9, player.z)
        this.flyToward(this.tmp, DIVE_SPEED, deltaTime)
        if (!this.hasHit && this.position.distanceTo(this.tmp) <= HIT_RADIUS) {
          this.strike()
          this.setState(WraithState.RETREAT)
        } else if (this.stateTimer >= DIVE_MAX_TIME) {
          this.setState(WraithState.RETREAT)
        }
        break
      }
      case WraithState.RETREAT: {
        if (player) {
          this.moveDir.copy(this.position).sub(player)
          this.moveDir.y = 0
          if (this.moveDir.lengthSq() < 1e-4) this.moveDir.set(1, 0, 0)
          this.moveDir.normalize()
          this.moveDir.y = 0.8
          this.moveDir.normalize().multiplyScalar(RETREAT_SPEED * deltaTime)
          this.tryMove(this.moveDir)
        }
        if (this.stateTimer >= RETREAT_TIME) {
          this.attackCooldown = ATTACK_COOLDOWN
          this.setState(WraithState.STALK)
        }
        break
      }
    }

    this.syncTransforms()
    this.animate(deltaTime)
  }

  private setState(state: WraithState): void {
    this.state_ = state
    this.stateTimer = 0
  }

  private strike(): void {
    this.hasHit = true
    const player = this.playerPositionRef
    if (!player || !this.playerDamageCallback) return
    const kb = this.tmp.copy(player).sub(this.position)
    kb.y = 0
    if (kb.lengthSq() > 0) kb.normalize()
    kb.multiplyScalar(ATTACK_KNOCKBACK_H)
    kb.y = ATTACK_KNOCKBACK_V
    this.playerDamageCallback(ATTACK_DAMAGE, kb)
    playerEffects.apply(StatusEffectIds.SLOWNESS, FROSTBITE_SECONDS, 1)
  }

  /** Move toward a point at a speed, steering around solid blocks by rising. */
  private flyToward(target: THREE.Vector3, speed: number, deltaTime: number): void {
    this.moveDir.copy(target).sub(this.position)
    const d = this.moveDir.length()
    if (d < 0.05) return
    const step = Math.min(d, speed * deltaTime)
    this.moveDir.multiplyScalar(step / d)
    this.faceToward(target)
    this.tryMove(this.moveDir)
  }

  private tryMove(delta: THREE.Vector3): void {
    const nx = this.position.x + delta.x
    const ny = Math.min(MAX_Y, this.position.y + delta.y)
    const nz = this.position.z + delta.z
    if (!this.isBlocked(nx, ny, nz)) {
      this.position.set(nx, ny, nz)
      return
    }
    // Blocked: rise over the obstacle instead (ice spires, ridges, walls)
    const up = Math.max(Math.abs(delta.x) + Math.abs(delta.z), 0.05)
    if (!this.isBlocked(this.position.x, this.position.y + up, this.position.z)) {
      this.position.y = Math.min(MAX_Y, this.position.y + up)
    }
  }

  private isBlocked(x: number, y: number, z: number): boolean {
    const q = this.solidQueryFn
    if (!q) return false
    const bx = Math.floor(x), bz = Math.floor(z)
    return q(bx, Math.floor(y + 0.1), bz) || q(bx, Math.floor(y + 1.0), bz) || q(bx, Math.floor(y + 1.8), bz)
  }

  private faceToward(target: THREE.Vector3 | null): void {
    const mesh = this.getMesh()
    if (!mesh || !target) return
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (dx * dx + dz * dz > 1e-4) mesh.rotation.y = Math.atan2(dx, dz)
  }

  private syncTransforms(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const body = this.getPhysicsBody()
    if (body) body.position.copy(this.position)
  }

  private animate(_deltaTime: number): void {
    if (this.body) this.body.position.y = Math.sin(this.time * 2.1) * 0.12
    for (let i = 0; i < this.tatters.length; i++) {
      const t = this.tatters[i]
      t.rotation.x = Math.sin(this.time * 3.1 + i * 1.7) * 0.35
      t.rotation.z = Math.cos(this.time * 2.3 + i * 2.1) * 0.25
    }
    let armX = Math.sin(this.time * 1.5) * 0.15 - 0.2
    let eye = 0.75 + 0.25 * Math.sin(this.time * 4)
    if (this.state_ === WraithState.WINDUP) {
      const p = Math.min(1, this.stateTimer / WINDUP_TIME)
      armX = -0.2 - 2.4 * p // claws raised high
      eye = 1 + p
    } else if (this.state_ === WraithState.DIVE) {
      armX = -1.5 // claws thrust forward
      eye = 1.6
    }
    if (this.leftArm) this.leftArm.rotation.x = armX
    if (this.rightArm) this.rightArm.rotation.x = armX
    if (this.eyeMaterial) {
      const v = Math.min(1, eye)
      this.eyeMaterial.color.setRGB(0.68 * v + 0.2, 0.96 * v, v)
    }
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    const mesh = this.getMesh()
    const p = Math.min(1, this.deathTimer / DEATH_TIME)
    if (mesh) {
      mesh.scale.setScalar(Math.max(0.05, 1 - p))
      mesh.rotation.y += deltaTime * 6
    }
    this.position.y -= deltaTime * 0.8
    this.syncTransforms()
    if (this.deathTimer >= DEATH_TIME) this.kill()
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying) return false
    return this.position.distanceTo(playerPosition) <= maxDistance
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    this.health -= getPlayerAttackDamage(heldItem)
    // Weapon knockback x attack charge scales the push (every hit still
    // breaks off a dive)
    const knockback = getPlayerAttackKnockback(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }
    // Knocked away and up; then it retreats and circles again
    this.knockbackVelocity.copy(this.position).sub(playerPosition)
    this.knockbackVelocity.y = 0
    if (this.knockbackVelocity.lengthSq() < 1e-4) this.knockbackVelocity.set(1, 0, 0)
    this.knockbackVelocity.normalize().multiplyScalar(KNOCKBACK_SPEED * knockback)
    this.knockbackVelocity.y = 2.5 * Math.min(1, knockback)
    this.knockbackTimer = KNOCKBACK_TIME
    this.hasHit = true
    this.setState(WraithState.RETREAT)
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = []
    if (Math.random() < 0.35) drops.push(new RimeCrystalItem())
    if (Math.random() < 0.5) drops.push(new CorruptedEssenceItem())
    return drops
  }

  dispose(): void {
    this.body = null
    this.leftArm = null
    this.rightArm = null
    this.tatters.length = 0
    this.eyeMaterial = null
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.solidQueryFn = null
    super.dispose()
  }
}
