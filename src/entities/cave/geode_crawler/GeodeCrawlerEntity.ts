import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { CelestiteShardItem } from '../../../items/materials/celestite_shard/CelestiteShardItem.ts'

// Palette: dark geode rind, a pale calcite lining, sky-blue celestite
const ROCK = 0x4a4a52
const ROCK_DARK = 0x33343a
const CALCITE = 0xd8d4cc
const CELESTITE = 0x8ec8f0
const CELESTITE_LIGHT = 0xb8e0fa
const EYE_GLOW = 0xc8ecff

const MAX_HEALTH = 40
/** It notices a player this close (blocks) and turns hostile. */
const NOTICE_RANGE = 4
/** Hostility ends after this long with the player out of DETECTION_RANGE. */
const DETECTION_RANGE = 12
const STALK_SPEED = 1.6
/** Charges start from at most this far away (blocks). */
const CHARGE_RANGE = 7
const CHARGE_WINDUP = 0.5
const CHARGE_DURATION = 0.75
const CHARGE_SPEED = 7.5
const CHARGE_RECOVERY = 0.8
const CHARGE_COOLDOWN = 1.4
/** A charge that slams into a wall stuns it this long instead. */
const WALL_STUN = 1.4
const RAM_DAMAGE = 6
const RAM_REACH = 1.35
const RAM_KNOCKBACK_H = 9
const RAM_KNOCKBACK_V = 4.5
/** Share of damage a hit on the crystal back still deals. */
const BACK_DAMAGE_SHARE = 0.4
/** Behind it if the direction to the player is this far past perpendicular (cosine). */
const BACK_COVER_COS = -0.2
const DEATH_DURATION = 1.1

type CrawlerAction = 'stalk' | 'windup' | 'charge' | 'recovery' | 'stunned'

/**
 * Geode Crawler - a squat armoured beetle of the crystal geodes whose back
 * is a geode: a dark stone shell cracked open over a calcite rind and a bed
 * of softly glowing celestite crystals.
 *
 * Neutral until the player comes within 4 blocks or hits it; then it stalks
 * and charges in short telegraphed bursts (it rears up, the crystals flare),
 * ramming for 6 with heavy knockback. A charge into a wall stuns it. Hits on
 * the crystal back - from behind or from above - glance off (40 % damage,
 * shield sound); the face and belly are soft. 40 HP, slow.
 *
 * Drops 1-3 celestite shards.
 */
export class GeodeCrawlerEntity extends AggressiveEntity {
  readonly type = 'geode_crawler'
  /** The player's latest hit landed on the crystal back (IEntity; shield sound). */
  lastHitBlocked = false

  private action: CrawlerAction = 'stalk'
  private actionTime = 0
  private chargeCooldown = 0.8
  private rammed = false
  private facing = Math.random() * Math.PI * 2
  private walkPhase = Math.random() * Math.PI * 2
  private glowTime = Math.random() * 10
  private flash = 0
  private blockedTime = 0
  private readonly chargeDir = new THREE.Vector3()
  private readonly lastPos = new THREE.Vector3()
  private readonly knock = new THREE.Vector3()

