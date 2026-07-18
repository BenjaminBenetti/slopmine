import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { SeaShellBlockItem } from '../../../items/blocks/sea_shell/SeaShellBlockItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Sea shell colors - cream and pink spiral
const SHELL_CREAM = 0xf1e3c8 // Main shell
const SHELL_PINK = 0xe6b0a4 // Spiral whorl bands
const SHELL_CREAM_DARK = 0xd8c5a5 // Shading / opening lip

// Sea shell dimensions (in world units)
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BASE_SIZE = 3 * SCALE
const BASE_HEIGHT = 1.4 * SCALE

/**
 * A tiny cream-and-pink spiral sea shell that sits on beach sand.
 * A fully stationary decoration: zero walk speed, zero wander distance,
 * and no knockback, so it never moves after settling on the ground.
 */
export class SeaShellEntity extends PeacefulEntity {
  readonly type = 'sea_shell'

  constructor(config: IPeacefulEntityConfig) {
    super('sea_shell', {
      ...config,
      hasPhysics: true, // Gravity only, so it settles onto the sand
      hitboxSize: new THREE.Vector3(0.25, 0.25, 0.25),

      // Fully stationary: no movement, no jumping, no fleeing
      walkSpeed: 0,
      wanderMinInterval: 60.0,
      wanderMaxInterval: 120.0,
      wanderMinDistance: 0,
      wanderMaxDistance: 0,
      jumpVelocity: 0,

      // Breaks in one or two punches, without being launched
      maxHealth: 2,
      knockbackHorizontal: 0,
      knockbackVertical: 0,
      fleeSpeed: 0,
      fleeDuration: 0,

      // The entity IS the shell, so breaking it always yields exactly one
      drops: [{ createItem: () => new SeaShellBlockItem(), minCount: 1, maxCount: 1 }],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const creamMaterial = new THREE.MeshLambertMaterial({ color: SHELL_CREAM })
    const pinkMaterial = new THREE.MeshLambertMaterial({ color: SHELL_PINK })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: SHELL_CREAM_DARK })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(creamMaterial)
    this.registerMaterialForLighting(pinkMaterial)
    this.registerMaterialForLighting(darkMaterial)

    // Spiral whorl: a stack of shrinking boxes, each offset a little to one
    // side, suggesting a coiled shell in the game's blocky style
    const whorls = [
      { size: BASE_SIZE, height: BASE_HEIGHT, x: 0, z: 0, material: creamMaterial },
      { size: BASE_SIZE * 0.72, height: BASE_HEIGHT * 0.8, x: 0.4 * SCALE, z: -0.3 * SCALE, material: pinkMaterial },
      { size: BASE_SIZE * 0.48, height: BASE_HEIGHT * 0.65, x: 0.7 * SCALE, z: -0.5 * SCALE, material: creamMaterial },
      { size: BASE_SIZE * 0.28, height: BASE_HEIGHT * 0.5, x: 0.9 * SCALE, z: -0.6 * SCALE, material: pinkMaterial },
    ]

    let y = 0
    for (const whorl of whorls) {
      const geometry = new THREE.BoxGeometry(whorl.size, whorl.height, whorl.size)
      const mesh = new THREE.Mesh(geometry, whorl.material)
      mesh.position.set(whorl.x, y + whorl.height / 2, whorl.z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
      // Overlap each whorl slightly into the one below
      y += whorl.height * 0.75
    }

    // Opening lip at the front base of the shell
    const lipGeometry = new THREE.BoxGeometry(BASE_SIZE * 0.5, BASE_HEIGHT * 0.6, BASE_SIZE * 0.3)
    const lip = new THREE.Mesh(lipGeometry, darkMaterial)
    lip.position.set(-BASE_SIZE * 0.3, BASE_HEIGHT * 0.3, BASE_SIZE / 2 + BASE_SIZE * 0.05)
    group.add(lip)

    // Random fixed facing so beaches don't look copy-pasted. Safe because
    // this entity never moves, so the wander AI never rewrites the rotation.
    group.rotation.y = Math.random() * Math.PI * 2

    // Everything is rigid: merge and freeze the whole model
    optimizeEntityMesh(group, {
      merge: true,
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected updateAnimations(_deltaTime: number): void {
    // Fully stationary decoration - no animation
  }
}
