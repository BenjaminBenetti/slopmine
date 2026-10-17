import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { EmberwoodStemBlockItem } from '../../../items/blocks/emberwood_stem/EmberwoodStemBlockItem.ts'
import { DiamondItem } from '../../../items/ores/diamond/DiamondItem.ts'
import { CorruptedEssenceItem } from '../../../items/materials/corrupted_essence/CorruptedEssenceItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { playerEffects } from '../../../player/effects/StatusEffects.ts'
import { ROOTBOUND_EFFECT } from './RootboundEffect.ts'

// Colours: root-wood body, chitin carapace, teal heart, ember eyes
const ROOT = 0x4a2622
const ROOT_DARK = 0x2e1614
const CHITIN = 0x2a0e12
const CHITIN_SHEEN = 0x5a2026
const GLOW_TEAL = 0x5ae6cc
const EYE_EMBER = 0xffa040

const S = 0.0625 // 1 "pixel" = 1/16 block

// Tuning: a dungeon tank for diamond/infernium players (6 infernium-sword
// hits); hits within DESIGN §8 (4-9).
const MAX_HEALTH = 56
const MAUL_DAMAGE = 9
const MAUL_REACH = 3.0
const MAUL_WINDUP = 0.85
const MAUL_RECOVERY = 0.6
const SNARE_DAMAGE = 4
const SNARE_RANGE_MIN = 4
const SNARE_RANGE_MAX = 12
const SNARE_WINDUP = 1.1
const SNARE_RADIUS = 1.7
const SNARE_COOLDOWN = 6.5
const SNARE_ROOT_SECONDS = 2.5
/** Pull speed toward the warden when the snare lands (blocks/s). */
const SNARE_PULL = 11
/** Fraction of player-hit knockback it shrugs off. */
const KNOCKBACK_RESIST = 0.85
const PLAYER_EYE = 1.62

type WardenAction = 'none' | 'maul' | 'snare'

/**
 * Rootbound warden - a slow, armoured root golem guarding the Sporeheart
 * Hive's halls (dungeon garrisons only). A hunched mass of woven roots under
 * a horned chitin carapace, a glowing teal heart in its chest, and two huge
 * root arms dragging on the floor.
 *
 * - Root maul (melee): it rears up with both arms raised (0.85 s), then
 *   slams them down in front of it: 9 damage + heavy knockback.
 * - Root snare (4-12 blocks, line of sight): it plunges an arm into the
 *   floor and a teal ring of roots glows under the player for 1.1 s; if the
 *   player is still in it, roots erupt: 4 damage, "Rootbound" (heavy slow,
 *   2.5 s) and a yank toward the warden - into maul range.
 * Shrugs off most knockback; dodge the ring, then punish the maul recovery.
 *
 * Drops: 2-4 emberwood stems, 0-1 corrupted essence, sometimes a diamond.
 */
export class RootboundWardenEntity extends AggressiveEntity {
  readonly type = 'rootbound_warden'

