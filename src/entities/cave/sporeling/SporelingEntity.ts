import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { PlantBlockItem } from '../../../items/blocks/plants/PlantBlockItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { playSound } from '../../../audio/SoundHooks.ts'

// Sporeling colours: a pale ivory cap over glowing teal gills, a cream stalk
// body, dark stubby feet and two pinprick eyes
const CAP = 0xe8e0cc
const CAP_SHADE = 0xcfc4a8
const CAP_SPOT = 0xd8ceb4
const STALK = 0xddd6c2
const STALK_SHADE = 0xbfb7a2
const FOOT = 0x7a6e5c
const GLOW_GILLS = 0x5ae0d4
const GLOW_EYES = 0x9af0e8
const PUFF_COLOR = 0x9fe8dc

const SCALE = 0.0625 // 1 "pixel" = 1/16 block
const FOOT_H = 2.5 * SCALE
const STALK_W = 6 * SCALE
const STALK_H = 6 * SCALE
const CAP_W = 10 * SCALE
const CAP_H = 4 * SCALE

/** A hit within this distance of the player puffs spores into their face (blocks). */
const SPORE_RADIUS = 3
/** Poison from one spore puff (seconds). */
const SPORE_POISON_SECONDS = 3
/** How long the spore puff sprite takes to swell and fade (seconds). */
const PUFF_DURATION = 0.6
/** Upward speed of each angry hop (blocks/s). */
const HOP_VELOCITY = 4.2
const HOP_INTERVAL = 0.55

/**
 * Sporeling - a small walking mushroom of the fungal hollows, the size of a
 * fox: a pale ivory cap over glowing teal gills, two pinprick eyes, stubby
 * feet. It waddles about and ignores the player - until it is hit: every hit
 * puffs a spore cloud from its cap (Poison for 3 s to a player within 3
 * blocks), and for a few seconds it hops after the attacker and headbutts.
 *
 * Stats: 14 HP, 2 damage when provoked, 1.0 s attack cooldown, calms after 5 s.
 * Drops: 1-2 cave mushrooms.
 */
export class SporelingEntity extends AggressiveEntity {
  readonly type = 'sporeling'

  private walkPhase = Math.random() * Math.PI * 2
  private idlePhase = Math.random() * Math.PI * 2
  private headbuttPhase = 0
  private isHeadbutting = false
  private hopTimer = 0

  private body: THREE.Object3D | null = null
  private feet: THREE.Mesh[] = []
  private glowMaterial: THREE.MeshBasicMaterial | null = null

