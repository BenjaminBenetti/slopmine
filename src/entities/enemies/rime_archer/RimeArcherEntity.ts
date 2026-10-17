import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IEntity } from '../../interfaces/IEntity.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { ProjectileEntity } from '../../projectiles/ProjectileEntity.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { RimeCrystalItem } from '../../../items/materials/rime_crystal/RimeCrystalItem.ts'

const CLOAK = 0x1f2a3d
const CLOAK_LIGHT = 0x34445e
const BONE = 0x9aa8b6
const LEATHER = 0x3a3d45
const BOW = 0x8fc2e0
const STRING = 0xdde9f2
const EYE = 0xaef6ff
const SHARD = 0xe4f7ff

/** Telegraph: the bow drawn, a glowing ice shard nocked on the string. */
const DRAW_TIME = 0.9
/** Shot follow-through (bow lowered). */
const RELEASE_TIME = 0.35
const SHOT_SPEED = 18
const SHOT_DAMAGE = 7
const FROSTBITE_SECONDS = 2
/** Backs away when the player comes closer than this. */
const KEEP_AWAY = 5
const RETREAT_SPEED = 2.6

/**
 * Rime Archer - a gaunt hooded bowman of the Frozen Citadel (garrisons on
 * wall walks, galleries and tower tops; dungeon-only). Keeps its distance:
 * stops up to 14 blocks away, draws (0.9 s: the bow bends and an ice shard
 * glows on the string - the telegraph) and looses a fast ice shard (7 +
 * Frostbite 2 s) when it can see you; backs away from anyone closer than 5
 * blocks. Fragile up close.
 *
 * Stats: 26 HP, ice shard 7 + Frostbite, 24-block detection.
 * Drops: 1-2 bones, 0-1 rime crystal.
 */
export class RimeArcherEntity extends AggressiveEntity {
  readonly type = 'rime_archer'

  private drawTimer = -1
  private releaseTimer = -1
  private walkPhase = Math.random() * Math.PI * 2
  private playerPos: THREE.Vector3 | null = null
  private entitySpawnFn: ((entity: IEntity) => boolean) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null
  private readonly fired: IEntity[] = []

