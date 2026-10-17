import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IItem } from '../../../items/Item.ts'
import { getPlayerAttackDamage } from '../../../combat/PlayerAttack.ts'
import { CRYSTAL_ROSE, CRYSTAL_VIOLET } from '../../enemies/crystal_shared/crystalPalette.ts'

/** What a focus orbits (the Prism Warden). */
export interface FocusAnchor {
  readonly position: THREE.Vector3
  readonly isAlive: boolean
  readonly isDefeated: boolean
}

const MAX_HEALTH = 20
const SIZE = 0.9
const SHATTER_TIME = 0.4

/**
 * Prism focus - a floating crystal that orbits the Prism Warden during its
 * refractive shield phase, tethered to its prism heart by a beam of light.
 * While any focus lives the Warden's shield turns most damage aside; each
 * focus breaks after a couple of solid hits. Spawned as a guardian minion
 * (cleared with the guardian).
 */
export class PrismFocusEntity extends Entity {
  readonly type = 'prism_focus'
  /** A shield part, not a creature: breaking it is no kill */
  readonly countsAsKill = false

  private health = MAX_HEALTH
  private _isDying = false
  private dyingTimer = 0
  private angle: number
  private time = Math.random() * 10
  private hurtTimer = 0

  private readonly center = new THREE.Vector3()
  private crystal: THREE.Group | null = null
  private tether: THREE.Mesh | null = null
  private crystalMaterial: THREE.MeshLambertMaterial | null = null

  constructor(
    position: THREE.Vector3,
    private readonly anchor: FocusAnchor,
    startAngle: number,
    private readonly orbitRadius: number,
    private readonly orbitHeight: number,
    private readonly orbitSpeed: number
  ) {
    super('prism_focus', { position, hasPhysics: true, hitboxSize: new THREE.Vector3(SIZE, SIZE, SIZE) })
    this.angle = startAngle
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
    this.place(0)
  }

  get isDying(): boolean {
    return this._isDying
  }

  /** Still holding the shield up. */
  get isActive(): boolean {
    return this.isAlive && !this._isDying
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    this.crystalMaterial = new THREE.MeshLambertMaterial({
      color: CRYSTAL_ROSE,
      emissive: new THREE.Color(CRYSTAL_ROSE),
      emissiveIntensity: 0.9,
    })
    this.registerMaterialForLighting(this.crystalMaterial)
    const crystal = new THREE.Group()
    crystal.position.y = SIZE / 2
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), this.crystalMaterial)
    body.scale.set(0.8, 1.35, 0.8)
    crystal.add(body)
    const heart = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: 0xffe6ff })
    )
    crystal.add(heart)
    // Two small shards circling the focus
    for (const k of [0, 1]) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.28, 0.08),
        new THREE.MeshBasicMaterial({ color: CRYSTAL_VIOLET })
      )
      shard.position.set(k === 0 ? 0.62 : -0.62, 0, 0)
      crystal.add(shard)
    }
    root.add(crystal)
    this.crystal = crystal

    // Tether of light to the Warden's prism heart (+Z of the tether group points at it)
    const tetherGeometry = new THREE.BoxGeometry(0.07, 0.07, 1).translate(0, 0, 0.5)
    this.tether = new THREE.Mesh(
      tetherGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xd890ff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    this.tether.position.y = SIZE / 2
    root.add(this.tether)
    return root
  }

  update(deltaTime: number): void {
    this.time += deltaTime
    if (this._isDying) {
      this.dyingTimer += deltaTime
      const t = Math.min(1, this.dyingTimer / SHATTER_TIME)
      if (this.crystal) {
        this.crystal.scale.setScalar(Math.max(0.01, 1 + t * 0.8 - t * t * 1.8))
        this.crystal.rotation.y += deltaTime * 20
      }
      if (this.tether) this.tether.visible = false
      if (this.crystalMaterial) this.crystalMaterial.emissiveIntensity = 0.9 + t * 3
      this.syncMesh()
      if (this.dyingTimer >= SHATTER_TIME) this.kill()
      return
    }
    if (!this.anchor.isAlive || this.anchor.isDefeated) {
      this._isDying = true
      return
    }

    this.angle += this.orbitSpeed * deltaTime
    this.place(deltaTime)
    this.hurtTimer = Math.max(0, this.hurtTimer - deltaTime)

    if (this.crystal) {
      this.crystal.rotation.y += deltaTime * 2.4
      const pulse = 1 + Math.sin(this.time * 4) * 0.06 + this.hurtTimer * 0.6
      this.crystal.scale.setScalar(pulse)
    }
    if (this.crystalMaterial) {
      this.crystalMaterial.emissiveIntensity = 0.8 + 0.25 * Math.sin(this.time * 3) + this.hurtTimer * 3
    }
    this.syncMesh()
    // Aim the tether at the Warden's heart
    const tether = this.tether
    if (tether) {
      const mesh = this.getMesh()
      mesh?.updateMatrixWorld(true)
      this.center.set(this.anchor.position.x, this.anchor.position.y + 2.55, this.anchor.position.z)
      const from = new THREE.Vector3(this.position.x, this.position.y + SIZE / 2, this.position.z)
      tether.scale.z = Math.max(0.1, from.distanceTo(this.center))
      tether.lookAt(this.center)
      if (tether.material instanceof THREE.MeshBasicMaterial) {
        tether.material.opacity = 0.4 + 0.25 * Math.sin(this.time * 9)
      }
    }
  }

  /** Orbit position around the anchor (feet of the hitbox). */
  private place(_deltaTime: number): void {
    const bob = Math.sin(this.time * 1.7 + this.angle) * 0.35
    this.position.set(
      this.anchor.position.x + Math.cos(this.angle) * this.orbitRadius,
      this.anchor.position.y + this.orbitHeight + bob,
      this.anchor.position.z + Math.sin(this.angle) * this.orbitRadius
    )
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const body = this.getPhysicsBody()
    if (body) body.position.copy(this.position)
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isActive) return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 0.5
  }

  getDrops(): IItem[] {
    return []
  }

  onPlayerInteract(_playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isActive) return false
    this.health -= getPlayerAttackDamage(heldItem)
    this.hurtTimer = 0.25
    if (this.health <= 0) {
      this._isDying = true
      this.dyingTimer = 0
    }
    return true
  }

  dispose(): void {
    this.crystal = null
    this.tether = null
    this.crystalMaterial = null
    super.dispose()
  }
}
