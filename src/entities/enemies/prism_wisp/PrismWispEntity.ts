import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import type { IEntity } from '../../interfaces/IEntity.ts'
import { ProjectileEntity } from '../../projectiles/ProjectileEntity.ts'
import { PrismShardItem } from '../../../items/materials/prism_shard/PrismShardItem.ts'
import { CRYSTAL_LAVENDER, CRYSTAL_ROSE, CRYSTAL_VIOLET, EYE_GLOW } from '../crystal_shared/crystalPalette.ts'

/** Behaviour states of the wisp. */
enum WispState {
  /** Drifting around its home point, wings slowly beating */
  HOVER = 'hover',
  /** Circling the player at a distance, waiting for its moment */
  STALK = 'stalk',
  /** Telegraph: freezes and flares bright before a dart */
  CHARGE = 'charge',
  /** Straight-line dash through where the player was */
  DART = 'dart',
  /** Pulls back up and away after a dart */
  RECOVER = 'recover',
  /** Telegraph: hovers and glows, then fires a slow crystal bolt */
  BOLT = 'bolt',
}

const MAX_HEALTH = 20
const DETECTION_RANGE = 28
const LOSE_INTEREST_RANGE = 40
const DART_DAMAGE = 6
const DART_SPEED = 15
const DART_MAX_TIME = 0.9
const DART_HIT_RADIUS = 1.3
const CHARGE_TIME = 0.75
const RECOVER_TIME = 1.4
const ATTACK_COOLDOWN = 3.2
const STALK_RADIUS = 7
const STALK_HEIGHT = 4
const FLY_SPEED = 5.5
const HOVER_SPEED = 2.0
const KNOCKBACK_SPEED = 7
const KNOCKBACK_STUN = 0.7
const BOLT_CHARGE_TIME = 0.6
const BOLT_SPEED = 9
const BOLT_DAMAGE = 4
const BOLT_MIN_RANGE = 5
const BOLT_MAX_RANGE = 24
const DEATH_DURATION = 1.0
const DEATH_GRAVITY = -18
/** Hitbox; the wisp's position is its body's centre, so the box is centred on it (feet = position - height/2) */
const HITBOX = new THREE.Vector3(1.0, 0.8, 1.0)

/**
 * Prism Wisp - a crystal moth of the Crystal Abyss: a glowing faceted
 * crystal body on four translucent violet wings. It drifts among the spires,
 * circles intruders, then freezes and flares bright (telegraph) before
 * darting through them in a straight line, pulling away to circle again.
 * From range it glows and fires slow crystal bolts instead (dodgeable).
 *
 * 20 HP, dart hits 6, bolt hits 4. Drops 1-2 prism shards.
 */
export class PrismWispEntity extends Entity {
  readonly type = 'prism_wisp'

  private wispState: WispState = WispState.HOVER
  private stateTimer = 0
  private health = MAX_HEALTH
  private attackCooldown = 1 + Math.random() * 2
  private knockbackTimer = 0
  private readonly knockbackVelocity = new THREE.Vector3()
  private _isDying = false
  private deathTimer = 0
  private deathVelocityY = 0
  private dropsCollected = false
  private hasHit = false

  private readonly home = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly dartDir = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private orbitAngle = Math.random() * Math.PI * 2
  private wanderTimer = 0

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null
  private entitySpawnFn: ((entity: IEntity) => boolean) | null = null