  private playerRef: THREE.Vector3 | null = null
  private damageFn: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => void) | null = null

  // Model parts
  private bodyGroup: THREE.Group | null = null
  private head: THREE.Group | null = null
  private readonly legs: THREE.Group[] = []
  private leftMandible: THREE.Group | null = null
  private rightMandible: THREE.Group | null = null
  private crystalMaterials: THREE.MeshLambertMaterial[] = []

  constructor(config: { position: THREE.Vector3 }) {
    super('geode_crawler', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.0, 0.8, 1.0),
      aggressionMode: AggressionMode.AGGRESSIVE_WHEN_PROVOKED,
      maxHealth: MAX_HEALTH,
      attackDamage: RAM_DAMAGE,
      attackRange: RAM_REACH,
      attackCooldown: CHARGE_COOLDOWN,
      detectionRange: DETECTION_RANGE,
      chaseSpeed: STALK_SPEED,
      walkSpeed: 0.9,
      wanderMinDistance: 2,
      knockbackHorizontal: 2.0,
      knockbackVertical: 2.0,
      knockbackStunTime: 0.2,
      attackKnockbackHorizontal: RAM_KNOCKBACK_H,
      attackKnockbackVertical: RAM_KNOCKBACK_V,
      aggroTimeout: 6,
      drops: [{ createItem: () => new CelestiteShardItem(), minCount: 1, maxCount: 3 }],
    })
  }

  // ---- wiring (EntityManager duck typing) ------------------------------------

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.playerRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => void): void {
    super.setPlayerDamageCallback(callback)
    this.damageFn = callback
  }

  // ---- model -----------------------------------------------------------------

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.bodyGroup = body

    const rock = new THREE.MeshLambertMaterial({ color: ROCK })
    const rockDark = new THREE.MeshLambertMaterial({ color: ROCK_DARK })
    const calcite = new THREE.MeshLambertMaterial({ color: CALCITE })
    const crystal = new THREE.MeshLambertMaterial({ color: CELESTITE, emissive: new THREE.Color(CELESTITE), emissiveIntensity: 0.6 })
    const crystalLight = new THREE.MeshLambertMaterial({ color: CELESTITE_LIGHT, emissive: new THREE.Color(CELESTITE_LIGHT), emissiveIntensity: 0.5 })
    const eye = new THREE.MeshBasicMaterial({ color: EYE_GLOW })
    this.crystalMaterials = [crystal, crystalLight]
    for (const m of [rock, rockDark, calcite, crystal, crystalLight]) this.registerMaterialForLighting(m)

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Belly and the geode shell: a low dome of stone plates, cracked open on
    // top over a calcite rind lined with celestite
    box(0.78, 0.18, 0.92, rockDark, 0, 0.26, 0, body) // belly
    box(0.9, 0.22, 0.98, rock, 0, 0.44, -0.02, body) // shell base
    box(0.12, 0.3, 0.86, rock, -0.42, 0.62, -0.02, body) // shell walls
    box(0.12, 0.3, 0.86, rock, 0.42, 0.62, -0.02, body)
    box(0.76, 0.3, 0.12, rock, 0, 0.62, 0.38, body)
    box(0.76, 0.3, 0.12, rock, 0, 0.62, -0.42, body)
    box(0.14, 0.1, 0.5, rockDark, -0.36, 0.8, 0.0, body) // broken rim plates
    box(0.14, 0.12, 0.42, rockDark, 0.36, 0.78, -0.08, body)
    box(0.68, 0.06, 0.74, calcite, 0, 0.56, -0.02, body) // calcite rind
    box(0.08, 0.2, 0.7, calcite, -0.32, 0.66, -0.02, body)
    box(0.08, 0.2, 0.7, calcite, 0.32, 0.66, -0.02, body)

    // Celestite crystals in the open geode: tall points tilted outward
    const crystals: Array<[number, number, number, number, number, number, boolean]> = [
      // x, z, height, width, tiltX, tiltZ, light
      [0, -0.05, 0.42, 0.13, -0.15, 0.05, false],
      [-0.17, 0.12, 0.3, 0.11, 0.3, 0.35, true],
      [0.18, 0.1, 0.34, 0.11, 0.25, -0.4, false],
      [-0.15, -0.22, 0.26, 0.1, -0.45, 0.3, true],
      [0.16, -0.24, 0.3, 0.1, -0.4, -0.3, true],
      [0.02, 0.22, 0.22, 0.09, 0.55, 0, false],
      [-0.06, -0.3, 0.2, 0.08, -0.6, 0.1, false],
    ]
    for (const [x, z, h, w, tx, tz, light] of crystals) {
      const point = new THREE.Group()
      point.position.set(x, 0.58, z)
      point.rotation.set(tx, 0, tz)
      box(w, h, w, light ? crystalLight : crystal, 0, h / 2, 0, point)
      box(w * 0.55, w * 0.9, w * 0.55, crystalLight, 0, h + w * 0.3, 0, point) // pale tip
      body.add(point)
    }

    // Head with glowing eyes and pincer mandibles (faces +Z)
    const head = new THREE.Group()
    head.position.set(0, 0.36, 0.48)
    box(0.5, 0.26, 0.26, rockDark, 0, 0, 0.08, head)
    box(0.42, 0.08, 0.2, rock, 0, 0.15, 0.06, head) // brow plate
    box(0.07, 0.06, 0.03, eye, -0.13, 0.04, 0.22, head)
    box(0.07, 0.06, 0.03, eye, 0.13, 0.04, 0.22, head)
    const mandible = (side: number): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(side * 0.15, -0.06, 0.2)
      box(0.07, 0.07, 0.22, rockDark, 0, 0, 0.1, g)
      box(0.08, 0.07, 0.08, calcite, -side * 0.04, 0, 0.21, g)
      head.add(g)
      return g
    }
    this.leftMandible = mandible(-1)
    this.rightMandible = mandible(1)
    // Antennae
    for (const side of [-1, 1]) {
      const a = box(0.03, 0.03, 0.3, rockDark, side * 0.12, 0.14, 0.3, head)
      a.rotation.set(-0.5, side * 0.35, 0)
    }
    body.add(head)
    this.head = head

    // Six legs, three per side, pivoting at the shell
    for (const z of [0.28, 0, -0.28]) {
      for (const side of [-1, 1]) {
        const leg = new THREE.Group()
        leg.position.set(side * 0.38, 0.3, z)
        const upper = box(0.32, 0.07, 0.07, rockDark, side * 0.15, 0.04, 0, leg)
        upper.rotation.z = side * 0.35
        box(0.07, 0.24, 0.07, rock, side * 0.31, -0.12, 0, leg)
        body.add(leg)
        this.legs.push(leg)
      }
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [root, body, head, this.leftMandible, this.rightMandible, ...this.legs],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  // ---- behaviour -------------------------------------------------------------

  override update(deltaTime: number): void {
    this.glowTime += deltaTime
    this.flash = Math.max(0, this.flash - deltaTime * 3)
    this.chargeCooldown = Math.max(0, this.chargeCooldown - deltaTime)

    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    const player = this.playerRef
    const distance = player ? this.horizontalDistance(player) : Infinity

    // Neutral: it turns on a player who comes too close
    if (!this.isAggressive && player && distance <= NOTICE_RANGE && Math.abs(player.y - this.position.y) < 3) {
      this.provoke()
    }

    if (!this.isAggressive) {
      super.update(deltaTime)
      const mesh = this.getMesh()
      if (mesh) this.facing = mesh.rotation.y
      this.updateAnimations(deltaTime)
      return
    }

    // Hit-stun from the player's blows: no AI, slide with the knockback
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      this.syncFromBody()
      this.updateAnimations(deltaTime)
      this.syncMesh()
      return
    }

    // Loses interest once the player has been far away for a while
    if (distance > DETECTION_RANGE) {
      this.aggressiveTimer -= deltaTime
      if (this.aggressiveTimer <= 0 && (this.action === 'stalk' || this.action === 'recovery')) {
        this.isAggressive = false
        this.action = 'stalk'
        this.syncMesh()
        return
      }
    } else {
      this.aggressiveTimer = this.aggroTimeout
    }

    this.actionTime += deltaTime
    switch (this.action) {
      case 'stalk':
        this.stalk(deltaTime, distance)
        break
      case 'windup':
        this.holdStill()
        if (player) this.turnToward(player, deltaTime, 5)
        if (this.actionTime >= CHARGE_WINDUP) this.startCharge()
        break
      case 'charge':
        this.charge(deltaTime)
        break
      case 'recovery':
        this.holdStill()
        if (this.actionTime >= CHARGE_RECOVERY) this.setAction('stalk')
        break
      case 'stunned':
        this.holdStill()
        if (this.actionTime >= WALL_STUN) this.setAction('stalk')
        break
    }

    this.syncFromBody()
    this.updateAnimations(deltaTime)
    this.syncMesh()
  }

  /** Creep toward the player; charge once close enough and rested. */
  private stalk(deltaTime: number, distance: number): void {
    const player = this.playerRef
    const body = this.getPhysicsBody()
    if (!player || !body) return
    this.turnToward(player, deltaTime, 3)
    if (distance <= CHARGE_RANGE && this.chargeCooldown <= 0 && body.isOnGround) {
      this.setAction('windup')
      this.holdStill()
      return
    }
    if (distance > RAM_REACH) {
      body.velocity.x = Math.sin(this.facing) * STALK_SPEED
      body.velocity.z = Math.cos(this.facing) * STALK_SPEED
      this.isWalking = true
      // Hop up 1-block steps it bumps into
      const moved = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z)
      this.blockedTime = moved < STALK_SPEED * deltaTime * 0.2 ? this.blockedTime + deltaTime : 0
      if (this.blockedTime > 0.35 && body.isOnGround) {
        body.velocity.y = this.jumpVelocity
        this.blockedTime = 0
      }
    } else {
      this.holdStill()
    }
    this.lastPos.copy(this.position)
  }

  private startCharge(): void {
    this.setAction('charge')
    this.rammed = false
    this.blockedTime = 0
    this.chargeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing))
    this.lastPos.copy(this.position)
    this.flash = 1
  }

  /** Dash straight ahead; ram the player once in reach; a wall stops it cold. */
  private charge(deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (!body) return
    body.velocity.x = this.chargeDir.x * CHARGE_SPEED
    body.velocity.z = this.chargeDir.z * CHARGE_SPEED
    this.isWalking = true

    const player = this.playerRef
    if (!this.rammed && player && this.horizontalDistance(player) <= RAM_REACH && Math.abs(player.y - this.position.y) < 1.6) {
      this.rammed = true
      this.knock.set(player.x - this.position.x, 0, player.z - this.position.z)
      if (this.knock.lengthSq() < 1e-6) this.knock.copy(this.chargeDir)
      this.knock.normalize().multiplyScalar(RAM_KNOCKBACK_H)
      this.knock.y = RAM_KNOCKBACK_V
      this.damageFn?.(RAM_DAMAGE, this.knock, 'melee')
      this.endCharge()
      return
    }

    // Wall: the dash made almost no progress for a moment
    const moved = (this.position.x - this.lastPos.x) * this.chargeDir.x + (this.position.z - this.lastPos.z) * this.chargeDir.z
    this.blockedTime = moved < CHARGE_SPEED * deltaTime * 0.25 && this.actionTime > 0.12 ? this.blockedTime + deltaTime : 0
    this.lastPos.copy(this.position)
    if (this.blockedTime > 0.1) {
      this.setAction('stunned')
      this.chargeCooldown = CHARGE_COOLDOWN
      this.holdStill()
      body.velocity.y = 2.5
      return
    }

    if (this.actionTime >= CHARGE_DURATION) this.endCharge()
  }

  private endCharge(): void {
    this.setAction('recovery')
    this.chargeCooldown = CHARGE_COOLDOWN
    this.holdStill()
  }

  /** Not used: charges deal the damage (the base chase never runs). */
  protected override performAttack(): void {}

  private provoke(): void {
    if (!this.isAggressive) {
      this.setAction('stalk')
      this.chargeCooldown = Math.max(this.chargeCooldown, 0.4)
    }
    this.isAggressive = true
    this.aggressiveTimer = this.aggroTimeout
  }

  private setAction(action: CrawlerAction): void {
    this.action = action
    this.actionTime = 0
  }

  private horizontalDistance(target: THREE.Vector3): number {
    return Math.hypot(target.x - this.position.x, target.z - this.position.z)
  }

  private holdStill(): void {
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
    }
    this.isWalking = false
  }

  private turnToward(target: THREE.Vector3, deltaTime: number, rate: number): void {
    const desired = Math.atan2(target.x - this.position.x, target.z - this.position.z)
    let delta = desired - this.facing
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    const step = rate * deltaTime
    this.facing += THREE.MathUtils.clamp(delta, -step, step)
  }

  private syncFromBody(): void {
    const body = this.getPhysicsBody()
    if (body) this.position.copy(body.position)
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (!mesh) return
    mesh.position.copy(this.position)
    mesh.rotation.y = this.facing
  }

  // ---- animation -------------------------------------------------------------

  protected updateAnimations(deltaTime: number): void {
    // Crystals breathe slowly; they flare during a windup and when struck
    const windup = this.action === 'windup' ? Math.min(1, this.actionTime / CHARGE_WINDUP) : 0
    const glow = 0.5 + 0.12 * Math.sin(this.glowTime * 1.7) + windup * 0.9 + this.flash * 1.2
    if (this.crystalMaterials[0]) this.crystalMaterials[0].emissiveIntensity = glow
    if (this.crystalMaterials[1]) this.crystalMaterials[1].emissiveIntensity = glow * 0.85

    // Tripod gait: alternate legs swing forward and back
    const charging = this.action === 'charge'
    if (this.isWalking) {
      this.walkPhase += deltaTime * (charging ? 22 : 9)
      this.legs.forEach((leg, i) => {
        const phase = this.walkPhase + ((i % 2 === 0) === (Math.floor(i / 2) % 2 === 0) ? 0 : Math.PI)
        leg.rotation.y = Math.sin(phase) * 0.45
        leg.rotation.z = Math.max(0, Math.cos(phase)) * 0.25 * (i % 2 === 0 ? -1 : 1)
      })
    } else {
      for (const leg of this.legs) {
        leg.rotation.y *= 0.8
        leg.rotation.z *= 0.8
      }
    }

    // Rear back in the windup, lunge low in the charge, sag when stunned
    const body = this.bodyGroup
    if (body) {
      const targetPitch = this.action === 'windup' ? -0.35 * windup : charging ? 0.12 : this.action === 'stunned' ? 0.18 : 0
      body.rotation.x += (targetPitch - body.rotation.x) * Math.min(1, deltaTime * 10)
      body.position.y = this.action === 'stunned' ? -0.04 + 0.02 * Math.sin(this.actionTime * 20) : 0
    }

    // Mandibles snap open in the windup and clack while hostile
    const open = this.action === 'windup' ? 0.55 * windup : this.isAggressive ? 0.15 + 0.12 * Math.sin(this.glowTime * 9) : 0.05
    if (this.leftMandible) this.leftMandible.rotation.y = open
    if (this.rightMandible) this.rightMandible.rotation.y = -open
    if (this.head) this.head.rotation.x = this.action === 'windup' ? -0.2 * windup : 0
  }

  // ---- damage ----------------------------------------------------------------

  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    let damage = getPlayerAttackDamage(heldItem)
    const knockback = getPlayerAttackKnockback(heldItem)

    // The geode back covers the rear and the top: from behind, or struck
    // from above (the player standing higher than its shell), blows glance off
    const dx = playerPosition.x - this.position.x
    const dz = playerPosition.z - this.position.z
    const d = Math.hypot(dx, dz)
    const behind = d > 1e-3 && (dx * Math.sin(this.facing) + dz * Math.cos(this.facing)) / d < BACK_COVER_COS
    const above = playerPosition.y > this.position.y + 0.9
    this.lastHitBlocked = behind || above
    if (this.lastHitBlocked) {
      damage *= BACK_DAMAGE_SHARE
      this.flash = 1
    }
    this.health -= damage

    const body = this.getPhysicsBody()
    if (body && d > 1e-3 && this.action !== 'charge') {
      body.velocity.x = (-dx / d) * this.knockbackHorizontal * knockback
      body.velocity.z = (-dz / d) * this.knockbackHorizontal * knockback
      body.velocity.y = this.knockbackVertical * Math.min(1, knockback)
    }

    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.isAggressive = false
      this.holdStill()
    } else {
      // Glancing blows barely stagger it; a hit mid-charge doesn't stop it
      if (this.action !== 'charge') {
        this.knockbackTimer = this.knockbackStunTime * Math.min(1, knockback) * (this.lastHitBlocked ? 0.4 : 1)
      }
      this.provoke()
    }
    return true
  }

  /** It flips onto its geode back, legs twitching, and the crystals go dark. */
  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    const t = Math.min(1, this.deathTimer / DEATH_DURATION)
    this.holdStill()
    this.syncFromBody()
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
      mesh.position.y += Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.35 + Math.min(1, t * 1.6) * 0.75
      mesh.rotation.y = this.facing
      mesh.rotation.z = Math.min(1, t * 1.6) * Math.PI
    }
    this.legs.forEach((leg, i) => {
      leg.rotation.y = Math.sin(this.deathTimer * 30 + i) * 0.4 * (1 - t)
    })
    for (const m of this.crystalMaterials) m.emissiveIntensity = (1 - t) * 0.6
    if (this.deathTimer >= DEATH_DURATION) this.kill()
  }

  override dispose(): void {
    this.bodyGroup = null
    this.head = null
    this.legs.length = 0
    this.leftMandible = null
    this.rightMandible = null
    this.crystalMaterials = []
    this.playerRef = null
    this.damageFn = null
    super.dispose()
  }
}
