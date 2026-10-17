import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { EctoplasmItem } from '../../../items/materials/ectoplasm/EctoplasmItem.ts'
import { SoulShardItem } from '../../../items/materials/soul_shard/SoulShardItem.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/** Behaviour states. */
enum WraithState {
  /** Hovering and drifting, no target */
  DRIFT,
  /** Circling the player at a distance */
  STALK,
  /** Telegraph before a lunge: rears back, arms up, eyes flare */
  WINDUP,
  /** Fast straight lunge through the player's position */
  LUNGE,
  /** Backing off after a lunge */
  RECOVER,
}

// Combat (DESIGN §8: Hell mobs 16-45 HP, hits 4-9)
const MAX_HEALTH = 24
const ATTACK_DAMAGE = 6
const DETECTION_RANGE = 28
const LOSE_RANGE = 40
const CHILL_SECONDS = 3 // slowness from the wraith's touch
const KNOCKBACK_H = 5
const KNOCKBACK_V = 3

// Movement (blocks/s)
const DRIFT_SPEED = 1.5
const STALK_SPEED = 4.5
const LUNGE_SPEED = 15
const STALK_RADIUS = 6
const STALK_HEIGHT = 2.2
const WINDUP_TIME = 0.7
const LUNGE_MAX_TIME = 0.7
const RECOVER_TIME = 2.2
const ATTACK_COOLDOWN = 3.0
const HIT_RADIUS = 1.4

// Being hit
const HIT_STUN = 0.5
const HIT_PUSH = 6

// Death: fade out while rising
const DEATH_DURATION = 1.2

// Colours: pale grey-green shroud, bone hands, sickly green soul eyes
const SHROUD = 0xb9c4b4
const SHROUD_DARK = 0x6f7a6e
const HOOD_SHADOW = 0x141a16
const BONE = 0xd8d0bc
const SOUL_GREEN = 0x7dffa6

const SCALE = 0.06

/**
 * Wraith - a hooded, tattered spectre that haunts the Ossuary's air. It
 * drifts through the cavern, circles a player it notices, rears back (eyes
 * flaring) and lunges with skeletal claws whose touch chills (slowness).
 * Passes through rock like the ghost it is.
 *
 * Stats: 24 HP, 6 damage + 3 s slowness, 28 block detection.
 * Drops: 1-2 ectoplasm, 12% a soul shard.
 */
export class WraithEntity extends Entity {
  readonly type = 'wraith'

  private ai = WraithState.DRIFT
  private stateTimer = 0
  private health = MAX_HEALTH
  private attackCooldown = 1.5
  private stunTimer = 0
  private hasHit = false
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  private readonly velocity3 = new THREE.Vector3()
  private readonly lungeDir = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly driftTarget = new THREE.Vector3()
  private orbitAngle = Math.random() * Math.PI * 2
  private bobPhase = Math.random() * Math.PI * 2

