import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { RimeCrystalItem } from '../../../items/materials/rime_crystal/RimeCrystalItem.ts'

const FLESH = 0x2b303a
const FLESH_LIGHT = 0x3a414e
const ICE = 0x8fb4cf
const ICE_PALE = 0xc4dceb
const ICE_DEEP = 0x6a93b5
const EYE = 0xbff4ff

/** Wind-up of the overhead slam: the attack's telegraph. */
const WINDUP_TIME = 0.6
/** Slam follow-through. */
const SLAM_TIME = 0.25
/** The slam still lands if the player is within attackRange + this when it falls. */
const SLAM_REACH_MARGIN = 0.7
const FROSTBITE_CHANCE = 0.35
const FROSTBITE_SECONDS = 3

const WALK_SPEED_ANIM = 4.5

/**
 * Ice Revenant - a sinner of Cocytus that tore itself out of the ice, still
 * crusted in it. Slow and relentless: it lumbers after the player, raises its
 * ice-bound fists overhead (a long, readable wind-up) and slams down for
 * heavy damage and knockback, sometimes leaving Frostbite (slowness).
 * Stepping out of reach during the wind-up makes the slam miss.
 *
 * Stats: 40 HP, 9 damage, slow (2.6 blocks/s chase), 18-block detection.
 * Drops: 1-3 bones, 0-1 rime crystal (40%).
 */
export class IceRevenantEntity extends AggressiveEntity {
  readonly type = 'ice_revenant'

