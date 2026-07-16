import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { SlimeBallItem } from '../../../items/materials/slime_ball/SlimeBallItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Slug colors - green, slimy appearance
const SLUG_GREEN = 0x4a7c4e // Dark mossy green body
const SLUG_LIGHT_GREEN = 0x6ba36f // Lighter green for underbelly
const SLUG_DARK_GREEN = 0x2d4d30 // Dark spots/markings
const SLUG_EYE = 0x1a1a1a // Dark eyes

// Slug dimensions (in world units)
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 4 * SCALE // ~0.25 blocks
const BODY_HEIGHT = 3 * SCALE // ~0.19 blocks
const BODY_DEPTH = 8 * SCALE // ~0.5 blocks (elongated slug body)
const HEAD_WIDTH = 3 * SCALE
const HEAD_HEIGHT = 2.5 * SCALE
const HEAD_DEPTH = 2.5 * SCALE
const EYE_STALK_WIDTH = 0.5 * SCALE
const EYE_STALK_HEIGHT = 2 * SCALE
const EYE_SIZE = 1 * SCALE
const TENTACLE_WIDTH = 0.5 * SCALE
const TENTACLE_HEIGHT = 1 * SCALE

/**
 * A slug entity that slowly crawls around swamp biomes.
 * Semi-transparent green creature with iconic eye stalks.
 */
export class SlugEntity extends PeacefulEntity {
  readonly type = 'slug'

  // Animation state
  private bodySquishPhase = 0
  private eyeWobblePhase = 0

  // Mesh references
  private body: THREE.Object3D | null = null
  private eyeStalks: THREE.Object3D[] = []

  constructor(config: IPeacefulEntityConfig) {
    super('slug', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.4, 0.3, 0.6), // Small, low hitbox

      // Very slow movement
      walkSpeed: 0.5, // Very slow crawl (vs 2.0 default, 4.0 rabbit)
      wanderMinInterval: 5.0, // Longer wait between movements
      wanderMaxInterval: 12.0,
      wanderMinDistance: 1.0, // Short crawl distances
      wanderMaxDistance: 3.0,
      jumpVelocity: 0, // Slugs don't jump

      // Combat stats
      maxHealth: 4, // Fragile like rabbits
      fleeSpeed: 1.0, // Still slow when fleeing
      fleeDuration: 2.0, // Short flee

      // Drops
      drops: [{ createItem: () => new SlimeBallItem(), minCount: 1, maxCount: 2 }],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Create semi-transparent slimy materials
    const bodyMaterial = new THREE.MeshLambertMaterial({
      color: SLUG_GREEN,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    })

    const underbellyMaterial = new THREE.MeshLambertMaterial({
      color: SLUG_LIGHT_GREEN,
      transparent: true,
      opacity: 0.6,
    })

    const spotMaterial = new THREE.MeshLambertMaterial({
      color: SLUG_DARK_GREEN,
      transparent: true,
      opacity: 0.8,
    })

    const eyeMaterial = new THREE.MeshLambertMaterial({ color: SLUG_EYE })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(bodyMaterial)
    this.registerMaterialForLighting(underbellyMaterial)
    this.registerMaterialForLighting(spotMaterial)
    this.registerMaterialForLighting(eyeMaterial)

    // Body group for squish animation
    const bodyGroup = new THREE.Group()

    // Main body - elongated oval shape
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial)
    bodyMesh.position.y = BODY_HEIGHT / 2
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    bodyGroup.add(bodyMesh)

    // Underbelly (lighter, flatter)
    const underbellyGeometry = new THREE.BoxGeometry(
      BODY_WIDTH * 0.9,
      BODY_HEIGHT * 0.3,
      BODY_DEPTH * 0.9
    )
    const underbelly = new THREE.Mesh(underbellyGeometry, underbellyMaterial)
    underbelly.position.y = BODY_HEIGHT * 0.2
    bodyGroup.add(underbelly)

    // Dark spots on body (3 spots)
    const spotGeometry = new THREE.BoxGeometry(
      BODY_WIDTH * 0.3,
      BODY_HEIGHT * 0.15,
      BODY_WIDTH * 0.3
    )
    const spotPositions = [
      { x: 0.02, z: 0.1 },
      { x: -0.03, z: -0.05 },
      { x: 0.01, z: -0.15 },
    ]
    for (const pos of spotPositions) {
      const spot = new THREE.Mesh(spotGeometry, spotMaterial)
      spot.position.set(pos.x, BODY_HEIGHT + 0.01, pos.z)
      bodyGroup.add(spot)
    }

