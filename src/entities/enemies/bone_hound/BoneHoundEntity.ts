import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { SoulShardItem } from '../../../items/materials/soul_shard/SoulShardItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Bone-white skeleton, soul fire burning in the ribcage and eye sockets
const BONE = 0xd6cdb6
const BONE_DARK = 0x9a907a
const SOUL_FIRE = 0x6dfb9b
const SOUL_CORE = 0xd8ffe4

const SCALE = 0.055

// Pounce: a telegraphed leap from mid range
const POUNCE_MIN_RANGE = 3.5
const POUNCE_MAX_RANGE = 8
const POUNCE_CROUCH = 0.45 // seconds crouched before the leap (the tell)
const POUNCE_SPEED = 10
const POUNCE_LIFT = 6.5
const POUNCE_COOLDOWN = 4
const POUNCE_HIT_RANGE = 1.7

const WALK_SPEED = 10 // leg swing rad/s

/**
 * Bone hound - a skeletal hunting hound of the Ossuary with soul fire
 * burning in its ribcage. Runs players down fast, and from mid range
 * crouches (the tell) and pounces.
 *
 * Stats: 22 HP, 5 damage (bite and pounce), 22 block detection, 6 blocks/s.
 * Drops: 2-4 bones, 15% a soul shard.
 */
export class BoneHoundEntity extends AggressiveEntity {
  readonly type = 'bone_hound'

  private hunterRef: THREE.Vector3 | null = null
  private pounceCooldown = 2
  private crouchTimer = 0
  private pouncing = false
  private pounceHit = false
  private pounceAirTime = 0

