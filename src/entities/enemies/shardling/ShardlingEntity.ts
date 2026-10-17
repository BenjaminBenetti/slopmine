import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { PrismShardItem } from '../../../items/materials/prism_shard/PrismShardItem.ts'
import { spawnCrystalEntity } from '../crystal_shared/CrystalEntityHooks.ts'
import {
  ABYSSAL_ROCK, ABYSSAL_ROCK_DARK, CRYSTAL_LAVENDER, CRYSTAL_ROSE, CRYSTAL_VIOLET, EYE_GLOW,
} from '../crystal_shared/crystalPalette.ts'

/** Size class: a full shardling, or a fragment left when one shatters. */
export type ShardlingSize = 'large' | 'fragment'

const SHATTER_DURATION = 0.45 // seconds of the shatter animation
const WALK_SWING_SPEED = 9.0
const WALK_SWING_AMPLITUDE = 0.5
const ATTACK_SWING_SPEED = 10.0

/**
 * Shardling - a small crystal golem of the Crystal Abyss: a squat body of
 * abyssal rock bristling with glowing violet crystal spikes, glowing eyes,
 * stubby legs and heavy crystal fists.
 *
 * A full shardling (30 HP, hits 7) SHATTERS when killed: it bursts apart and
 * leaves two fragments (12 HP, hits 4, faster) that keep fighting. Shards
 * drop from both.
 *
 * Drops: large 1-2 prism shards; fragment 0-1.
 */
export class ShardlingEntity extends AggressiveEntity {
  readonly type = 'shardling'
  readonly size: ShardlingSize
  /** Fragments this shardling burst into (IEntity.spawnedChildren) */
  readonly spawnedChildren: ShardlingEntity[] = []