    group.add(bodyGroup)
    this.body = bodyGroup

    // Head (slightly raised at front)
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const head = new THREE.Mesh(headGeometry, bodyMaterial)
    head.position.set(0, BODY_HEIGHT * 0.6, BODY_DEPTH / 2 + HEAD_DEPTH / 3)
    head.castShadow = true
    group.add(head)

    // Eye stalks (iconic slug feature)
    const eyeStalkGeometry = new THREE.BoxGeometry(
      EYE_STALK_WIDTH,
      EYE_STALK_HEIGHT,
      EYE_STALK_WIDTH
    )
    const eyeGeometry = new THREE.SphereGeometry(EYE_SIZE / 2, 8, 8)

    this.eyeStalks = []
    const eyeOffsetX = HEAD_WIDTH / 3

    for (const xMult of [-1, 1]) {
      const stalkGroup = new THREE.Group()

      // Stalk
      const stalk = new THREE.Mesh(eyeStalkGeometry, bodyMaterial)
      stalk.position.y = EYE_STALK_HEIGHT / 2
      stalkGroup.add(stalk)

      // Eye at top
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial)
      eye.position.y = EYE_STALK_HEIGHT
      stalkGroup.add(eye)

      stalkGroup.position.set(
        xMult * eyeOffsetX,
        BODY_HEIGHT * 0.6 + HEAD_HEIGHT / 2,
        BODY_DEPTH / 2 + HEAD_DEPTH / 2
      )

      group.add(stalkGroup)
      this.eyeStalks.push(stalkGroup)
    }

    // Small tentacles (sensory feelers below eyes)
    const tentacleGeometry = new THREE.BoxGeometry(
      TENTACLE_WIDTH,
      TENTACLE_HEIGHT,
      TENTACLE_WIDTH
    )
    for (const xMult of [-1, 1]) {
      const tentacle = new THREE.Mesh(tentacleGeometry, bodyMaterial)
      tentacle.position.set(
        xMult * (HEAD_WIDTH / 4),
        BODY_HEIGHT * 0.4,
        BODY_DEPTH / 2 + HEAD_DEPTH
      )
      group.add(tentacle)
    }

    // Set render order for proper transparency
    group.renderOrder = 1

    // Freeze static nodes. The body group (squish) and eye stalks (wobble)
    // animate; the translucent body boxes are left unmerged.
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [this.body, ...this.eyeStalks],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected updateAnimations(deltaTime: number): void {
    // Body squish/stretch during movement (crawling motion)
    if (this.isWalking) {
      this.bodySquishPhase += deltaTime * 3 // Slow squish cycle

      if (this.body) {
        // Elongate then contract
        const stretch = 1 + Math.sin(this.bodySquishPhase) * 0.1
        const squish = 1 - Math.sin(this.bodySquishPhase) * 0.05
        this.body.scale.set(squish, squish, stretch)
      }
    } else {
      // Slowly return to normal
      if (this.body) {
        this.body.scale.lerp(new THREE.Vector3(1, 1, 1), deltaTime * 2)
      }
    }

    // Eye stalk wobble (constant, like real slug eyes)
    this.eyeWobblePhase += deltaTime * 2
    for (let i = 0; i < this.eyeStalks.length; i++) {
      const stalk = this.eyeStalks[i]
      const offset = i * Math.PI // Opposite phase
      stalk.rotation.x = Math.sin(this.eyeWobblePhase + offset) * 0.15
      stalk.rotation.z = Math.sin(this.eyeWobblePhase * 0.7 + offset) * 0.1
    }
  }

  // Override to prevent jumping (slugs don't jump)
  override update(deltaTime: number): void {
    super.update(deltaTime)

    // Ensure slug never jumps by zeroing upward velocity from stuck detection
    const body = this.getPhysicsBody()
    if (body && body.velocity.y > 0 && !this.isDying) {
      body.velocity.y = 0
    }
  }

  override dispose(): void {
    this.body = null
    this.eyeStalks = []
    super.dispose()
  }
}
