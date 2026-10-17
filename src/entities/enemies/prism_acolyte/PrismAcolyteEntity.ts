import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntity } from '../../interfaces/IEntity.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { ProjectileEntity } from '../../projectiles/ProjectileEntity.ts'
import { PrismShardItem } from '../../../items/materials/prism_shard/PrismShardItem.ts'
import { createItemFromId } from '../../../persistence/ItemRegistry.ts'
import { CRYSTAL_ROSE, CRYSTAL_VIOLET, EYE_GLOW } from '../crystal_shared/crystalPalette.ts'

type AcolyteState = 'drift' | 'cast' | 'blink'

const MAX_HEALTH = 26
const DETECTION_RANGE = 24
const LOSE_RANGE = 34
const KEEP_MIN = 6
const KEEP_MAX = 12
const BLINK_TRIGGER = 4.5
const BLINK_TIME = 0.35
const BLINK_COOLDOWN = 4
const CAST_WINDUP = 0.75
const CAST_RECOVERY = 0.45
const CAST_COOLDOWN = 3.2
const CAST_RANGE = 20
const BOLT_SPEED = 8
const BOLT_DAMAGE = 5
/** Seconds after firing before a bolt refracts into three. */
const SPLIT_AFTER = 0.5
const SPLIT_ANGLE = 0.32
const HOVER = 0.35
const MOVE_SPEED = 2.6
const KNOCKBACK_SPEED = 6
const KNOCKBACK_STUN = 0.45
const DEATH_TIME = 1.0

/**
 * Prism Acolyte - a robed, hooded crystal caster of the Prism Sanctum
 * (dungeon garrison only). It floats just above the floor with a crystal
 * staff and a halo of three orbiting shards, and keeps its distance:
 *
 * - Refracting bolt: raises the staff while the halo shards converge and
 *   flare (0.75 s telegraph), then fires a slow crystal bolt that splits
 *   into three after half a second (5 damage each).
 * - Blink: when the player closes in, it shimmers (0.35 s) and teleports a
 *   few blocks away to open ground.
 *
 * 26 HP. Drops 1-2 prism shards, sometimes a strength potion.
 */
export class PrismAcolyteEntity extends Entity {
  readonly type = 'prism_acolyte'

  private health = MAX_HEALTH
  private acolyteState: AcolyteState = 'drift'
  private stateTime = 0
  private castCooldown = 1 + Math.random()
  private blinkCooldown = 0
  private knockbackTimer = 0
  private readonly knockbackVelocity = new THREE.Vector3()
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false
  private time = Math.random() * 10
  private orbitAngle = Math.random() * Math.PI * 2
  private facing = 0
  private readonly pendingSplits: Array<{ bolt: ProjectileEntity; age: number }> = []
  readonly spawnedChildren: IEntity[] = []

  private playerRef: THREE.Vector3 | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null
  private spawnFn: ((entity: IEntity) => boolean) | null = null

  // Model
  private bodyGroup: THREE.Group | null = null
  private staffArm: THREE.Group | null = null
  private halo: THREE.Group | null = null
  private haloShards: THREE.Mesh[] = []
  private crystalMaterial: THREE.MeshLambertMaterial | null = null
  private readonly tmp = new THREE.Vector3()

  constructor(config: { position: THREE.Vector3 }) {
    super('prism_acolyte', { ...config, hasPhysics: true, hitboxSize: new THREE.Vector3(0.7, 1.9, 0.7) })
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true // floats; movement is steered manually
  }

  get isDying(): boolean {
    return this._isDying
  }