  private walkPhase = Math.random() * Math.PI * 2
  private windupTimer = -1
  private slamTimer = -1
  private playerPos: THREE.Vector3 | null = null

  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private torso: THREE.Group | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('ice_revenant', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.8, 2.05, 0.8),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 40,
      attackDamage: 9,
      attackRange: 2.4,
      attackCooldown: 2.2,
      detectionRange: 18,
      chaseSpeed: 2.6,
      walkSpeed: 1.1,
      attackKnockbackHorizontal: 8,
      attackKnockbackVertical: 4.5,
      knockbackHorizontal: 2.5, // heavy: barely budges
      knockbackVertical: 2,
      knockbackStunTime: 0.25,
      drops: [
        { createItem: () => new BoneItem(), minCount: 1, maxCount: 3 },
        { createItem: () => new RimeCrystalItem(), minCount: 0, maxCount: 1 },
      ],
    })
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.playerPos = positionRef
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const flesh = new THREE.MeshLambertMaterial({ color: FLESH })
    const fleshLight = new THREE.MeshLambertMaterial({ color: FLESH_LIGHT })
    const ice = new THREE.MeshLambertMaterial({ color: ICE })
    const icePale = new THREE.MeshLambertMaterial({ color: ICE_PALE })
    const iceDeep = new THREE.MeshLambertMaterial({ color: ICE_DEEP })
    for (const m of [flesh, fleshLight, ice, icePale, iceDeep]) this.registerMaterialForLighting(m)
    const eye = new THREE.MeshBasicMaterial({ color: EYE })

    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Legs (pivot at the hips)
    const makeLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group()
      leg.position.set(side * 0.2, 0.92, 0)
      box(leg, 0.28, 0.92, 0.3, 0, -0.46, 0, flesh)
      box(leg, 0.34, 0.26, 0.36, 0, -0.42, 0.02, ice) // iced knee
      box(leg, 0.32, 0.12, 0.42, 0, -0.86, 0.05, iceDeep) // frozen foot
      root.add(leg)
      return leg
    }
    this.leftLeg = makeLeg(-1)
    this.rightLeg = makeLeg(1)

    // Torso (hunched forward), head and ice crust
    const torso = new THREE.Group()
    torso.position.set(0, 0.92, 0)
    torso.rotation.x = 0.18
    root.add(torso)
    this.torso = torso
    box(torso, 0.78, 0.82, 0.46, 0, 0.45, 0, fleshLight)
    box(torso, 0.6, 0.42, 0.08, 0, 0.5, 0.25, icePale) // chest plate of ice
    box(torso, 0.4, 0.34, 0.42, -0.48, 0.82, 0, ice) // shoulder ice
    box(torso, 0.4, 0.38, 0.42, 0.48, 0.84, 0, iceDeep)
    box(torso, 0.42, 0.42, 0.42, 0, 1.08, 0.08, flesh) // head
    box(torso, 0.08, 0.05, 0.02, -0.1, 1.1, 0.3, eye)
    box(torso, 0.08, 0.05, 0.02, 0.1, 1.1, 0.3, eye)
    box(torso, 0.1, 0.22, 0.1, -0.12, 1.38, 0.04, icePale) // ice crown shards
    box(torso, 0.1, 0.3, 0.1, 0.04, 1.42, 0.02, icePale)
    box(torso, 0.1, 0.18, 0.1, 0.16, 1.36, 0.08, ice)

    // Arms (pivot at the shoulders); the right ends in a great ice fist
    const makeArm = (side: number, big: boolean): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 0.52, 0.76, 0)
      box(arm, 0.26, 0.82, 0.28, 0, -0.4, 0, flesh)
      box(arm, 0.3, 0.3, 0.32, 0, -0.2, 0, ice)
      if (big) box(arm, 0.46, 0.5, 0.46, 0, -0.95, 0.02, ice)
      else box(arm, 0.3, 0.3, 0.3, 0, -0.88, 0.02, iceDeep)
      torso.add(arm)
      return arm
    }
    this.leftArm = makeArm(-1, false)
    this.rightArm = makeArm(1, true)

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.torso],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  /** Start the telegraphed slam instead of hitting immediately. */
  protected override performAttack(): void {
    if (this.windupTimer < 0 && this.slamTimer < 0) this.windupTimer = 0
  }

  override update(deltaTime: number): void {
    if (this.windupTimer >= 0 && !this._isDying) {
      this.windupTimer += deltaTime
      if (this.windupTimer >= WINDUP_TIME) {
        this.windupTimer = -1
        this.slamTimer = 0
        const p = this.playerPos
        if (p && this.position.distanceTo(p) <= this.attackRange + SLAM_REACH_MARGIN) {
          super.performAttack()
          if (Math.random() < FROSTBITE_CHANCE) playerEffects.apply(StatusEffectIds.SLOWNESS, FROSTBITE_SECONDS, 1)
        }
      }
    } else if (this.slamTimer >= 0) {
      this.slamTimer += deltaTime
      if (this.slamTimer >= SLAM_TIME) this.slamTimer = -1
    }
    super.update(deltaTime)
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.windupTimer >= 0) {
      // Raise both fists high overhead, leaning back
      const p = Math.min(1, this.windupTimer / WINDUP_TIME)
      const ease = 1 - (1 - p) * (1 - p)
      if (this.leftArm) this.leftArm.rotation.x = -2.7 * ease
      if (this.rightArm) this.rightArm.rotation.x = -2.8 * ease
      if (this.torso) this.torso.rotation.x = 0.18 - 0.3 * ease
      return
    }
    if (this.slamTimer >= 0) {
      // Bring them down hard, bending forward
      const p = Math.min(1, this.slamTimer / SLAM_TIME)
      if (this.leftArm) this.leftArm.rotation.x = -2.7 + 3.3 * p
      if (this.rightArm) this.rightArm.rotation.x = -2.8 + 3.4 * p
      if (this.torso) this.torso.rotation.x = -0.12 + 0.55 * p
      return
    }
    if (this.torso) this.torso.rotation.x = 0.18
    if (this.isWalking) {
      this.walkPhase += deltaTime * WALK_SPEED_ANIM
      const swing = Math.sin(this.walkPhase) * 0.45
      if (this.leftLeg) this.leftLeg.rotation.x = swing
      if (this.rightLeg) this.rightLeg.rotation.x = -swing
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.5 - 0.15
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.4 - 0.1
      if (this.torso) this.torso.rotation.z = Math.sin(this.walkPhase) * 0.06 // lumbering sway
    } else {
      if (this.leftLeg) this.leftLeg.rotation.x = 0
      if (this.rightLeg) this.rightLeg.rotation.x = 0
      if (this.leftArm) this.leftArm.rotation.x = -0.15
      if (this.rightArm) this.rightArm.rotation.x = -0.1
      if (this.torso) this.torso.rotation.z = 0
    }
  }

  dispose(): void {
    this.leftArm = null
    this.rightArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.torso = null
    this.playerPos = null
    super.dispose()
  }
}