  private torso: THREE.Group | null = null
  private bowArm: THREE.Group | null = null
  private drawArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private nockedShard: THREE.Mesh | null = null
  private bowLimbs: THREE.Mesh[] = []

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('rime_archer', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.6, 1.9, 0.6),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 26,
      attackDamage: SHOT_DAMAGE,
      attackRange: 14, // stops and shoots from here
      attackCooldown: 2.4,
      detectionRange: 24,
      chaseSpeed: 3.0,
      walkSpeed: 1.6,
      knockbackHorizontal: 6,
      knockbackVertical: 3.5,
      knockbackStunTime: 0.5,
      drops: [
        { createItem: () => new BoneItem(), minCount: 1, maxCount: 2 },
        { createItem: () => new RimeCrystalItem(), minCount: 0, maxCount: 1 },
      ],
    })
  }

  /** Shards it fired that are still in the world (garrison cleanup). */
  get spawnedChildren(): readonly IEntity[] {
    for (let i = this.fired.length - 1; i >= 0; i--) if (!this.fired[i].isAlive) this.fired.splice(i, 1)
    return this.fired
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.playerPos = positionRef
  }

  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.entitySpawnFn = spawn
  }

  setWorldQueryFns(
    _blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.solidQuery = solidQuery
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const lit = (c: number): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color: c })
      this.registerMaterialForLighting(m)
      return m
    }
    const cloak = lit(CLOAK)
    const cloakLight = lit(CLOAK_LIGHT)
    const bone = lit(BONE)
    const leather = lit(LEATHER)
    const bow = lit(BOW)
    const string = lit(STRING)
    const eye = new THREE.MeshBasicMaterial({ color: EYE })
    const shard = new THREE.MeshBasicMaterial({ color: SHARD })

    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Thin bony legs under a long cloak
    const makeLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group()
      leg.position.set(side * 0.12, 0.86, 0)
      box(leg, 0.12, 0.86, 0.12, 0, -0.43, 0, bone)
      box(leg, 0.16, 0.1, 0.24, 0, -0.82, 0.04, leather)
      root.add(leg)
      return leg
    }
    this.leftLeg = makeLeg(-1)
    this.rightLeg = makeLeg(1)

    const torso = new THREE.Group()
    torso.position.set(0, 0.86, 0)
    root.add(torso)
    this.torso = torso
    box(torso, 0.44, 0.62, 0.26, 0, 0.32, 0, cloak) // body
    box(torso, 0.5, 0.55, 0.06, 0, 0.0, -0.14, cloakLight) // cloak tails
    box(torso, 0.4, 0.06, 0.28, 0, 0.12, 0, leather) // belt
    box(torso, 0.34, 0.36, 0.34, 0, 0.82, 0, cloak) // hood
    box(torso, 0.24, 0.24, 0.04, 0, 0.8, 0.16, leather) // shadowed face
    box(torso, 0.05, 0.04, 0.02, -0.06, 0.82, 0.19, eye)
    box(torso, 0.05, 0.04, 0.02, 0.06, 0.82, 0.19, eye)
    // quiver of ice shards on the back
    box(torso, 0.14, 0.5, 0.12, 0.12, 0.42, -0.2, leather)
    for (const dx of [0.08, 0.13, 0.17]) box(torso, 0.04, 0.16, 0.04, dx, 0.74, -0.2, bow)

    // Bow arm (left) held forward, the long ice bow upright in it
    const bowArm = new THREE.Group()
    bowArm.position.set(-0.26, 0.56, 0)
    bowArm.rotation.x = -Math.PI / 2 // arm straight forward
    box(bowArm, 0.1, 0.5, 0.1, 0, -0.25, 0, bone)
    const bowCenter = new THREE.Group()
    bowCenter.position.set(0, -0.52, 0)
    bowCenter.rotation.x = Math.PI / 2 // bow upright again
    bowArm.add(bowCenter)
    box(bowCenter, 0.06, 0.2, 0.08, 0, 0, 0, leather) // grip
    const upper = box(bowCenter, 0.05, 0.62, 0.06, 0, 0.4, -0.06, bow)
    const lower = box(bowCenter, 0.05, 0.62, 0.06, 0, -0.4, -0.06, bow)
    upper.rotation.x = 0.25
    lower.rotation.x = -0.25
    this.bowLimbs = [upper, lower]
    box(bowCenter, 0.015, 1.3, 0.015, 0, 0, -0.2, string) // string
    this.nockedShard = box(bowCenter, 0.05, 0.05, 0.5, 0, 0, 0.0, shard)
    this.nockedShard.visible = false
    torso.add(bowArm)
    this.bowArm = bowArm

    // Draw arm (right) pulls the string back to the cheek
    const drawArm = new THREE.Group()
    drawArm.position.set(0.24, 0.56, 0)
    box(drawArm, 0.1, 0.5, 0.1, 0, -0.25, 0, bone)
    torso.add(drawArm)
    this.drawArm = drawArm

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [this.torso, this.bowArm, this.drawArm, this.leftLeg, this.rightLeg, bowCenter, upper, lower, this.nockedShard],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  /** Draw (telegraph) instead of attacking at once - only with a clear shot. */
  protected override performAttack(): void {
    if (this.drawTimer >= 0 || this.releaseTimer >= 0) return
    const p = this.playerPos
    if (!p || !this.entitySpawnFn || !this.hasLineOfSight(p)) {
      this.attackCooldown = 0.4 // try again soon (it keeps its position)
      return
    }
    this.drawTimer = 0
  }

  override update(deltaTime: number): void {
    if (this._isDying) {
      this.drawTimer = -1
      this.releaseTimer = -1
      super.update(deltaTime)
      return
    }
    if (this.drawTimer >= 0) {
      this.drawTimer += deltaTime
      if (this.drawTimer >= DRAW_TIME) {
        this.drawTimer = -1
        this.releaseTimer = 0
        const p = this.playerPos
        if (p && this.hasLineOfSight(p)) this.loose(p)
      }
    } else if (this.releaseTimer >= 0) {
      this.releaseTimer += deltaTime
      if (this.releaseTimer >= RELEASE_TIME) this.releaseTimer = -1
    }
    super.update(deltaTime)
    this.keepAway()
  }

  /** Back away from a player who closes in (after the base AI set its velocity). */
  private keepAway(): void {
    const p = this.playerPos
    const body = this.getPhysicsBody()
    if (!p || !body || !this.isAggressive || this.knockbackTimer > 0 || this.drawTimer >= 0) return
    const dx = this.position.x - p.x, dz = this.position.z - p.z
    const d = Math.hypot(dx, dz)
    if (d >= KEEP_AWAY || d < 1e-3) return
    body.velocity.x = (dx / d) * RETREAT_SPEED
    body.velocity.z = (dz / d) * RETREAT_SPEED
    this.isWalking = true
  }

  private loose(player: THREE.Vector3): void {
    if (!this.entitySpawnFn) return
    const facing = this.getMesh()?.rotation.y ?? 0
    const from = new THREE.Vector3(
      this.position.x + Math.sin(facing) * 0.6,
      this.position.y + 1.42,
      this.position.z + Math.cos(facing) * 0.6
    )
    const target = new THREE.Vector3(player.x, player.y + 1.1, player.z)
    const velocity = target.sub(from)
    if (velocity.lengthSq() < 1e-4) return
    velocity.normalize().multiplyScalar(SHOT_SPEED)
    const shot = new ProjectileEntity({
      position: from,
      velocity,
      damage: SHOT_DAMAGE,
      owner: this,
      preset: 'ice_shard',
      lifetime: 3,
      knockback: 2.5,
      effect: { id: StatusEffectIds.SLOWNESS, seconds: FROSTBITE_SECONDS, level: 1 },
    })
    if (this.entitySpawnFn(shot)) this.fired.push(shot)
  }

  /** No solid block between the archer's eyes and the player's chest. */
  private hasLineOfSight(player: THREE.Vector3): boolean {
    const q = this.solidQuery
    if (!q) return true
    const sx = this.position.x, sy = this.position.y + 1.6, sz = this.position.z
    const tx = player.x, ty = player.y + 1.2, tz = player.z
    const dist = Math.hypot(tx - sx, ty - sy, tz - sz)
    const steps = Math.ceil(dist / 0.4)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (q(Math.floor(sx + (tx - sx) * t), Math.floor(sy + (ty - sy) * t), Math.floor(sz + (tz - sz) * t))) return false
    }
    return true
  }

  protected updateAnimations(deltaTime: number): void {
    // Bow arm always forward; the draw arm pulls back during the telegraph
    let pull = 0
    if (this.drawTimer >= 0) pull = Math.min(1, this.drawTimer / DRAW_TIME)
    else if (this.releaseTimer >= 0) pull = 0
    if (this.drawArm) {
      this.drawArm.rotation.x = -Math.PI / 2 * (0.6 + 0.4 * pull)
      this.drawArm.rotation.z = -0.5 * pull
    }
    if (this.bowLimbs.length === 2) {
      this.bowLimbs[0].rotation.x = 0.25 + 0.3 * pull
      this.bowLimbs[1].rotation.x = -0.25 - 0.3 * pull
    }
    if (this.nockedShard) this.nockedShard.visible = this.drawTimer >= 0
    if (this.torso) this.torso.rotation.y = this.drawTimer >= 0 ? 0.35 * pull : 0 // turns side-on to draw

    if (this.isWalking) this.walkPhase += deltaTime * 7
    const swing = this.isWalking ? Math.sin(this.walkPhase) * 0.45 : 0
    if (this.leftLeg) this.leftLeg.rotation.x = swing
    if (this.rightLeg) this.rightLeg.rotation.x = -swing
  }

  dispose(): void {
    this.torso = null
    this.bowArm = null
    this.drawArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.nockedShard = null
    this.bowLimbs = []
    this.playerPos = null
    this.entitySpawnFn = null
    this.solidQuery = null
    super.dispose()
  }
}
