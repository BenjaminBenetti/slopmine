import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { SeaStarItem } from '../../../items/materials/sea_star/SeaStarItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Sea star colors - warm orange
const STAR_ORANGE = 0xe87f3a // Main body
const STAR_DARK = 0xc75f28 // Arm tips / shading
const STAR_BUMP = 0xf3a55e // Center bump highlight

// Sea star dimensions (in world units)
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const CENTER_SIZE = 2 * SCALE
const CENTER_HEIGHT = 1.2 * SCALE
const ARM_WIDTH = 1.4 * SCALE
const ARM_HEIGHT = 1 * SCALE
const ARM_LENGTH = 2.5 * SCALE
const TIP_SIZE = 0.9 * SCALE
const ARM_COUNT = 5

/**
 * A small flat five-armed sea star that lies on beach sand.
 * Near-stationary: it uses the standard wander AI with a barely-perceptible
 * crawl speed and very long pauses, so it mostly just sits there.
 */
export class SeaStarEntity extends PeacefulEntity {
  readonly type = 'sea_star'

  // Animation state
  private pulsePhase = 0

  // Mesh reference for the subtle breathing pulse
  private starBody: THREE.Object3D | null = null

  constructor(config: IPeacefulEntityConfig) {
    super('sea_star', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.5, 0.25, 0.5),

      // Barely moves: an imperceptible crawl with long idle stretches
      walkSpeed: 0.1,
      wanderMinInterval: 10.0,
      wanderMaxInterval: 25.0,
      wanderMinDistance: 0.5,
      wanderMaxDistance: 1.5,
      jumpVelocity: 0, // Sea stars don't jump

      // Fragile, doesn't get launched when hit
      maxHealth: 2,
      knockbackHorizontal: 1.5,
      knockbackVertical: 0,
      fleeSpeed: 0.2,
      fleeDuration: 1.0,

      // Picking up a sea star always yields the sea star itself
      drops: [{ createItem: () => new SeaStarItem(), minCount: 1, maxCount: 1 }],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const orangeMaterial = new THREE.MeshLambertMaterial({ color: STAR_ORANGE })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: STAR_DARK })
    const bumpMaterial = new THREE.MeshLambertMaterial({ color: STAR_BUMP })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(orangeMaterial)
    this.registerMaterialForLighting(darkMaterial)
    this.registerMaterialForLighting(bumpMaterial)

    // Body group so the whole star can pulse gently
    const starGroup = new THREE.Group()

    // Central disc
    const centerGeometry = new THREE.BoxGeometry(CENTER_SIZE, CENTER_HEIGHT, CENTER_SIZE)
    const center = new THREE.Mesh(centerGeometry, orangeMaterial)
    center.position.y = CENTER_HEIGHT / 2
    center.castShadow = true
    center.receiveShadow = true
    starGroup.add(center)

    // Center bump (lighter highlight on top)
    const bumpGeometry = new THREE.BoxGeometry(CENTER_SIZE * 0.5, CENTER_HEIGHT * 0.4, CENTER_SIZE * 0.5)
    const bump = new THREE.Mesh(bumpGeometry, bumpMaterial)
    bump.position.y = CENTER_HEIGHT + CENTER_HEIGHT * 0.1
    starGroup.add(bump)

    // Five arms radiating outward, each with a slightly narrower dark tip
    const armGeometry = new THREE.BoxGeometry(ARM_WIDTH, ARM_HEIGHT, ARM_LENGTH)
    const tipGeometry = new THREE.BoxGeometry(TIP_SIZE, ARM_HEIGHT * 0.8, TIP_SIZE)
    for (let i = 0; i < ARM_COUNT; i++) {
      const armGroup = new THREE.Group()
      armGroup.rotation.y = (i / ARM_COUNT) * Math.PI * 2

      const arm = new THREE.Mesh(armGeometry, orangeMaterial)
      arm.position.set(0, ARM_HEIGHT / 2, CENTER_SIZE / 2 + ARM_LENGTH / 2 - ARM_WIDTH * 0.25)
      arm.castShadow = true
      arm.receiveShadow = true
      armGroup.add(arm)

      const tip = new THREE.Mesh(tipGeometry, darkMaterial)
      tip.position.set(0, ARM_HEIGHT * 0.4, CENTER_SIZE / 2 + ARM_LENGTH + TIP_SIZE * 0.2)
      armGroup.add(tip)

      starGroup.add(armGroup)
    }

    group.add(starGroup)
    this.starBody = starGroup

    // Merge rigid boxes; only the star body group animates (subtle pulse).
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [this.starBody],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected updateAnimations(deltaTime: number): void {
    // Very subtle breathing pulse so it reads as alive
    this.pulsePhase += deltaTime * 1.5
    if (this.starBody) {
      const pulse = 1 + Math.sin(this.pulsePhase) * 0.02
      this.starBody.scale.set(pulse, 1, pulse)
    }
  }

  // Sea stars never leave the ground (no jumping, even from stuck detection)
  override update(deltaTime: number): void {
    super.update(deltaTime)

    const body = this.getPhysicsBody()
    if (body && body.velocity.y > 0 && !this.isDying) {
      body.velocity.y = 0
    }
  }

  override dispose(): void {
    this.starBody = null
    super.dispose()
  }
}