  private walkPhase = Math.random() * Math.PI * 2
  private firePhase = Math.random() * Math.PI * 2
  private legs: THREE.Group[] = []
  private head: THREE.Group | null = null
  private jaw: THREE.Mesh | null = null
  private tail: THREE.Group | null = null
  private fireMaterial: THREE.MeshBasicMaterial | null = null
  private readonly tmp = new THREE.Vector3()

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('bone_hound', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 0.85, 0.7),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 22,
      attackDamage: 5,
      attackRange: 1.8,
      attackCooldown: 0.9,
      detectionRange: 22,
      chaseSpeed: 6.0,
      walkSpeed: 2.6,
      jumpVelocity: 8.5,
      attackKnockbackHorizontal: 4.5,
      attackKnockbackVertical: 3.0,
      drops: [
        { createItem: () => new BoneItem(), minCount: 2, maxCount: 4 },
      ],
    })
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.hunterRef = positionRef
  }

  override getDrops() {
    const drops = super.getDrops()
    if (drops.length > 0 && Math.random() < 0.15) drops.push(new SoulShardItem())
    return drops
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const bone = new THREE.MeshLambertMaterial({ color: BONE })
    const boneDark = new THREE.MeshLambertMaterial({ color: BONE_DARK })
    this.fireMaterial = new THREE.MeshBasicMaterial({ color: SOUL_FIRE })
    const coreMaterial = new THREE.MeshBasicMaterial({ color: SOUL_CORE })
    this.registerMaterialForLighting(bone)
    this.registerMaterialForLighting(boneDark)

    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * SCALE, h * SCALE, d * SCALE), mat)
      mesh.position.set(x * SCALE, y * SCALE, z * SCALE)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Spine along +z (front), at hip height 10
    box(2, 2, 16, bone, 0, 12, 0, root)
    // Ribcage: four rib hoops around a soul-fire core
    for (let i = 0; i < 4; i++) {
      const z = 1 + i * 2.2
      box(7, 1, 1, bone, 0, 12, z, root)
      box(1, 6, 1, bone, -3.5, 9.5, z, root)
      box(1, 6, 1, bone, 3.5, 9.5, z, root)
      box(5, 1, 1, boneDark, 0, 6.5, z, root)
    }
    box(3.5, 3.5, 5, this.fireMaterial, 0, 9.5, 4, root)
    box(1.5, 1.5, 2, coreMaterial, 0, 9.5, 4, root)
    // Pelvis
    box(6, 3, 3, bone, 0, 11, -6, root)

    // Head: long skull with a hinged jaw and glowing sockets
    const head = new THREE.Group()
    head.position.set(0, 14, 9 * 1)
    head.position.multiplyScalar(SCALE)
    box(5, 5, 6, bone, 0, 0, 2, head)
    box(3.5, 3, 5, bone, 0, -0.5, 6.5, head) // snout
    box(1, 2, 1, bone, -1.2, 1.5, 9, head) // fang ridge
    box(1, 2, 1, bone, 1.2, 1.5, 9, head)
    box(1.2, 2.5, 1.5, boneDark, -2, 3, 0, head) // ears/horn nubs
    box(1.2, 2.5, 1.5, boneDark, 2, 3, 0, head)
    for (const side of [-1, 1]) box(1.3, 1.1, 0.5, this.fireMaterial, side * 1.4, 1, 5.1, head)
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(3.2 * SCALE, 1.2 * SCALE, 5.5 * SCALE), boneDark)
    jaw.geometry.translate(0, 0, 2.75 * SCALE)
    jaw.position.set(0, -2.6 * SCALE, 3 * SCALE)
    head.add(jaw)
    this.jaw = jaw
    // Neck
    box(2, 2, 4, bone, 0, -1.5, -2, head)
    root.add(head)
    this.head = head

    // Legs: two segments each, pivoting at the shoulder/hip
    const legSpots: Array<[number, number]> = [[-3, 7], [3, 7], [-3, -6], [3, -6]]
    for (const [lx, lz] of legSpots) {
      const leg = new THREE.Group()
      leg.position.set(lx * SCALE, 11 * SCALE, lz * SCALE)
      box(1.6, 6, 1.6, bone, 0, -3, 0, leg)
      box(1.3, 5, 1.3, bone, 0, -8, 0.6, leg)
      box(2, 1, 3, boneDark, 0, -10.6, 1.2, leg) // paw
      root.add(leg)
      this.legs.push(leg)
    }

    // Tail: a chain of vertebrae
    const tail = new THREE.Group()
    tail.position.set(0, 12 * SCALE, -7.5 * SCALE)
    for (let i = 0; i < 5; i++) box(1.2 - i * 0.12, 1.2 - i * 0.12, 1.6, bone, 0, i * 0.5, -1 - i * 1.7, tail)
    root.add(tail)
    this.tail = tail

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [head, jaw, tail, ...this.legs],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  override update(deltaTime: number): void {
    if (this._isDying || this.knockbackTimer > 0) {
      this.crouchTimer = 0
      this.pouncing = false
      super.update(deltaTime)
      return
    }
    this.pounceCooldown = Math.max(0, this.pounceCooldown - deltaTime)
    const body = this.getPhysicsBody()
    const player = this.hunterRef

    // Mid-air pounce: keep the leap's momentum, bite once on contact
    if (this.pouncing && body) {
      this.pounceAirTime += deltaTime
      if (player && !this.pounceHit && this.position.distanceTo(player) <= POUNCE_HIT_RANGE) {
        this.pounceHit = true
        this.performAttack()
        this.attackCooldown = this.attackCooldownDuration
      }
      if ((body.isOnGround && this.pounceAirTime > 0.15) || this.pounceAirTime > 1.5) {
        this.pouncing = false
        this.pounceCooldown = POUNCE_COOLDOWN
      }
      this.position.copy(body.position)
      const mesh = this.getMesh()
      if (mesh) mesh.position.copy(this.position)
      this.updateAnimations(deltaTime)
      return
    }

    // Crouched (the tell) - then leap
    if (this.crouchTimer > 0 && body && player) {
      this.crouchTimer -= deltaTime
      body.velocity.x = 0
      body.velocity.z = 0
      this.faceToward(player)
      if (this.crouchTimer <= 0) {
        this.tmp.copy(player).sub(this.position)
        this.tmp.y = 0
        if (this.tmp.lengthSq() > 0.001) this.tmp.normalize()
        body.velocity.x = this.tmp.x * POUNCE_SPEED
        body.velocity.z = this.tmp.z * POUNCE_SPEED
        body.velocity.y = POUNCE_LIFT
        this.pouncing = true
        this.pounceHit = false
        this.pounceAirTime = 0
      }
      this.position.copy(body.position)
      const mesh = this.getMesh()
      if (mesh) mesh.position.copy(this.position)
      this.updateAnimations(deltaTime)
      return
    }

    if (this.isAggressive && player && body?.isOnGround && this.pounceCooldown <= 0) {
      const dx = player.x - this.position.x
      const dz = player.z - this.position.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d >= POUNCE_MIN_RANGE && d <= POUNCE_MAX_RANGE && Math.abs(player.y - this.position.y) < 3) {
        this.crouchTimer = POUNCE_CROUCH
        return
      }
    }

    super.update(deltaTime)
  }

  private faceToward(target: THREE.Vector3): void {
    const mesh = this.getMesh()
    if (!mesh) return
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (dx * dx + dz * dz > 0.01) mesh.rotation.y = Math.atan2(dx, dz)
  }

  protected updateAnimations(deltaTime: number): void {
    this.firePhase += deltaTime * 6
    if (this.fireMaterial) {
      const flicker = 0.75 + 0.25 * Math.sin(this.firePhase) * Math.sin(this.firePhase * 1.7)
      this.fireMaterial.color.setRGB(0.43 * flicker, 0.98 * flicker, 0.61 * flicker)
    }
    const crouched = this.crouchTimer > 0
    if (this.isWalking || this.pouncing) this.walkPhase += deltaTime * WALK_SPEED * (this.isAggressive ? 1.4 : 1)
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]
      if (this.pouncing) {
        leg.rotation.x = i < 2 ? -0.9 : 0.8 // forelegs reach, hind legs kick
      } else if (crouched) {
        leg.rotation.x = i < 2 ? 0.5 : -0.6
      } else if (this.isWalking) {
        const phase = this.walkPhase + (i === 0 || i === 3 ? 0 : Math.PI)
        leg.rotation.x = Math.sin(phase) * 0.6
      } else {
        leg.rotation.x *= 0.8
      }
    }
    if (this.head) {
      const target = crouched ? -0.25 : this.pouncing ? -0.15 : 0.05 * Math.sin(this.walkPhase * 0.5)
      this.head.rotation.x += (target - this.head.rotation.x) * Math.min(1, deltaTime * 10)
    }
    if (this.jaw) {
      const open = this.pouncing || this.attackCooldown > this.attackCooldownDuration - 0.25 ? 0.6 : crouched ? 0.3 : 0.05
      this.jaw.rotation.x += (open - this.jaw.rotation.x) * Math.min(1, deltaTime * 12)
    }
    if (this.tail) {
      this.tail.rotation.y = Math.sin(this.walkPhase * 0.8) * (this.isAggressive ? 0.5 : 0.25)
      this.tail.rotation.x = crouched ? -0.5 : 0.2
    }
    // Crouch the whole body during the tell
    const mesh = this.getMesh()
    if (mesh && this.legs.length > 0) {
      const sink = crouched ? -0.12 : 0
      mesh.position.y = this.position.y + sink
    }
  }

  override dispose(): void {
    this.hunterRef = null
    this.legs = []
    this.head = null
    this.jaw = null
    this.tail = null
    this.fireMaterial = null
    super.dispose()
  }
}
