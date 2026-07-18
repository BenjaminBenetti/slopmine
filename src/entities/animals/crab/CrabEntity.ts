import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { RawCrabMeatItem } from '../../../items/food/raw_crab_meat/RawCrabMeatItem.ts'
import { CrabShellBlockItem } from '../../../items/blocks/crab_shell/CrabShellBlockItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Crab colors - red-orange beach crab
const CRAB_SHELL = 0xd6472e // Red-orange carapace
const CRAB_SHELL_DARK = 0xa93a26 // Darker shell shading
const CRAB_LEG = 0x9e3a24 // Darker legs
const CRAB_CLAW = 0xe0603c // Lighter claws
const CRAB_EYE = 0x1a1a1a // Dark eyes

// Crab dimensions (in world units)
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
// The crab "faces" +X while the wander AI moves it along its local +Z axis,
// so the body is built wide along Z: it visibly scuttles sideways.
const BODY_WIDTH = 5 * SCALE // Along facing axis (X)
const BODY_HEIGHT = 2.5 * SCALE
const BODY_DEPTH = 7 * SCALE // Wide leg-to-leg axis (Z)
const LEG_HEIGHT = 2 * SCALE
const LEG_WIDTH = 0.8 * SCALE
const ARM_LENGTH = 2 * SCALE
const ARM_SIZE = 1 * SCALE
const CLAW_SIZE = 1.6 * SCALE
const EYE_STALK_HEIGHT = 1.5 * SCALE
const EYE_STALK_WIDTH = 0.6 * SCALE
const EYE_SIZE = 0.9 * SCALE

/**
 * A small red-orange crab that scuttles around beaches.
 * Reuses the standard PeacefulEntity wander AI at a slow walk speed; the
 * model faces sideways relative to its movement axis for a scuttling look.
 */
export class CrabEntity extends PeacefulEntity {
  readonly type = 'crab'

  // Animation state
  private legAnimPhase = 0
  private clawAnimPhase = 0

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private claws: THREE.Object3D[] = []

  constructor(config: IPeacefulEntityConfig) {
    super('crab', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.5, 0.35, 0.5),

      // Slow wandering, rabbit-style idle-wander AI from the base class
      walkSpeed: 1.2,
      wanderMinInterval: 2.0,
      wanderMaxInterval: 6.0,
      wanderMinDistance: 1.5,
      wanderMaxDistance: 4.0,
      jumpVelocity: 6.0, // Enough to clear a single block when stuck

      // Fragile, skittish
      maxHealth: 4,
      fleeSpeed: 2.5,

      // Drops
      drops: [
        { createItem: () => new RawCrabMeatItem(), minCount: 0, maxCount: 1 },
        { createItem: () => new CrabShellBlockItem(), minCount: 0, maxCount: 1 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const shellMaterial = new THREE.MeshLambertMaterial({ color: CRAB_SHELL })
    const shellDarkMaterial = new THREE.MeshLambertMaterial({ color: CRAB_SHELL_DARK })
    const legMaterial = new THREE.MeshLambertMaterial({ color: CRAB_LEG })
    const clawMaterial = new THREE.MeshLambertMaterial({ color: CRAB_CLAW })
    const eyeMaterial = new THREE.MeshLambertMaterial({ color: CRAB_EYE })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(shellMaterial)
    this.registerMaterialForLighting(shellDarkMaterial)
    this.registerMaterialForLighting(legMaterial)
    this.registerMaterialForLighting(clawMaterial)
    this.registerMaterialForLighting(eyeMaterial)

    // Flat, wide body
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, shellMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Darker shell plate on top
    const plateGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.7, BODY_HEIGHT * 0.35, BODY_DEPTH * 0.7)
    const plate = new THREE.Mesh(plateGeometry, shellDarkMaterial)
    plate.position.y = LEG_HEIGHT + BODY_HEIGHT
    plate.castShadow = true
    group.add(plate)

    // Eye stalks on top of the front (+X) edge of the shell
    const stalkGeometry = new THREE.BoxGeometry(EYE_STALK_WIDTH, EYE_STALK_HEIGHT, EYE_STALK_WIDTH)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE, EYE_SIZE, EYE_SIZE)
    for (const zMult of [-1, 1]) {
      const stalk = new THREE.Mesh(stalkGeometry, legMaterial)
      stalk.position.set(
        BODY_WIDTH / 2 - EYE_STALK_WIDTH,
        LEG_HEIGHT + BODY_HEIGHT + EYE_STALK_HEIGHT / 2,
        zMult * BODY_DEPTH * 0.18
      )
      stalk.castShadow = true
      group.add(stalk)

      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial)
      eye.position.set(0, EYE_STALK_HEIGHT / 2 + EYE_SIZE / 3, 0)
      stalk.add(eye)
    }