  private walkPhase = Math.random() * Math.PI * 2
  private attackPhase = 0
  private isAttacking = false
  private glowPhase = Math.random() * Math.PI * 2
  private shattered = false

  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private crystalMaterial: THREE.MeshLambertMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3; size?: ShardlingSize }) {
    const size = config.size ?? 'large'
    const large = size === 'large'
    super('shardling', {
      ...config,
      hasPhysics: true,
      hitboxSize: large ? new THREE.Vector3(0.8, 1.0, 0.8) : new THREE.Vector3(0.5, 0.6, 0.5),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: large ? 30 : 12,
      attackDamage: large ? 7 : 4,
      attackRange: large ? 1.9 : 1.5,
      attackCooldown: large ? 1.3 : 0.9,
      detectionRange: 18,
      chaseSpeed: large ? 3.6 : 5.0,
      walkSpeed: large ? 1.4 : 2.2,
      knockbackHorizontal: large ? 3.0 : 6.0,
      knockbackVertical: large ? 3.0 : 4.5,
      attackKnockbackHorizontal: large ? 5.5 : 3.5,
      attackKnockbackVertical: 3.5,
      drops: [
        { createItem: () => new PrismShardItem(), minCount: large ? 1 : 0, maxCount: large ? 2 : 1 },
      ],
    })
    this.size = size
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    const rock = new THREE.MeshLambertMaterial({ color: ABYSSAL_ROCK })
    const rockDark = new THREE.MeshLambertMaterial({ color: ABYSSAL_ROCK_DARK })
    this.crystalMaterial = new THREE.MeshLambertMaterial({
      color: CRYSTAL_VIOLET,
      emissive: new THREE.Color(CRYSTAL_VIOLET),
      emissiveIntensity: 0.55,
    })
    const roseMaterial = new THREE.MeshLambertMaterial({
      color: CRYSTAL_ROSE,
      emissive: new THREE.Color(CRYSTAL_ROSE),
      emissiveIntensity: 0.5,
    })
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE_GLOW })
    this.registerMaterialForLighting(rock)
    this.registerMaterialForLighting(rockDark)
    this.registerMaterialForLighting(this.crystalMaterial)
    this.registerMaterialForLighting(roseMaterial)

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Torso: a squat block of abyssal rock with a darker brow and jaw
    box(0.72, 0.5, 0.6, rock, 0, 0.55, 0, body)
    box(0.62, 0.12, 0.08, rockDark, 0, 0.72, 0.31, body) // brow
    box(0.5, 0.1, 0.08, rockDark, 0, 0.38, 0.31, body) // jaw
    box(0.11, 0.07, 0.03, eyeMaterial, -0.15, 0.62, 0.32, body)
    box(0.11, 0.07, 0.03, eyeMaterial, 0.15, 0.62, 0.32, body)

    // Crystal spikes bristling from the back and shoulders
    const spikes: Array<[number, number, number, number, number, number, number]> = [
      // x, y, z, height, width, tiltX, tiltZ
      [0, 0.92, -0.08, 0.42, 0.14, -0.35, 0],
      [-0.22, 0.86, -0.12, 0.32, 0.12, -0.45, 0.4],
      [0.22, 0.86, -0.12, 0.3, 0.12, -0.45, -0.4],
      [-0.36, 0.78, 0.05, 0.22, 0.1, 0, 0.8],
      [0.36, 0.78, 0.05, 0.24, 0.1, 0, -0.8],
      [0.08, 0.8, -0.3, 0.26, 0.1, -0.9, -0.2],
    ]
    spikes.forEach(([x, y, z, h, w, tx, tz], i) => {
      const spike = box(w, h, w, i % 3 === 1 ? roseMaterial : this.crystalMaterial!, x, y + h / 2, z, body)
      spike.rotation.set(tx, i * 0.6, tz)
    })

    // Legs (stubby) and arms with crystal fists
    const leg = (x: number): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(x, 0.3, 0)
      box(0.22, 0.3, 0.24, rockDark, 0, -0.15, 0, g)
      body.add(g)
      return g
    }
    this.leftLeg = leg(-0.2)
    this.rightLeg = leg(0.2)

    const arm = (x: number): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(x, 0.72, 0)
      box(0.17, 0.36, 0.17, rock, 0, -0.18, 0, g)
      box(0.22, 0.2, 0.22, this.crystalMaterial!, 0, -0.42, 0.02, g)
      body.add(g)
      return g
    }
    this.leftArm = arm(-0.45)
    this.rightArm = arm(0.45)

    const scale = this.size === 'large' ? 1.0 : 0.6
    root.scale.setScalar(scale)

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [root, this.leftLeg, this.rightLeg, this.leftArm, this.rightArm],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  protected override performAttack(): void {
    super.performAttack()
    this.isAttacking = true
    this.attackPhase = 0
  }

  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (this._isDying && !this.shattered) {
      this.shattered = true
      if (this.size === 'large') this.splitIntoFragments()
    }
    return handled
  }

  /** A full shardling bursts into two fragments that keep fighting. */
  private splitIntoFragments(): void {
    for (const side of [-1, 1]) {
      const angle = Math.random() * Math.PI * 2
      const pos = this.position.clone()
      pos.x += Math.cos(angle) * 0.4 * side
      pos.z += Math.sin(angle) * 0.4 * side
      pos.y += 0.3
      const fragment = new ShardlingEntity({ position: pos, size: 'fragment' })
      const body = fragment.getPhysicsBody()
      if (body) {
        body.velocity.set(Math.cos(angle) * 3 * side, 5, Math.sin(angle) * 3 * side)
      }
      this.spawnedChildren.push(fragment)
      spawnCrystalEntity(fragment)
    }
  }

  override update(deltaTime: number): void {
    if (this._isDying) {
      // Shatter: spin and collapse into nothing instead of falling over
      this.deathTimer += deltaTime
      const mesh = this.getMesh()
      const t = Math.min(1, this.deathTimer / SHATTER_DURATION)
      if (mesh) {
        const base = this.size === 'large' ? 1.0 : 0.6
        mesh.scale.setScalar(base * (1 - t * t) + 0.001)
        mesh.rotation.y += deltaTime * 14
        mesh.position.copy(this.position)
        mesh.position.y += t * 0.4
      }
      if (this.crystalMaterial) this.crystalMaterial.emissiveIntensity = 0.55 + t * 2
      if (this.deathTimer >= SHATTER_DURATION) this.kill()
      return
    }
    super.update(deltaTime)
  }

  protected updateAnimations(deltaTime: number): void {
    this.glowPhase += deltaTime * 2.2
    if (this.crystalMaterial) {
      this.crystalMaterial.emissiveIntensity = 0.45 + 0.2 * Math.sin(this.glowPhase)
    }

    if (this.isAttacking) {
      this.attackPhase += deltaTime * ATTACK_SWING_SPEED
      const progress = Math.min(this.attackPhase / Math.PI, 1)
      // Both fists rise and slam down
      const swing = -2.4 + (1 - Math.pow(1 - progress, 3)) * 3.0
      if (this.leftArm) this.leftArm.rotation.x = swing
      if (this.rightArm) this.rightArm.rotation.x = swing
      if (this.attackPhase >= Math.PI) {
        this.isAttacking = false
        this.attackPhase = 0
      }
      return
    }

    if (this.isWalking) {
      this.walkPhase += deltaTime * WALK_SWING_SPEED * (this.size === 'large' ? 1 : 1.4)
      const swing = Math.sin(this.walkPhase) * WALK_SWING_AMPLITUDE
      if (this.leftLeg) this.leftLeg.rotation.x = swing
      if (this.rightLeg) this.rightLeg.rotation.x = -swing
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.6
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.6
    } else {
      for (const part of [this.leftLeg, this.rightLeg, this.leftArm, this.rightArm]) {
        if (part) part.rotation.x *= 0.8
      }
    }
  }

  override dispose(): void {
    this.leftLeg = null
    this.rightLeg = null
    this.leftArm = null
    this.rightArm = null
    this.crystalMaterial = null
    super.dispose()
  }
}