  // ---- wiring (EntityManager duck typing) ------------------------------------

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerRef = positionRef
  }

  setWorldQueryFns(
    _blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.solidQuery = solidQuery
  }

  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.spawnFn = spawn
  }

  // ---- model -----------------------------------------------------------------

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.bodyGroup = body

    const robe = new THREE.MeshLambertMaterial({ color: 0x2c1a4a })
    const robeTrim = new THREE.MeshLambertMaterial({ color: 0xc9a043 })
    const hoodInside = new THREE.MeshBasicMaterial({ color: 0x07050c })
    const gold = new THREE.MeshLambertMaterial({ color: 0xb08a36 })
    this.crystalMaterial = new THREE.MeshLambertMaterial({
      color: CRYSTAL_VIOLET, emissive: new THREE.Color(CRYSTAL_VIOLET), emissiveIntensity: 0.7,
    })
    const rose = new THREE.MeshLambertMaterial({ color: CRYSTAL_ROSE, emissive: new THREE.Color(CRYSTAL_ROSE), emissiveIntensity: 0.6 })
    const eyes = new THREE.MeshBasicMaterial({ color: EYE_GLOW })
    for (const m of [robe, robeTrim, gold, this.crystalMaterial, rose]) this.registerMaterialForLighting(m)

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Robe: a flared bell of stacked tiers (no legs - it floats), gold hem
    box(0.86, 0.18, 0.8, robeTrim, 0, 0.09, 0, body)
    box(0.8, 0.4, 0.74, robe, 0, 0.38, 0, body)
    box(0.66, 0.45, 0.6, robe, 0, 0.8, 0, body)
    box(0.56, 0.45, 0.5, robe, 0, 1.24, 0, body)
    box(0.12, 0.9, 0.02, robeTrim, 0, 0.75, 0.37, body) // front panel trim
    box(0.7, 0.14, 0.56, robe, 0, 1.5, 0, body) // shoulders
    // Hood: deep, dark opening with two pale eyes, pointed crown
    box(0.5, 0.5, 0.5, robe, 0, 1.78, 0, body)
    box(0.34, 0.32, 0.04, hoodInside, 0, 1.74, 0.24, body)
    box(0.07, 0.04, 0.02, eyes, -0.08, 1.77, 0.265, body)
    box(0.07, 0.04, 0.02, eyes, 0.08, 1.77, 0.265, body)
    const tip = box(0.24, 0.26, 0.24, robe, 0, 2.08, -0.06, body)
    tip.rotation.x = -0.35
    // Crystal circlet on the brow
    box(0.12, 0.1, 0.04, rose, 0, 1.97, 0.25, body)

    // Staff arm (right): gold staff topped with a crystal
    const staffArm = new THREE.Group()
    staffArm.position.set(0.38, 1.4, 0.08)
    box(0.16, 0.5, 0.18, robe, 0, -0.2, 0, staffArm)
    box(0.06, 1.9, 0.06, gold, 0.06, -0.3, 0.18, staffArm)
    const crystalTop = box(0.16, 0.34, 0.16, this.crystalMaterial, 0.06, 0.8, 0.18, staffArm)
    crystalTop.rotation.y = Math.PI / 4
    body.add(staffArm)
    this.staffArm = staffArm
    // Off arm
    box(0.16, 0.5, 0.18, robe, -0.38, 1.2, 0.04, body)

    // Halo: three shards orbiting the head
    const halo = new THREE.Group()
    halo.position.set(0, 1.85, 0)
    this.haloShards = []
    for (let i = 0; i < 3; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), i === 1 ? rose : this.crystalMaterial)
      shard.scale.set(0.7, 1.6, 0.7)
      halo.add(shard)
      this.haloShards.push(shard)
    }
    body.add(halo)
    this.halo = halo

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [root, body, staffArm, halo, ...this.haloShards],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  // ---- behaviour -------------------------------------------------------------

  update(deltaTime: number): void {
    this.time += deltaTime
    this.updateSplits(deltaTime)

    if (this._isDying) {
      this.deathTimer += deltaTime
      const t = Math.min(1, this.deathTimer / DEATH_TIME)
      const mesh = this.getMesh()
      if (mesh) {
        mesh.scale.setScalar(Math.max(0.01, 1 - t))
        mesh.rotation.y += deltaTime * 10
        mesh.position.copy(this.position)
        mesh.position.y += t * 0.8
      }
      if (this.crystalMaterial) this.crystalMaterial.emissiveIntensity = 0.7 + t * 3
      if (this.deathTimer >= DEATH_TIME) this.kill()
      return
    }

    this.castCooldown = Math.max(0, this.castCooldown - deltaTime)
    this.blinkCooldown = Math.max(0, this.blinkCooldown - deltaTime)
    this.stateTime += deltaTime

    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      this.knockbackVelocity.multiplyScalar(Math.pow(0.05, deltaTime))
      this.tryMove(this.knockbackVelocity.x * deltaTime, this.knockbackVelocity.z * deltaTime)
      this.settleHeight(deltaTime)
      this.syncMesh()
      this.animate(deltaTime)
      return
    }

    const player = this.playerRef
    const dist = player ? Math.hypot(player.x - this.position.x, player.z - this.position.z) : Infinity
    if (player && dist <= LOSE_RANGE) this.turnToward(player, deltaTime, 4)

    switch (this.acolyteState) {
      case 'drift': {
        if (!player || dist > DETECTION_RANGE) break
        if (dist < BLINK_TRIGGER && this.blinkCooldown <= 0) {
          this.setState('blink')
          break
        }
        if (this.castCooldown <= 0 && dist <= CAST_RANGE && this.canSee(player)) {
          this.setState('cast')
          break
        }
        // Keep the preferred distance, strafing slowly around the player
        const dx = this.position.x - player.x
        const dz = this.position.z - player.z
        const d = Math.max(0.01, dist)
        let radial = 0
        if (dist < KEEP_MIN) radial = 1
        else if (dist > KEEP_MAX) radial = -1
        const sx = -dz / d
        const sz = dx / d
        const strafe = Math.sin(this.time * 0.6) * 0.6
        this.tryMove(((dx / d) * radial + sx * strafe) * MOVE_SPEED * deltaTime, ((dz / d) * radial + sz * strafe) * MOVE_SPEED * deltaTime)
        break
      }
      case 'cast':
        if (this.stateTime >= CAST_WINDUP + CAST_RECOVERY) {
          this.castCooldown = CAST_COOLDOWN
          this.setState('drift')
        } else if (this.stateTime >= CAST_WINDUP && this.stateTime - deltaTime < CAST_WINDUP && player) {
          this.fireBolt(player)
        }
        break
      case 'blink':
        if (this.stateTime >= BLINK_TIME) {
          this.blink()
          this.blinkCooldown = BLINK_COOLDOWN
          this.castCooldown = Math.min(this.castCooldown, 0.6)
          this.setState('drift')
        }
        break
    }

    this.settleHeight(deltaTime)
    this.syncMesh()
    this.animate(deltaTime)
  }

  private setState(state: AcolyteState): void {
    this.acolyteState = state
    this.stateTime = 0
  }

  /** A slow crystal bolt at the player's chest; it refracts into three after SPLIT_AFTER. */
  private fireBolt(player: THREE.Vector3): void {
    if (!this.spawnFn) return
    const from = this.staffTip(new THREE.Vector3())
    const velocity = new THREE.Vector3(player.x, player.y + 1.1, player.z).sub(from)
    if (velocity.lengthSq() < 1e-4) return
    velocity.normalize().multiplyScalar(BOLT_SPEED)
    const bolt = new ProjectileEntity({
      position: from, velocity, damage: BOLT_DAMAGE, owner: this, preset: 'crystal_shard', scale: 1.1, lifetime: 3,
    })
    if (this.spawnFn(bolt)) {
      this.spawnedChildren.push(bolt)
      this.pendingSplits.push({ bolt, age: 0 })
    }
  }

  private updateSplits(deltaTime: number): void {
    for (let i = this.pendingSplits.length - 1; i >= 0; i--) {
      const entry = this.pendingSplits[i]
      entry.age += deltaTime
      if (!entry.bolt.isAlive) {
        this.pendingSplits.splice(i, 1)
        continue
      }
      if (entry.age < SPLIT_AFTER) continue
      this.pendingSplits.splice(i, 1)
      const v = entry.bolt.velocity
      if (!v || !this.spawnFn) continue
      const from = entry.bolt.position.clone()
      entry.bolt.destroy()
      for (const angle of [-SPLIT_ANGLE, 0, SPLIT_ANGLE]) {
        const dir = v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        const shard = new ProjectileEntity({
          position: from.clone(), velocity: dir, damage: BOLT_DAMAGE, owner: this, preset: 'crystal_shard', scale: 0.85, lifetime: 2.5,
        })
        if (this.spawnFn(shard)) this.spawnedChildren.push(shard)
      }
    }
    // Forget finished children
    for (let i = this.spawnedChildren.length - 1; i >= 0; i--) {
      if (!this.spawnedChildren[i].isAlive) this.spawnedChildren.splice(i, 1)
    }
  }

  /** Teleport 6-9 blocks away from the player onto open, supported ground (stays put if none). */
  private blink(): void {
    const player = this.playerRef
    if (!player) return
    const away = Math.atan2(this.position.z - player.z, this.position.x - player.x)
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = away + (Math.random() - 0.5) * 2.2
      const r = 6 + Math.random() * 3
      const x = player.x + Math.cos(angle) * r
      const z = player.z + Math.sin(angle) * r
      const ground = this.findGround(x, this.position.y + 2, z)
      if (ground === null || Math.abs(ground + 1 - this.position.y) > 4) continue
      this.position.set(x, ground + 1 + HOVER, z)
      this.syncMesh()
      return
    }
  }

  private findGround(x: number, fromY: number, z: number): number | null {
    if (!this.solidQuery) return null
    const fx = Math.floor(x)
    const fz = Math.floor(z)
    for (let y = Math.floor(fromY); y > fromY - 8; y--) {
      if (this.solidQuery(fx, y, fz) && !this.solidQuery(fx, y + 1, fz) && !this.solidQuery(fx, y + 2, fz)) return y
    }
    return null
  }

  /** Horizontal move unless it would enter a solid block (body or head height). */
  private tryMove(dx: number, dz: number): void {
    const nx = this.position.x + dx
    const nz = this.position.z + dz
    if (this.solidQuery) {
      const y = this.position.y
      if (this.solidQuery(Math.floor(nx), Math.floor(y + 0.2), Math.floor(nz)) ||
          this.solidQuery(Math.floor(nx), Math.floor(y + 1.5), Math.floor(nz))) return
    }
    this.position.x = nx
    this.position.z = nz
  }

  /** Float HOVER above the ground below (eases up/down steps, sinks if nothing below). */
  private settleHeight(deltaTime: number): void {
    const ground = this.findGround(this.position.x, this.position.y + 1, this.position.z)
    const target = ground === null ? this.position.y - 4 * deltaTime : ground + 1 + HOVER + Math.sin(this.time * 2) * 0.08
    this.position.y += THREE.MathUtils.clamp(target - this.position.y, -6 * deltaTime, 4 * deltaTime)
  }

  private canSee(player: THREE.Vector3): boolean {
    if (!this.solidQuery) return true
    const from = this.staffTip(this.tmp)
    const tx = player.x, ty = player.y + 1.6, tz = player.z
    const dist = Math.hypot(tx - from.x, ty - from.y, tz - from.z)
    const steps = Math.ceil(dist / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidQuery(Math.floor(from.x + (tx - from.x) * t), Math.floor(from.y + (ty - from.y) * t), Math.floor(from.z + (tz - from.z) * t))) return false
    }
    return true
  }

  private staffTip(out: THREE.Vector3): THREE.Vector3 {
    const sin = Math.sin(this.facing)
    const cos = Math.cos(this.facing)
    const lx = 0.44
    const lz = 0.3
    return out.set(this.position.x + lx * cos + lz * sin, this.position.y + 2.2, this.position.z - lx * sin + lz * cos)
  }

  private turnToward(target: THREE.Vector3, deltaTime: number, rate: number): void {
    const desired = Math.atan2(target.x - this.position.x, target.z - this.position.z)
    const delta = Math.atan2(Math.sin(desired - this.facing), Math.cos(desired - this.facing))
    this.facing += THREE.MathUtils.clamp(delta, -rate * deltaTime, rate * deltaTime)
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
      mesh.rotation.y = this.facing
    }
    const body = this.getPhysicsBody()
    if (body) body.position.copy(this.position)
  }

  private animate(deltaTime: number): void {
    const casting = this.acolyteState === 'cast' && this.stateTime < CAST_WINDUP
    const k = casting ? this.stateTime / CAST_WINDUP : 0
    // Halo: orbit (faster and tighter while casting), converging on the staff tip
    this.orbitAngle += deltaTime * (casting ? 7 : 1.6)
    const radius = 0.55 - 0.3 * k
    this.haloShards.forEach((shard, i) => {
      const a = this.orbitAngle + (i * Math.PI * 2) / 3
      shard.position.set(Math.cos(a) * radius, Math.sin(this.time * 2 + i) * 0.06 + k * 0.4, Math.sin(a) * radius)
      shard.rotation.y += deltaTime * 3
    })
    if (this.staffArm) this.staffArm.rotation.x = casting ? -1.6 * Math.min(1, k * 1.5) : this.acolyteState === 'cast' ? -0.6 : 0
    if (this.crystalMaterial) {
      const blink = this.acolyteState === 'blink' ? 2 + Math.sin(this.time * 60) * 1.5 : 0
      this.crystalMaterial.emissiveIntensity = 0.6 + 0.15 * Math.sin(this.time * 3) + k * 2.5 + blink
    }
    if (this.bodyGroup) {
      // Shimmer before a blink: the body flickers in place
      this.bodyGroup.visible = this.acolyteState !== 'blink' || Math.sin(this.time * 70) > -0.3
      this.bodyGroup.rotation.z = Math.sin(this.time * 1.3) * 0.04
    }
    if (this.halo) this.halo.position.y = 1.85 + k * 0.3
  }

  // ---- damage ----------------------------------------------------------------

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 0.5
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = []
    const shards = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < shards; i++) drops.push(new PrismShardItem())
    if (Math.random() < 0.12) {
      const potion = createItemFromId('strength_potion')
      if (potion) drops.push(potion)
    }
    return drops
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    this.health -= getPlayerAttackDamage(heldItem)
    const impact = getPlayerAttackKnockback(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }
    const dx = this.position.x - playerPosition.x
    const dz = this.position.z - playerPosition.z
    const d = Math.hypot(dx, dz) || 1
    this.knockbackVelocity.set((dx / d) * KNOCKBACK_SPEED * impact, 0, (dz / d) * KNOCKBACK_SPEED * impact)
    this.knockbackTimer = KNOCKBACK_STUN * Math.min(1, impact)
    // A hit interrupts a cast; the next blink comes sooner
    if (this.acolyteState === 'cast' && this.stateTime < CAST_WINDUP) {
      this.castCooldown = 1.2
      this.setState('drift')
    }
    this.blinkCooldown = Math.min(this.blinkCooldown, 1)
    return true
  }

  dispose(): void {
    this.bodyGroup = null
    this.staffArm = null
    this.halo = null
    this.haloShards = []
    this.crystalMaterial = null
    this.playerRef = null
    this.solidQuery = null
    this.spawnFn = null
    this.pendingSplits.length = 0
    super.dispose()
  }
}