  private wingPhase = Math.random() * Math.PI * 2
  private wings: THREE.Object3D[] = []
  private bodyGroup: THREE.Group | null = null
  private coreMaterial: THREE.MeshLambertMaterial | null = null

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('prism_wisp', { ...config, hasPhysics: true, hitboxSize: HITBOX })
    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = true // flight is steered manually
      body.position.y -= HITBOX.y / 2 // centred on the body (see syncMesh)
    }
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
    this.solidQuery = solidQuery
  }

  /** Wired by EntityManager (duck-typed): lets the wisp fire projectiles. */
  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.entitySpawnFn = spawn
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.bodyGroup = body

    this.coreMaterial = new THREE.MeshLambertMaterial({
      color: CRYSTAL_VIOLET,
      emissive: new THREE.Color(CRYSTAL_VIOLET),
      emissiveIntensity: 0.7,
    })
    const tipMaterial = new THREE.MeshLambertMaterial({
      color: CRYSTAL_ROSE,
      emissive: new THREE.Color(CRYSTAL_ROSE),
      emissiveIntensity: 0.6,
    })
    const wingMaterial = new THREE.MeshLambertMaterial({
      color: CRYSTAL_LAVENDER,
      emissive: new THREE.Color(CRYSTAL_VIOLET),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE_GLOW })
    this.registerMaterialForLighting(this.coreMaterial)
    this.registerMaterialForLighting(tipMaterial)
    this.registerMaterialForLighting(wingMaterial)

    // Faceted crystal body: an elongated octahedron with a rose tail shard
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), this.coreMaterial)
    core.scale.set(1, 0.8, 1.6)
    body.add(core)
    const tail = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), tipMaterial)
    tail.scale.set(1, 1, 2.6)
    tail.position.set(0, 0, -0.5)
    body.add(tail)
    for (const x of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), eyeMaterial)
      eye.position.set(x, 0.06, 0.43)
      body.add(eye)
      const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.3), tipMaterial)
      antenna.position.set(x * 1.6, 0.14, 0.55)
      antenna.rotation.set(-0.5, x * 3, 0)
      body.add(antenna)
    }

    // Four moth wings, hinged at the body
    this.wings = []
    const wingDefs: Array<[number, number, number, number]> = [
      // side, z offset, length, width
      [-1, 0.1, 0.75, 0.5],
      [1, 0.1, 0.75, 0.5],
      [-1, -0.22, 0.55, 0.38],
      [1, -0.22, 0.55, 0.38],
    ]
    for (const [side, z, length, width] of wingDefs) {
      const hinge = new THREE.Group()
      hinge.position.set(side * 0.12, 0.05, z)
      const wing = new THREE.Mesh(new THREE.BoxGeometry(length, 0.01, width), wingMaterial)
      wing.position.set(side * length / 2, 0, 0)
      hinge.add(wing)
      hinge.userData.side = side
      body.add(hinge)
      this.wings.push(hinge)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [root, body, ...this.wings],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  update(deltaTime: number): void {
    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)
    this.stateTimer += deltaTime

    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      this.knockbackVelocity.multiplyScalar(Math.pow(0.1, deltaTime))
      this.moveBy(this.knockbackVelocity.x * deltaTime, this.knockbackVelocity.y * deltaTime, this.knockbackVelocity.z * deltaTime)
      this.syncMesh()
      this.animate(deltaTime, 0.4)
      return
    }

    const player = this.playerPositionRef
    const distToPlayer = player ? this.position.distanceTo(player) : Infinity

    switch (this.wispState) {
      case WispState.HOVER:
        this.wanderTimer -= deltaTime
        if (this.wanderTimer <= 0 || this.position.distanceTo(this.target) < 1) {
          this.wanderTimer = 3 + Math.random() * 4
          this.target.set(
            this.home.x + (Math.random() - 0.5) * 16,
            this.home.y + (Math.random() - 0.5) * 6,
            this.home.z + (Math.random() - 0.5) * 16
          )
        }
        this.flyToward(this.target, HOVER_SPEED, deltaTime)
        if (player && distToPlayer < DETECTION_RANGE) this.setState(WispState.STALK)
        break

      case WispState.STALK:
        if (!player || distToPlayer > LOSE_INTEREST_RANGE) {
          this.home.copy(this.position)
          this.setState(WispState.HOVER)
          break
        }
        this.orbitAngle += deltaTime * 0.9
        this.target.set(
          player.x + Math.cos(this.orbitAngle) * STALK_RADIUS,
          player.y + STALK_HEIGHT + Math.sin(this.orbitAngle * 2.3) * 1.2,
          player.z + Math.sin(this.orbitAngle) * STALK_RADIUS
        )
        this.flyToward(this.target, FLY_SPEED, deltaTime)
        if (this.attackCooldown <= 0 && this.stateTimer > 1.5) {
          const canDart = distToPlayer < STALK_RADIUS + 4
          const canBolt = distToPlayer >= BOLT_MIN_RANGE && distToPlayer <= BOLT_MAX_RANGE &&
            this.entitySpawnFn !== null && this.hasLineOfSight(player)
          if (canBolt && (!canDart || Math.random() < 0.4)) this.setState(WispState.BOLT)
          else if (canDart) this.setState(WispState.CHARGE)
        }
        break

      case WispState.BOLT:
        if (player) this.face(player)
        if (this.stateTimer >= BOLT_CHARGE_TIME) {
          if (player) this.fireBolt(player)
          this.attackCooldown = ATTACK_COOLDOWN * 0.8
          this.setState(WispState.STALK)
        }
        break

      case WispState.CHARGE:
        // Telegraph: hold position, flare bright, face the player
        if (player) this.face(player)
        if (this.stateTimer >= CHARGE_TIME && player) {
          this.dartDir.copy(player).sub(this.position)
          this.dartDir.y += 0.9 // aim at the chest, not the feet
          this.dartDir.normalize()
          this.hasHit = false
          this.setState(WispState.DART)
        }
        break

      case WispState.DART: {
        const step = DART_SPEED * deltaTime
        if (!this.moveBy(this.dartDir.x * step, this.dartDir.y * step, this.dartDir.z * step)) {
          this.endDart()
          break
        }
        if (player && !this.hasHit) {
          this.tmp.copy(player)
          this.tmp.y += 0.9
          if (this.position.distanceTo(this.tmp) < DART_HIT_RADIUS) {
            this.hasHit = true
            this.hitPlayer()
          }
        }
        if (this.stateTimer >= DART_MAX_TIME) this.endDart()
        break
      }

      case WispState.RECOVER:
        this.tmp.copy(this.position)
        this.tmp.y += 6
        this.flyToward(this.tmp, FLY_SPEED, deltaTime)
        if (this.stateTimer >= RECOVER_TIME) this.setState(WispState.STALK)
        break
    }

    this.syncMesh()
    const flare = this.wispState === WispState.CHARGE
      ? 1 + 2.5 * Math.min(1, this.stateTimer / CHARGE_TIME)
      : this.wispState === WispState.BOLT
        ? 0.8 + 2 * Math.min(1, this.stateTimer / BOLT_CHARGE_TIME)
        : 0
    this.animate(deltaTime, flare)
  }

  private setState(state: WispState): void {
    this.wispState = state
    this.stateTimer = 0
  }

  private endDart(): void {
    this.attackCooldown = ATTACK_COOLDOWN
    this.setState(WispState.RECOVER)
  }

  private hitPlayer(): void {
    if (!this.playerDamageCallback || !this.playerPositionRef) return
    const knockback = new THREE.Vector3(this.dartDir.x, 0, this.dartDir.z)
    if (knockback.lengthSq() > 0) knockback.normalize()
    knockback.multiplyScalar(6)
    knockback.y = 4
    this.playerDamageCallback(DART_DAMAGE, knockback)
  }

  /** A slow crystal bolt aimed at the player's chest. */
  private fireBolt(player: THREE.Vector3): void {
    if (!this.entitySpawnFn) return
    const from = this.position.clone()
    from.y += 0.1
    const velocity = new THREE.Vector3(player.x, player.y + 1.1, player.z).sub(from)
    if (velocity.lengthSq() < 1e-4) return
    velocity.normalize().multiplyScalar(BOLT_SPEED)
    this.entitySpawnFn(new ProjectileEntity({
      position: from,
      velocity,
      damage: BOLT_DAMAGE,
      owner: this,
      preset: 'crystal_shard',
      scale: 0.9,
      lifetime: 4,
      knockback: 2,
    }))
  }

  /** No solid block between the wisp and the player's eyes. */
  private hasLineOfSight(player: THREE.Vector3): boolean {
    if (!this.solidQuery) return true
    const tx = player.x, ty = player.y + 1.6, tz = player.z
    const dist = Math.hypot(tx - this.position.x, ty - this.position.y, tz - this.position.z)
    const steps = Math.ceil(dist / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidQuery(
        Math.floor(this.position.x + (tx - this.position.x) * t),
        Math.floor(this.position.y + (ty - this.position.y) * t),
        Math.floor(this.position.z + (tz - this.position.z) * t)
      )) return false
    }
    return true
  }

  /** Move by a delta unless it would enter a solid block. Returns false if blocked. */
  private moveBy(dx: number, dy: number, dz: number): boolean {
    const nx = this.position.x + dx
    const ny = this.position.y + dy
    const nz = this.position.z + dz
    if (this.solidQuery && this.solidQuery(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
      // Try sliding vertically out of trouble
      if (!this.solidQuery(Math.floor(this.position.x), Math.floor(this.position.y + 0.6), Math.floor(this.position.z))) {
        this.position.y += Math.abs(dy) + 0.05
      }
      return false
    }
    this.position.set(nx, ny, nz)
    return true
  }

  private flyToward(target: THREE.Vector3, speed: number, deltaTime: number): void {
    this.tmp.copy(target).sub(this.position)
    const dist = this.tmp.length()
    if (dist < 0.05) return
    this.tmp.multiplyScalar(Math.min(dist, speed * deltaTime) / dist)
    if (!this.moveBy(this.tmp.x, this.tmp.y, this.tmp.z)) {
      // Blocked: pick a new target (up and to the side)
      this.wanderTimer = 0
      this.target.copy(this.position)
      this.target.y += 3
    }
    this.face(target)
  }

  private face(point: THREE.Vector3): void {
    const mesh = this.getMesh()
    if (!mesh) return
    const dx = point.x - this.position.x
    const dz = point.z - this.position.z
    if (dx * dx + dz * dz > 0.0001) mesh.rotation.y = Math.atan2(dx, dz)
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    // The model is centred on the position: so is the hitbox (its "feet" half a box lower)
    const body = this.getPhysicsBody()
    if (body) body.position.set(this.position.x, this.position.y - HITBOX.y / 2, this.position.z)
  }

  private animate(deltaTime: number, flare: number): void {
    const flapping = this.wispState !== WispState.CHARGE
    this.wingPhase += deltaTime * (flapping ? (this.wispState === WispState.DART ? 22 : 9) : 2)
    const flap = flapping ? Math.sin(this.wingPhase) * 0.7 : 0.9
    for (const hinge of this.wings) {
      const side = hinge.userData.side as number
      hinge.rotation.z = side * flap
    }
    if (this.bodyGroup) this.bodyGroup.position.y = Math.sin(this.wingPhase * 0.5) * 0.06
    if (this.coreMaterial) {
      this.coreMaterial.emissiveIntensity = 0.6 + 0.15 * Math.sin(this.wingPhase * 0.3) + flare
    }
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    this.deathVelocityY += DEATH_GRAVITY * deltaTime
    const ny = this.position.y + this.deathVelocityY * deltaTime
    if (!this.solidQuery || !this.solidQuery(Math.floor(this.position.x), Math.floor(ny), Math.floor(this.position.z))) {
      this.position.y = ny
    }
    const mesh = this.getMesh()
    if (mesh) {
      mesh.rotation.z += deltaTime * 6
      mesh.scale.setScalar(Math.max(0.01, 1 - this.deathTimer / DEATH_DURATION))
    }
    this.syncMesh()
    if (this.deathTimer >= DEATH_DURATION) this.kill()
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying) return false
    return this.position.distanceTo(playerPosition) <= maxDistance
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = []
    const count = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < count; i++) drops.push(new PrismShardItem())
    return drops
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick) return false
    if (!this.isAlive || this._isDying) return false

    this.health -= getPlayerAttackDamage(heldItem)
    const impact = getPlayerAttackKnockback(heldItem)

    this.tmp.copy(this.position).sub(playerPosition)
    this.tmp.y = 0
    if (this.tmp.lengthSq() > 0) this.tmp.normalize()
    else this.tmp.set(1, 0, 0)

    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.deathVelocityY = 2
      return true
    }

    // Knocked tumbling back; the next attack waits
    this.knockbackVelocity.set(this.tmp.x * KNOCKBACK_SPEED * impact, 2.5 * impact, this.tmp.z * KNOCKBACK_SPEED * impact)
    this.knockbackTimer = KNOCKBACK_STUN * impact
    this.attackCooldown = Math.max(this.attackCooldown, 1.5)
    if (this.wispState === WispState.DART || this.wispState === WispState.CHARGE || this.wispState === WispState.BOLT) {
      this.hasHit = true
      this.setState(WispState.RECOVER)
    } else if (this.wispState === WispState.HOVER) {
      this.setState(WispState.STALK)
    }
    return true
  }

  onSpawn(): void {
    this.home.copy(this.position)
    this.home.y += 4
    this.target.copy(this.home)
  }

  dispose(): void {
    this.wings = []
    this.bodyGroup = null
    this.coreMaterial = null
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.solidQuery = null
    this.entitySpawnFn = null
    super.dispose()
  }
}