  private action: WardenAction = 'none'
  private actionTime = 0
  private snareCooldown = 3 + Math.random() * 2
  private time = Math.random() * 10
  private readonly snareTarget = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  private player: THREE.Vector3 | null = null
  private damageCb: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private solidAt: ((x: number, y: number, z: number) => boolean) | null = null

  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private torso: THREE.Group | null = null
  private glowMaterial: THREE.MeshBasicMaterial | null = null
  private snareMarker: THREE.Mesh | null = null
  private snareMaterial: THREE.MeshBasicMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('rootbound_warden', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.3, 2.6, 1.3),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: MAUL_DAMAGE,
      attackRange: 2.4,
      attackCooldown: 1.6,
      detectionRange: 18,
      chaseSpeed: 2.3,
      walkSpeed: 1.0,
      attackKnockbackHorizontal: 10,
      attackKnockbackVertical: 5,
      knockbackStunTime: 0.15,
      aggroTimeout: 8,
      drops: [
        { createItem: () => new EmberwoodStemBlockItem(), minCount: 2, maxCount: 4 },
        { createItem: () => new CorruptedEssenceItem(), minCount: 0, maxCount: 1 },
        { createItem: () => new DiamondItem(), minCount: 0, maxCount: 0.4 },
      ],
    })
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
    const root = new THREE.MeshLambertMaterial({ color: ROOT })
    const rootDark = new THREE.MeshLambertMaterial({ color: ROOT_DARK })
    const chitin = new THREE.MeshLambertMaterial({ color: CHITIN })
    const sheen = new THREE.MeshLambertMaterial({ color: CHITIN_SHEEN })
    for (const m of [root, rootDark, chitin, sheen]) this.registerMaterialForLighting(m)
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: GLOW_TEAL })
    const eye = new THREE.MeshBasicMaterial({ color: EYE_EMBER })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Stumpy root legs
    const legH = 10
    const makeLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group()
      leg.position.set(side * 5 * S, legH * S, 0)
      box(6, legH, 6, rootDark, 0, -legH / 2, 0, leg)
      box(8, 2, 9, root, 0, -legH + 1, 1, leg) // splayed root foot
      group.add(leg)
      return leg
    }
    this.leftLeg = makeLeg(-1)
    this.rightLeg = makeLeg(1)

    // Hunched torso: broad root mass under a horned chitin carapace
    const torso = new THREE.Group()
    torso.position.y = legH * S
    group.add(torso)
    this.torso = torso
    box(20, 18, 14, root, 0, 9, 0, torso)
    box(16, 6, 12, rootDark, 0, 2, 0, torso)
    // Carapace plates over the back and shoulders, horn ridge on top
    box(23, 5, 16, chitin, 0, 20, -2, torso)
    box(20, 4, 12, sheen, 0, 23.5, -3, torso)
    box(26, 5, 10, chitin, 0, 16, -5, torso)
    for (const [x, h] of [[-7, 6], [-2.5, 9], [2.5, 9], [7, 6]] as const) box(2.5, h, 2.5, chitin, x, 25 + h / 2, -3, torso)
    // Teal heart glowing through a gap in the chest roots
    box(6, 6, 1.5, this.glowMaterial, 0, 10, 7.2, torso)
    box(2, 9, 1.6, rootDark, -3.5, 10, 7.4, torso)
    box(2, 9, 1.6, rootDark, 3.5, 10, 7.4, torso)
    // Head sunk between the shoulders, ember eyes under the carapace brow
    box(9, 6, 6, rootDark, 0, 17, 6, torso)
    box(10, 2, 7, chitin, 0, 20.5, 6.5, torso)
    box(2, 1.2, 0.5, eye, -2.4, 17.6, 9.1, torso)
    box(2, 1.2, 0.5, eye, 2.4, 17.6, 9.1, torso)

    // Huge root arms hinged at the shoulders, knuckles near the floor
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 13 * S, (legH + 17) * S, 1 * S)
      box(7, 14, 7, root, 0, -7, 0, arm)
      box(6, 10, 6, rootDark, 0, -18, 1, arm)
      box(9, 5, 9, root, 0, -24, 1.5, arm) // knuckle club
      box(3, 3, 3, this.glowMaterial!, 0, -24, 6.2, arm) // sap knot (glows)
      box(4, 6, 2, chitin, side * 2, -3, -3.5, arm) // shoulder plate
      group.add(arm)
      return arm
    }
    this.leftArm = makeArm(-1)
    this.rightArm = makeArm(1)

    // Snare telegraph: a glowing ring of roots on the floor (positioned per frame)
    this.snareMaterial = new THREE.MeshBasicMaterial({
      color: GLOW_TEAL, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
    })
    const marker = new THREE.Mesh(new THREE.RingGeometry(SNARE_RADIUS * 0.55, SNARE_RADIUS, 32, 1).rotateX(-Math.PI / 2), this.snareMaterial)
    const inner = new THREE.Mesh(new THREE.CircleGeometry(SNARE_RADIUS * 0.55, 24).rotateX(-Math.PI / 2), this.snareMaterial)
    inner.position.y = 0.005
    marker.add(inner)
    marker.visible = false
    marker.renderOrder = 510
    group.add(marker)
    this.snareMarker = marker

    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, torso, marker],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return group
  }

  // ---- combat ----

  /** The base chase calls this when in reach and off cooldown: start the maul windup. */
  protected override performAttack(): void {
    if (this.action !== 'none') return
    this.action = 'maul'
    this.actionTime = 0
  }

  /** Mostly shrugs off player knockback (a tank), with a short flinch. */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const hit = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    const body = this.getPhysicsBody()
    if (hit && body && !this._isDying) {
      body.velocity.x *= 1 - KNOCKBACK_RESIST
      body.velocity.z *= 1 - KNOCKBACK_RESIST
      body.velocity.y *= 1 - KNOCKBACK_RESIST
    }
    return hit
  }

  update(deltaTime: number): void {
    super.update(deltaTime)
    if (this._isDying) {
      if (this.snareMarker) this.snareMarker.visible = false
      this.action = 'none'
    }
  }

  /** Runs every frame after the base AI moved it: drives the maul and the snare. */
  private updateActions(deltaTime: number): void {
    this.snareCooldown -= deltaTime
    const player = this.player
    const aggressive = this.isAggressive && !!player && !this._isDying

    if (this.action === 'none' && aggressive && this.snareCooldown <= 0) {
      const d = Math.hypot(player.x - this.position.x, player.z - this.position.z)
      if (d >= SNARE_RANGE_MIN && d <= SNARE_RANGE_MAX && Math.abs(player.y - this.position.y) < 4 && this.canSee(player)) {
        this.action = 'snare'
        this.actionTime = 0
        this.snareTarget.copy(player)
      }
    }
    if (this.action === 'none') return

    // Root in place while acting (the base chase keeps steering otherwise)
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
    }
    this.isWalking = false
    this.actionTime += deltaTime
    const faceTarget = this.action === 'snare' ? this.snareTarget : player
    if (faceTarget) this.faceToward(faceTarget, deltaTime)

    if (this.action === 'maul') {
      if (this.actionTime >= MAUL_WINDUP && this.actionTime - deltaTime < MAUL_WINDUP) this.landMaul()
      if (this.actionTime >= MAUL_WINDUP + MAUL_RECOVERY) this.action = 'none'
    } else if (this.action === 'snare') {
      if (this.actionTime >= SNARE_WINDUP && this.actionTime - deltaTime < SNARE_WINDUP) this.landSnare()
      if (this.actionTime >= SNARE_WINDUP + 0.5) {
        this.action = 'none'
        this.snareCooldown = SNARE_COOLDOWN
      }
    }
  }

  private landMaul(): void {
    const player = this.player
    if (!player || !this.damageCb) return
    const dx = player.x - this.position.x
    const dz = player.z - this.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > MAUL_REACH || Math.abs(player.y - this.position.y) > 2.5) return
    // Frontal arc only (it slams where it faces)
    const mesh = this.getMesh()
    if (mesh && dist > 0.5) {
      const facing = mesh.rotation.y
      let delta = Math.atan2(dx, dz) - facing
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      if (Math.abs(delta) > Math.PI * 0.6) return
    }
    const push = this.tmp.set(dx, 0, dz)
    if (push.lengthSq() > 1e-6) push.normalize()
    push.multiplyScalar(this.attackKnockbackHorizontal)
    push.y = this.attackKnockbackVertical
    this.damageCb(MAUL_DAMAGE, push, 'melee')
  }

  private landSnare(): void {
    const player = this.player
    if (!player || !this.damageCb) return
    const dx = player.x - this.snareTarget.x
    const dz = player.z - this.snareTarget.z
    if (dx * dx + dz * dz > SNARE_RADIUS * SNARE_RADIUS || Math.abs(player.y - this.snareTarget.y) > 2) return
    // Yank toward the warden
    const pull = this.tmp.set(this.position.x - player.x, 0, this.position.z - player.z)
    const dist = pull.length()
    if (dist > 1e-3) pull.divideScalar(dist)
    pull.multiplyScalar(Math.min(SNARE_PULL, 4 + dist * 1.1))
    pull.y = 3.5
    const landed = this.damageCb(SNARE_DAMAGE, pull, 'melee')
    if (landed !== false) playerEffects.apply(ROOTBOUND_EFFECT, SNARE_ROOT_SECONDS, 1)
  }

  private canSee(player: THREE.Vector3): boolean {
    if (!this.solidAt) return true
    const ox = this.position.x, oy = this.position.y + 2, oz = this.position.z
    const dx = player.x - ox, dy = player.y + PLAYER_EYE - oy, dz = player.z - oz
    const steps = Math.ceil(Math.hypot(dx, dy, dz) / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidAt(Math.floor(ox + dx * t), Math.floor(oy + dy * t), Math.floor(oz + dz * t))) return false
    }
    return true
  }

  private faceToward(target: THREE.Vector3, deltaTime: number): void {
    const mesh = this.getMesh()
    if (!mesh) return
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (dx * dx + dz * dz < 1e-4) return
    let delta = Math.atan2(dx, dz) - mesh.rotation.y
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    mesh.rotation.y += THREE.MathUtils.clamp(delta, -3 * deltaTime, 3 * deltaTime)
  }

  // ---- animation ----

  protected updateAnimations(deltaTime: number): void {
    this.updateActions(deltaTime)
    this.time += deltaTime
    const t = this.time
    const k = this.action === 'maul' ? this.actionTime : this.action === 'snare' ? this.actionTime : 0

    // Heart glow pulse, brighter while acting
    if (this.glowMaterial) {
      const flare = this.action === 'none' ? 0 : 0.5 + 0.5 * Math.sin(t * 20)
      this.glowMaterial.color.setHex(GLOW_TEAL).multiplyScalar(0.7 + 0.2 * Math.sin(t * 2.4) + 0.4 * flare)
    }

    let leftX = 0, rightX = 0, torsoX = 0.1
    if (this.action === 'maul') {
      if (k < MAUL_WINDUP) {
        const w = Math.min(1, k / MAUL_WINDUP)
        leftX = rightX = -2.9 * (1 - (1 - w) * (1 - w)) // both arms up and back
        torsoX = -0.25 * w // rear up
      } else {
        const r = Math.min(1, (k - MAUL_WINDUP) / MAUL_RECOVERY)
        leftX = rightX = -0.6 * (1 - r) // slammed forward, then settle
        torsoX = 0.35 * (1 - r) + 0.1 * r
      }
    } else if (this.action === 'snare') {
      // Right arm plunges into the floor, torso leans in
      const w = Math.min(1, k / SNARE_WINDUP)
      rightX = -0.9 * w
      leftX = 0.2 * w
      torsoX = 0.3 * w
    } else if (this.isWalking) {
      const swing = Math.sin(t * 3.2) * 0.35
      leftX = swing
      rightX = -swing
      if (this.leftLeg) this.leftLeg.rotation.x = -swing * 0.8
      if (this.rightLeg) this.rightLeg.rotation.x = swing * 0.8
    } else {
      // Idle: knuckles drag, slow breathing
      leftX = rightX = Math.sin(t * 1.1) * 0.05
      if (this.leftLeg) this.leftLeg.rotation.x *= 0.9
      if (this.rightLeg) this.rightLeg.rotation.x *= 0.9
    }
    if (this.leftArm) this.leftArm.rotation.x = leftX
    if (this.rightArm) this.rightArm.rotation.x = rightX
    if (this.torso) this.torso.rotation.x = torsoX + Math.sin(t * 1.1) * 0.02

    // Snare telegraph ring under the (remembered) player position
    const marker = this.snareMarker
    if (marker && this.snareMaterial) {
      const show = this.action === 'snare'
      marker.visible = show
      const mesh = this.getMesh()
      if (show && mesh) {
        const dx = this.snareTarget.x - this.position.x
        const dz = this.snareTarget.z - this.position.z
        const f = mesh.rotation.y
        const c = Math.cos(f), s = Math.sin(f)
        marker.position.set(dx * c - dz * s, this.snareTarget.y - this.position.y + 0.06, dx * s + dz * c)
        const w = Math.min(1, k / SNARE_WINDUP)
        this.snareMaterial.opacity = k >= SNARE_WINDUP ? 1 : 0.3 + 0.55 * w * (0.75 + 0.25 * Math.sin(t * 22))
      }
    }
  }

  dispose(): void {
    this.leftArm = null
    this.rightArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.torso = null
    this.glowMaterial = null
    this.snareMarker = null
    this.snareMaterial = null
    this.player = null
    this.damageCb = null
    this.solidAt = null
    super.dispose()
  }
}