  // The spore puff: one sphere owned by this sporeling, shown while it swells
  private puff: THREE.Mesh | null = null
  private puffMaterial: THREE.MeshBasicMaterial | null = null
  private puffTime = -1

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('sporeling', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.6, 0.9, 0.6),
      aggressionMode: AggressionMode.AGGRESSIVE_WHEN_PROVOKED,
      maxHealth: 14,
      attackDamage: 2,
      attackRange: 1.3,
      attackCooldown: 1.0,
      detectionRange: 12,
      chaseSpeed: 3.2,
      walkSpeed: 0.9,
      attackKnockbackHorizontal: 3.0,
      attackKnockbackVertical: 2.5,
      provokedDuration: 5,
      drops: [{ createItem: (): IItem => new PlantBlockItem('cave_mushrooms', 'Cave Mushrooms'), minCount: 1, maxCount: 2 }],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    const cap = new THREE.MeshLambertMaterial({ color: CAP })
    const capShade = new THREE.MeshLambertMaterial({ color: CAP_SHADE })
    const capSpot = new THREE.MeshLambertMaterial({ color: CAP_SPOT })
    const stalk = new THREE.MeshLambertMaterial({ color: STALK })
    const stalkShade = new THREE.MeshLambertMaterial({ color: STALK_SHADE })
    const foot = new THREE.MeshLambertMaterial({ color: FOOT })
    for (const m of [cap, capShade, capSpot, stalk, stalkShade, foot]) this.registerMaterialForLighting(m)
    // Glowing parts stay full-bright (not registered for world light), so a
    // sporeling shows in the dark of the hollows
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: GLOW_GILLS })
    const eye = new THREE.MeshBasicMaterial({ color: GLOW_EYES })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Body (stalk + cap + face) pivots at the feet so it can waddle and lunge
    const bodyGroup = new THREE.Group()
    bodyGroup.position.set(0, FOOT_H, 0)
    group.add(bodyGroup)

    // Stalk: a stout cream trunk, a little narrower at the top
    box(STALK_W, STALK_H, STALK_W, stalk, 0, STALK_H / 2, 0, bodyGroup)
    box(STALK_W + 1 * SCALE, 1.5 * SCALE, STALK_W + 1 * SCALE, stalkShade, 0, 0.75 * SCALE, 0, bodyGroup)

    // Glowing gills: a ring under the cap, wider than the stalk
    const gillY = STALK_H + 0.4 * SCALE
    box(CAP_W - 1 * SCALE, 0.8 * SCALE, CAP_W - 1 * SCALE, this.glowMaterial, 0, gillY, 0, bodyGroup)

    // Domed cap: a broad slab, a narrower crown, a little top
    const capY = gillY + 0.4 * SCALE
    box(CAP_W, CAP_H * 0.5, CAP_W, cap, 0, capY + CAP_H * 0.25, 0, bodyGroup)
    box(CAP_W - 2 * SCALE, CAP_H * 0.4, CAP_W - 2 * SCALE, cap, 0, capY + CAP_H * 0.7, 0, bodyGroup)
    box(CAP_W - 5 * SCALE, CAP_H * 0.25, CAP_W - 5 * SCALE, capShade, 0, capY + CAP_H * 1.02, 0, bodyGroup)
    // A rim that droops a little over the gills, and a few pale spots
    box(CAP_W + 0.6 * SCALE, 0.8 * SCALE, CAP_W + 0.6 * SCALE, capShade, 0, capY, 0, bodyGroup)
    const spots: Array<[number, number]> = [[-2.5, 1.5], [2, -2], [1.5, 2.5], [-1, -3]]
    for (const [sx, sz] of spots) {
      box(1.6 * SCALE, 0.4 * SCALE, 1.6 * SCALE, capSpot, sx * SCALE, capY + CAP_H * 0.92, sz * SCALE, bodyGroup)
    }

    // Two pinprick eyes on the front of the stalk, just under the gills
    for (const side of [-1, 1]) {
      box(1 * SCALE, 1.2 * SCALE, 0.3 * SCALE, eye, side * 1.4 * SCALE, STALK_H * 0.62, STALK_W / 2 + 0.05 * SCALE, bodyGroup)
    }

    // Stubby feet
    this.feet = []
    for (const side of [-1, 1]) {
      const f = box(2.4 * SCALE, FOOT_H, 3 * SCALE, foot, side * 1.6 * SCALE, FOOT_H / 2, 0.4 * SCALE, group)
      this.feet.push(f)
    }

    this.body = bodyGroup
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [bodyGroup, ...this.feet],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // The spore puff, added after merging so it stays its own mesh
    this.puffMaterial = new THREE.MeshBasicMaterial({
      color: PUFF_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    this.puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), this.puffMaterial)
    this.puff.position.set(0, FOOT_H + capY + CAP_H * 0.6, 0)
    this.puff.visible = false
    group.add(this.puff)

    return group
  }

  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const hit = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!hit) return false
    // Every hit puffs spores from the cap
    this.puffTime = 0
    playSound('proj.spore', { x: this.position.x, y: this.position.y + 0.8, z: this.position.z })
    if (playerPosition.distanceTo(this.position) <= SPORE_RADIUS) {
      playerEffects.apply(StatusEffectIds.POISON, SPORE_POISON_SECONDS, 1)
    }
    return true
  }

  protected override performAttack(): void {
    super.performAttack()
    this.isHeadbutting = true
    this.headbuttPhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    this.idlePhase += deltaTime

    // Gills breathe
    if (this.glowMaterial) {
      const k = 0.78 + 0.22 * Math.sin(this.idlePhase * 1.8)
      this.glowMaterial.color.setHex(GLOW_GILLS).multiplyScalar(k)
    }

    this.updatePuff(deltaTime)

    // Provoked: hop after the attacker in little angry bounces
    if (this.isAggressive) {
      this.hopTimer -= deltaTime
      const physics = this.getPhysicsBody()
      if (this.hopTimer <= 0 && physics?.isOnGround && this.isWalking) {
        physics.velocity.y = HOP_VELOCITY
        this.hopTimer = HOP_INTERVAL
      }
    }

    const body = this.body
    if (!body) return

    // Headbutt: lean back, then snap the cap forward
    if (this.isHeadbutting) {
      this.headbuttPhase += deltaTime * 8
      if (this.headbuttPhase >= Math.PI) {
        this.isHeadbutting = false
        body.rotation.x = 0
      } else {
        body.rotation.x = Math.sin(this.headbuttPhase) * 0.6 - Math.sin(this.headbuttPhase * 2) * 0.25
      }
    }

    if (this.isWalking) {
      // Waddle: rock side to side and bob with each step
      this.walkPhase += deltaTime * (this.isAggressive ? 13 : 7)
      const step = Math.sin(this.walkPhase)
      body.rotation.z = step * 0.16
      body.position.y = FOOT_H + Math.abs(step) * 0.6 * SCALE
      if (this.feet.length === 2) {
        this.feet[0].position.y = FOOT_H / 2 + Math.max(0, step) * 1.2 * SCALE
        this.feet[1].position.y = FOOT_H / 2 + Math.max(0, -step) * 1.2 * SCALE
      }
    } else {
      // Idle: a slow sway and the cap nodding now and then
      body.rotation.z *= 0.85
      body.position.y = FOOT_H + Math.sin(this.idlePhase * 1.6) * 0.3 * SCALE
      if (!this.isHeadbutting) body.rotation.x = Math.max(0, Math.sin(this.idlePhase * 0.7)) * 0.12
      for (const f of this.feet) f.position.y = FOOT_H / 2
    }
  }

  /** Swell and fade the spore puff after a hit. */
  private updatePuff(deltaTime: number): void {
    const puff = this.puff
    const material = this.puffMaterial
    if (!puff || !material) return
    if (this.puffTime < 0) {
      puff.visible = false
      return
    }
    this.puffTime += deltaTime
    const t = this.puffTime / PUFF_DURATION
    if (t >= 1) {
      this.puffTime = -1
      puff.visible = false
      material.opacity = 0
      return
    }
    puff.visible = true
    const s = 0.4 + 1.6 * Math.sqrt(t)
    puff.scale.set(s, s * 0.8, s)
    material.opacity = 0.55 * (1 - t) * (1 - t)
  }

  dispose(): void {
    if (this.puff) {
      this.puff.geometry.dispose()
      this.puff.removeFromParent()
    }
    this.puffMaterial?.dispose()
    this.puff = null
    this.puffMaterial = null
    this.body = null
    this.feet = []
    this.glowMaterial = null
    super.dispose()
  }
}