  // Mesh parts
  private body: THREE.Group | null = null
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private readonly tatters: THREE.Mesh[] = []
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private readonly fadeMaterials: THREE.Material[] = []

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('wraith', {
      ...config,
      hasPhysics: true, // hitbox for player attacks; movement is manual
      hitboxSize: new THREE.Vector3(0.9, 1.9, 0.9),
    })
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
    this.driftTarget.copy(this.position)
  }

  get isDying(): boolean {
    return this._isDying
  }

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => void): void {
    this.playerDamageCallback = callback
  }

  setWorldQueryFns(
    _blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.solidQuery = solidQuery
  }

  onSpawn(): void {
    // Spawned on the ground: rise to haunting height
    this.position.y += 3 + Math.random() * 4
    this.driftTarget.copy(this.position)
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.body = body

    const shroud = new THREE.MeshLambertMaterial({ color: SHROUD, transparent: true, opacity: 0.82 })
    const shroudDark = new THREE.MeshLambertMaterial({ color: SHROUD_DARK, transparent: true, opacity: 0.7 })
    const bone = new THREE.MeshLambertMaterial({ color: BONE })
    const hoodShadow = new THREE.MeshBasicMaterial({ color: HOOD_SHADOW })
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: SOUL_GREEN, transparent: true })
    this.registerMaterialForLighting(shroud)
    this.registerMaterialForLighting(shroudDark)
    this.registerMaterialForLighting(bone)
    this.fadeMaterials.push(shroud, shroudDark, this.eyeMaterial)

    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * SCALE, h * SCALE, d * SCALE), mat)
      mesh.position.set(x * SCALE, y * SCALE, z * SCALE)
      parent.add(mesh)
      return mesh
    }

    // Robe: stacked tiers widening downward, from the shoulders (y 26) to the hem (y 8)
    box(10, 6, 7, shroud, 0, 25, 0, body)
    box(12, 6, 8, shroud, 0, 19, 0, body)
    box(13, 6, 9, shroud, 0, 13, -0.5, body)
    // Hood with a deep shadowed face opening
    box(9, 9, 9, shroud, 0, 32, -0.5, body)
    box(10, 3, 10, shroudDark, 0, 36, -0.5, body) // hood crest
    box(7, 6, 1, hoodShadow, 0, 31.5, 4.1, body)
    const eyeGeo = new THREE.BoxGeometry(1.4 * SCALE, 1.1 * SCALE, 0.5 * SCALE)
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.eyeMaterial)
      eye.position.set(side * 1.7 * SCALE, 32.3 * SCALE, 4.5 * SCALE)
      body.add(eye)
    }
    // Tattered hem: ragged strips that sway
    const tatterGeo = new THREE.BoxGeometry(2 * SCALE, 8 * SCALE, 1.5 * SCALE)
    tatterGeo.translate(0, -4 * SCALE, 0)
    const tatterSpots: Array<[number, number]> = [[-5, 3], [-2, 4], [1, 4], [4, 3], [5, -2], [2, -4], [-1, -4], [-4, -3], [-6, 0], [6, 1]]
    tatterSpots.forEach(([tx, tz], i) => {
      const tatter = new THREE.Mesh(tatterGeo, i % 2 === 0 ? shroud : shroudDark)
      tatter.position.set(tx * SCALE, 10 * SCALE, tz * SCALE)
      tatter.scale.y = 0.7 + ((i * 37) % 10) / 20
      body.add(tatter)
      this.tatters.push(tatter)
    })
    // Arms reaching forward: sleeve + skeletal hand with claws
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 6 * SCALE, 25 * SCALE, 1 * SCALE)
      box(3, 3, 9, shroud, 0, 0, 4, arm)
      box(2, 2, 3, bone, 0, -0.3, 10, arm)
      for (const f of [-0.8, 0, 0.8]) box(0.6, 0.6, 3, bone, f, -0.6, 12.6, arm)
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
    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)
    this.bobPhase += deltaTime * 2.2
    this.stateTimer += deltaTime

    if (this.stunTimer > 0) {
      this.stunTimer -= deltaTime
      this.position.addScaledVector(this.velocity3, deltaTime)
      this.velocity3.multiplyScalar(Math.max(0, 1 - deltaTime * 4))
    } else {
      this.think(deltaTime)
    }

    this.keepOutOfRock(deltaTime)
    this.syncTransform()
    this.animate(deltaTime)
  }

  private distanceToPlayer(): number {
    return this.playerPositionRef ? this.position.distanceTo(this.playerPositionRef) : Infinity
  }

  private enter(state: WraithState): void {
    this.ai = state
    this.stateTimer = 0
  }

  private think(deltaTime: number): void {
    const player = this.playerPositionRef
    const dist = this.distanceToPlayer()

    switch (this.ai) {
      case WraithState.DRIFT: {
        if (player && dist <= DETECTION_RANGE) {
          this.enter(WraithState.STALK)
          break
        }
        if (this.stateTimer > 4 || this.position.distanceTo(this.driftTarget) < 1) {
          this.stateTimer = 0
          this.driftTarget.set(
            this.position.x + (Math.random() - 0.5) * 16,
            this.position.y + (Math.random() - 0.5) * 3,
            this.position.z + (Math.random() - 0.5) * 16
          )
        }
        this.moveToward(this.driftTarget, DRIFT_SPEED, deltaTime)
        break
      }
      case WraithState.STALK: {
        if (!player || dist > LOSE_RANGE) {
          this.enter(WraithState.DRIFT)
          break
        }
        // Circle the player, hovering above head height
        this.orbitAngle += deltaTime * 0.6
        this.tmp.set(
          player.x + Math.cos(this.orbitAngle) * STALK_RADIUS,
          player.y + STALK_HEIGHT,
          player.z + Math.sin(this.orbitAngle) * STALK_RADIUS
        )
        this.moveToward(this.tmp, STALK_SPEED, deltaTime)
        this.face(player)
        if (this.attackCooldown <= 0 && dist < STALK_RADIUS + 3) this.enter(WraithState.WINDUP)
        break
      }
      case WraithState.WINDUP: {
        if (!player) {
          this.enter(WraithState.DRIFT)
          break
        }
        // Rear back slightly, away from the player
        this.tmp.copy(this.position).sub(player).setY(0)
        if (this.tmp.lengthSq() > 0.001) this.position.addScaledVector(this.tmp.normalize(), deltaTime * 1.2)
        this.position.y += deltaTime * 0.8
        this.face(player)
        if (this.stateTimer >= WINDUP_TIME) {
          // Both positions are feet: aim the wraith's hem at the player's feet
          this.lungeDir.copy(player).sub(this.position)
          if (this.lungeDir.lengthSq() < 0.01) this.lungeDir.set(0, 0, 1)
          this.lungeDir.normalize()
          this.hasHit = false
          this.enter(WraithState.LUNGE)
        }
        break
      }
      case WraithState.LUNGE: {
        this.position.addScaledVector(this.lungeDir, LUNGE_SPEED * deltaTime)
        if (!this.hasHit && player) {
          if (this.position.distanceTo(player) <= HIT_RADIUS) {
            this.hasHit = true
            this.strike(player)
          }
        }
        if (this.hasHit || this.stateTimer >= LUNGE_MAX_TIME) {
          this.attackCooldown = ATTACK_COOLDOWN
          this.enter(WraithState.RECOVER)
        }
        break
      }
      case WraithState.RECOVER: {
        if (player) {
          // Back away and up
          this.tmp.copy(this.position).sub(player)
          this.tmp.y = 0
          if (this.tmp.lengthSq() > 0.001) this.tmp.normalize()
          this.tmp.y = 0.35
          this.position.addScaledVector(this.tmp, STALK_SPEED * deltaTime)
        }
        if (this.stateTimer >= RECOVER_TIME) this.enter(player ? WraithState.STALK : WraithState.DRIFT)
        break
      }
    }
  }

  private moveToward(target: THREE.Vector3, speed: number, deltaTime: number): void {
    this.tmp.copy(target).sub(this.position)
    const len = this.tmp.length()
    if (len < 0.05) return
    this.tmp.multiplyScalar(Math.min(1, (speed * deltaTime) / len))
    this.position.add(this.tmp)
    if (this.ai === WraithState.DRIFT) this.face(target)
  }

  private face(target: THREE.Vector3): void {
    const mesh = this.getMesh()
    if (!mesh) return
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (dx * dx + dz * dz > 0.01) mesh.rotation.y = Math.atan2(dx, dz)
  }

  /** Wraiths drift through rock, but never settle inside it. */
  private keepOutOfRock(deltaTime: number): void {
    if (!this.solidQuery) return
    const x = Math.floor(this.position.x)
    const z = Math.floor(this.position.z)
    if (this.solidQuery(x, Math.floor(this.position.y + 0.5), z)) {
      this.position.y += deltaTime * 4
    } else if (this.ai === WraithState.DRIFT && this.solidQuery(x, Math.floor(this.position.y - 1), z)) {
      this.position.y += deltaTime * 1.5 // keep a little off the ground while drifting
    }
    if (this.position.y > 125) this.position.y = 125
  }

  private strike(player: THREE.Vector3): void {
    if (!this.playerDamageCallback) return
    this.tmp.copy(player).sub(this.position)
    this.tmp.y = 0
    if (this.tmp.lengthSq() > 0) this.tmp.normalize()
    this.tmp.multiplyScalar(KNOCKBACK_H)
    this.tmp.y = KNOCKBACK_V
    this.playerDamageCallback(ATTACK_DAMAGE, this.tmp.clone(), 'melee')
    playerEffects.apply(StatusEffectIds.SLOWNESS, CHILL_SECONDS, 1)
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const body = this.getPhysicsBody()
    if (body) body.position.copy(this.position)
  }

  private animate(deltaTime: number): void {
    if (this.body) {
      this.body.position.y = Math.sin(this.bobPhase) * 0.12
      // Lean into the lunge, rear back during the windup
      const lean = this.ai === WraithState.LUNGE ? 0.45 : this.ai === WraithState.WINDUP ? -0.25 : 0.05
      this.body.rotation.x += (lean - this.body.rotation.x) * Math.min(1, deltaTime * 8)
    }
    const armLift = this.ai === WraithState.WINDUP ? -1.0 : this.ai === WraithState.LUNGE ? -0.2 : 0.15 * Math.sin(this.bobPhase * 0.7)
    if (this.leftArm) this.leftArm.rotation.x += (armLift - this.leftArm.rotation.x) * Math.min(1, deltaTime * 10)
    if (this.rightArm) this.rightArm.rotation.x += (armLift - this.rightArm.rotation.x) * Math.min(1, deltaTime * 10)
    for (let i = 0; i < this.tatters.length; i++) {
      const t = this.tatters[i]
      t.rotation.x = Math.sin(this.bobPhase * 1.7 + i * 1.3) * 0.25
      t.rotation.z = Math.cos(this.bobPhase * 1.3 + i * 0.9) * 0.2
    }
    if (this.eyeMaterial) {
      const flare = this.ai === WraithState.WINDUP || this.ai === WraithState.LUNGE
      this.eyeMaterial.color.setHex(flare ? 0xe4fff0 : SOUL_GREEN)
    }
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    const t = Math.min(1, this.deathTimer / DEATH_DURATION)
    this.position.y += deltaTime * 1.2
    for (const m of this.fadeMaterials) {
      m.transparent = true
      m.opacity = (m === this.eyeMaterial ? 1 : 0.8) * (1 - t)
    }
    const mesh = this.getMesh()
    if (mesh) {
      mesh.rotation.y += deltaTime * 4
      mesh.scale.setScalar(1 - 0.4 * t)
    }
    this.syncTransform()
    if (t >= 1) this.kill()
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 1
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    this.health -= getPlayerAttackDamage(heldItem)
    // Weapon knockback x attack charge scales the push; any hit still
    // breaks a lunge (a wraith always recoils from a blow)
    const knockback = getPlayerAttackKnockback(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }
    // Knocked back and dazed; a hit interrupts a lunge
    this.velocity3.copy(this.position).sub(playerPosition)
    this.velocity3.y = 0
    if (this.velocity3.lengthSq() > 0) this.velocity3.normalize()
    this.velocity3.multiplyScalar(HIT_PUSH * knockback)
    this.velocity3.y = 1.5 * Math.min(1, knockback)
    this.stunTimer = HIT_STUN * Math.max(0.4, Math.min(1, knockback))
    this.attackCooldown = Math.max(this.attackCooldown, 1.2)
    this.enter(WraithState.RECOVER)
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = [new EctoplasmItem()]
    if (Math.random() < 0.5) drops.push(new EctoplasmItem())
    if (Math.random() < 0.12) drops.push(new SoulShardItem())
    return drops
  }

  dispose(): void {
    this.body = null
    this.leftArm = null
    this.rightArm = null
    this.tatters.length = 0
    this.eyeMaterial = null
    this.fadeMaterials.length = 0
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.solidQuery = null
    super.dispose()
  }
}