    // Claw arms extending from the front (+X) corners
    const armGeometry = new THREE.BoxGeometry(ARM_LENGTH, ARM_SIZE, ARM_SIZE)
    const clawGeometry = new THREE.BoxGeometry(CLAW_SIZE, CLAW_SIZE * 0.9, CLAW_SIZE)
    for (const zMult of [-1, 1]) {
      const clawGroup = new THREE.Group()
      clawGroup.position.set(
        BODY_WIDTH / 2,
        LEG_HEIGHT + BODY_HEIGHT * 0.4,
        zMult * BODY_DEPTH * 0.35
      )

      const arm = new THREE.Mesh(armGeometry, legMaterial)
      arm.position.x = ARM_LENGTH / 2
      arm.castShadow = true
      clawGroup.add(arm)

      const claw = new THREE.Mesh(clawGeometry, clawMaterial)
      claw.position.x = ARM_LENGTH + CLAW_SIZE / 3
      claw.castShadow = true
      clawGroup.add(claw)

      group.add(clawGroup)
      this.claws.push(clawGroup)
    }

    // Legs: three per side, sticking out of the wide (+/-Z) sides so they
    // sweep along the movement axis while walking
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT + BODY_HEIGHT * 0.4, LEG_WIDTH)
    this.legs = []
    for (const zMult of [-1, 1]) {
      for (const xOffset of [-1.5, 0, 1.5]) {
        const leg = new THREE.Mesh(legGeometry, legMaterial)
        leg.position.set(
          xOffset * SCALE,
          LEG_HEIGHT / 2,
          zMult * (BODY_DEPTH / 2 + LEG_WIDTH / 2)
        )
        // Splay legs slightly outward
        leg.rotation.x = zMult * -0.25
        leg.castShadow = true
        group.add(leg)
        this.legs.push(leg)
      }
    }

    // Merge rigid boxes and freeze static nodes. Legs and claw arms animate.
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [...this.legs, ...this.claws],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.isWalking) {
      // Rapid alternating leg skitter while moving. Rotation around X sweeps
      // the legs along the movement (local Z) axis; the splay offset is the
      // resting outward tilt baked in at build time.
      this.legAnimPhase += deltaTime * 14
      for (let i = 0; i < this.legs.length; i++) {
        const leg = this.legs[i]
        const splay = (i < 3 ? -1 : 1) * -0.25
        const phase = this.legAnimPhase + (i % 3) * (Math.PI / 1.5)
        leg.rotation.x = splay + Math.sin(phase) * 0.4
      }

      // Claws tuck in slightly while scuttling
      for (const claw of this.claws) {
        claw.rotation.z = -0.15
      }
    } else {
      // Legs settle back to their resting splay
      for (let i = 0; i < this.legs.length; i++) {
        const leg = this.legs[i]
        const splay = (i < 3 ? -1 : 1) * -0.25
        leg.rotation.x = splay + (leg.rotation.x - splay) * 0.9
      }

      // Idle claw wave
      this.clawAnimPhase += deltaTime * 2
      for (let i = 0; i < this.claws.length; i++) {
        const claw = this.claws[i]
        const offset = i * Math.PI // Alternate claws
        claw.rotation.z = Math.sin(this.clawAnimPhase + offset) * 0.2 - 0.1
      }
    }
  }

  dispose(): void {
    this.legs = []
    this.claws = []
    super.dispose()
  }
}
