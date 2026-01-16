import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { RawKomodoMeatItem } from '../../../items/food/raw_komodo_meat/RawKomodoMeatItem.ts'
import { KomodoScalesItem } from '../../../items/materials/komodo_scales/KomodoScalesItem.ts'

// Import komodo dragon texture
import komodoTextureUrl from './assets/komodo-dragon-texture.webp'

// Komodo dragon colors (red volcanic theme)
const KOMODO_RED = 0x8b2500 // Dark red
const KOMODO_DARK_RED = 0x5c1a0a // Darker red for pattern
const KOMODO_BELLY = 0xb8860b // Golden brown belly
const KOMODO_DARK = 0x1a1a1a // Eyes/details
const KOMODO_TONGUE = 0xff6b6b // Pink-red tongue

// Komodo dragon dimensions (in world units)
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 10 * SCALE
const BODY_HEIGHT = 6 * SCALE
const BODY_DEPTH = 24 * SCALE // Long body
const HEAD_WIDTH = 6 * SCALE
const HEAD_HEIGHT = 4 * SCALE
const HEAD_DEPTH = 8 * SCALE
const SNOUT_WIDTH = 4 * SCALE
const SNOUT_HEIGHT = 2.5 * SCALE
const SNOUT_DEPTH = 6 * SCALE
const LEG_WIDTH = 3 * SCALE
const LEG_HEIGHT = 5 * SCALE // Longer legs than alligator
const LEG_DEPTH = 3 * SCALE
const TAIL_WIDTH = 6 * SCALE
const TAIL_HEIGHT = 4 * SCALE
const TAIL_DEPTH = 16 * SCALE
const TAIL_TIP_WIDTH = 3 * SCALE
const TAIL_TIP_HEIGHT = 2 * SCALE
const TAIL_TIP_DEPTH = 10 * SCALE
const EYE_SIZE = 1.5 * SCALE
const TONGUE_WIDTH = 0.5 * SCALE
const TONGUE_LENGTH = 3 * SCALE

// Animation constants
const TONGUE_FLICK_INTERVAL = 2.5
const TONGUE_FLICK_DURATION = 0.2

/**
 * A Komodo dragon entity that lives in volcanic biomes.
 * Red-colored lizard that wanders peacefully and flees when attacked.
 */
export class KomodoDragonEntity extends PeacefulEntity {
  readonly type = 'komodo_dragon'

  // Animation state
  private legAnimPhase = 0
  private tailSwayPhase = 0
  private tonguePhase = 0
  private tongueExtended = false

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private tail: THREE.Object3D | null = null
  private tongue: THREE.Mesh | null = null

  // Shared texture (loaded once for all instances)
  private static texture: THREE.Texture | null = null
  private static textureLoading = false
  private textureApplied = false

  constructor(config: IPeacefulEntityConfig) {
    super('komodo_dragon', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.2, 0.6, 2.0), // Long, low hitbox
      walkSpeed: 2.0,
      fleeSpeed: 4.5,
      maxHealth: 15,
      wanderMinDistance: 4.0,
      wanderMaxDistance: 10.0,
      wanderMinInterval: 3.0,
      wanderMaxInterval: 8.0,
      drops: [
        { createItem: () => new RawKomodoMeatItem(), minCount: 2, maxCount: 4 },
        { createItem: () => new KomodoScalesItem(), minCount: 1, maxCount: 2 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Load texture if not already loaded
    if (!KomodoDragonEntity.texture && !KomodoDragonEntity.textureLoading) {
      KomodoDragonEntity.textureLoading = true
      const loader = new THREE.TextureLoader()
      loader.load(komodoTextureUrl, (texture) => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        // Enable tiling for scaly texture
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(4, 4) // Tile the scales across body
        KomodoDragonEntity.texture = texture
      })
    }

    // Create materials
    const bodyMaterial = this.createMaterial(KOMODO_RED)
    const patternMaterial = this.createMaterial(KOMODO_DARK_RED)
    const bellyMaterial = new THREE.MeshLambertMaterial({ color: KOMODO_BELLY })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: KOMODO_DARK })
    const tongueMaterial = new THREE.MeshLambertMaterial({ color: KOMODO_TONGUE })

    // Body (long, low rectangle)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Belly (lighter underside)
    const bellyGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.7, BODY_HEIGHT * 0.25, BODY_DEPTH * 0.85)
    const belly = new THREE.Mesh(bellyGeometry, bellyMaterial)
    belly.position.y = LEG_HEIGHT + BODY_HEIGHT * 0.2
    group.add(belly)

    // Scale pattern on back (darker spots)
    const scaleGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.25, BODY_HEIGHT * 0.15, BODY_WIDTH * 0.25)
    for (let i = 0; i < 6; i++) {
      const xOffset = (i % 2 === 0 ? -1 : 1) * BODY_WIDTH * 0.25
      const scale = new THREE.Mesh(scaleGeometry, patternMaterial)
      scale.position.set(xOffset, LEG_HEIGHT + BODY_HEIGHT + BODY_HEIGHT * 0.02, BODY_DEPTH * 0.3 - i * BODY_DEPTH * 0.12)
      scale.castShadow = true
      group.add(scale)
    }

    // Head group
    const headGroup = new THREE.Group()

    // Head base
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Snout (elongated)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, bodyMaterial)
    snout.position.z = HEAD_DEPTH / 2 + SNOUT_DEPTH / 2
    snout.position.y = -HEAD_HEIGHT / 6
    snout.castShadow = true
    headGroup.add(snout)

    // Nostrils
    const nostrilGeometry = new THREE.BoxGeometry(0.8 * SCALE, 0.8 * SCALE, 0.4 * SCALE)
    const leftNostril = new THREE.Mesh(nostrilGeometry, darkMaterial)
    leftNostril.position.set(-SNOUT_WIDTH / 4, SNOUT_HEIGHT / 4, SNOUT_DEPTH / 2)
    snout.add(leftNostril)

    const rightNostril = new THREE.Mesh(nostrilGeometry, darkMaterial)
    rightNostril.position.set(SNOUT_WIDTH / 4, SNOUT_HEIGHT / 4, SNOUT_DEPTH / 2)
    snout.add(rightNostril)

    // Forked tongue (hidden initially)
    const tongueGeometry = new THREE.BoxGeometry(TONGUE_WIDTH, TONGUE_WIDTH * 0.3, TONGUE_LENGTH)
    const tongueMesh = new THREE.Mesh(tongueGeometry, tongueMaterial)
    tongueMesh.position.set(0, -SNOUT_HEIGHT / 3, SNOUT_DEPTH / 2 + TONGUE_LENGTH / 2)
    tongueMesh.visible = false
    snout.add(tongueMesh)
    this.tongue = tongueMesh

    // Fork prongs
    const prongGeometry = new THREE.BoxGeometry(TONGUE_WIDTH * 0.4, TONGUE_WIDTH * 0.2, TONGUE_WIDTH * 0.6)
    const leftProng = new THREE.Mesh(prongGeometry, tongueMaterial)
    leftProng.position.set(-TONGUE_WIDTH * 0.5, 0, TONGUE_LENGTH / 2 + TONGUE_WIDTH * 0.2)
    tongueMesh.add(leftProng)

    const rightProng = new THREE.Mesh(prongGeometry, tongueMaterial)
    rightProng.position.set(TONGUE_WIDTH * 0.5, 0, TONGUE_LENGTH / 2 + TONGUE_WIDTH * 0.2)
    tongueMesh.add(rightProng)

    // Eyes (on sides of head)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.4, EYE_SIZE * 0.6, EYE_SIZE * 0.6)

    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_WIDTH / 2 - 0.01, HEAD_HEIGHT / 4, HEAD_DEPTH / 4)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_WIDTH / 2 + 0.01, HEAD_HEIGHT / 4, HEAD_DEPTH / 4)
    headGroup.add(rightEye)

    // Position head at front of body
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_DEPTH / 3
    group.add(headGroup)
    this.head = headGroup

    // Tail group
    const tailGroup = new THREE.Group()

    // Main tail segment
    const tailGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_HEIGHT, TAIL_DEPTH)
    const tailMesh = new THREE.Mesh(tailGeometry, bodyMaterial)
    tailMesh.castShadow = true
    tailMesh.receiveShadow = true
    tailGroup.add(tailMesh)

    // Tail tip (tapered)
    const tailTipGeometry = new THREE.BoxGeometry(TAIL_TIP_WIDTH, TAIL_TIP_HEIGHT, TAIL_TIP_DEPTH)
    const tailTip = new THREE.Mesh(tailTipGeometry, bodyMaterial)
    tailTip.position.z = -TAIL_DEPTH / 2 - TAIL_TIP_DEPTH / 2
    tailTip.castShadow = true
    tailGroup.add(tailTip)

    // Dark pattern bands on tail
    const bandGeometry = new THREE.BoxGeometry(TAIL_WIDTH * 1.05, TAIL_HEIGHT * 0.5, TAIL_DEPTH * 0.1)
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(bandGeometry, patternMaterial)
      band.position.set(0, TAIL_HEIGHT * 0.1, TAIL_DEPTH * 0.25 - i * TAIL_DEPTH * 0.3)
      tailGroup.add(band)
    }

    // Position tail at back of body
    tailGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    tailGroup.position.z = -BODY_DEPTH / 2 - TAIL_DEPTH / 3
    group.add(tailGroup)
    this.tail = tailGroup

    // Legs (4 sturdy legs)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const legPositions = [
      { x: BODY_WIDTH / 2 + LEG_WIDTH / 4, z: BODY_DEPTH / 3, rotZ: -0.2 }, // Front right
      { x: -BODY_WIDTH / 2 - LEG_WIDTH / 4, z: BODY_DEPTH / 3, rotZ: 0.2 }, // Front left
      { x: BODY_WIDTH / 2 + LEG_WIDTH / 4, z: -BODY_DEPTH / 3, rotZ: -0.2 }, // Back right
      { x: -BODY_WIDTH / 2 - LEG_WIDTH / 4, z: -BODY_DEPTH / 3, rotZ: 0.2 }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.rotation.z = pos.rotZ // Slight splay
      leg.castShadow = true
      leg.receiveShadow = true
      group.add(leg)
      this.legs.push(leg)
    }

    // Claws on feet
    const clawGeometry = new THREE.BoxGeometry(LEG_WIDTH * 0.2, LEG_HEIGHT * 0.15, LEG_DEPTH * 0.4)
    for (let i = 0; i < this.legs.length; i++) {
      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(clawGeometry, darkMaterial)
        claw.position.set(c * LEG_WIDTH * 0.3, -LEG_HEIGHT / 2 + LEG_HEIGHT * 0.05, LEG_DEPTH * 0.3)
        this.legs[i].add(claw)
      }
    }

    // Mark texture as applied if it was available during mesh creation
    if (KomodoDragonEntity.texture) {
      this.textureApplied = true
    }

    return group
  }

  private createMaterial(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color })
    if (KomodoDragonEntity.texture) {
      material.map = KomodoDragonEntity.texture
    }
    return material
  }

  private updateMaterials(group: THREE.Object3D): void {
    if (!KomodoDragonEntity.texture) return

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        const color = child.material.color.getHex()
        // Apply texture to body parts (red colors), not belly/eyes/tongue
        if (color === KOMODO_RED || color === KOMODO_DARK_RED) {
          child.material.map = KomodoDragonEntity.texture
          child.material.needsUpdate = true
        }
      }
    })
  }

  update(deltaTime: number): void {
    // Apply texture if it's loaded but not yet applied
    if (KomodoDragonEntity.texture && !this.textureApplied) {
      const mesh = this.getMesh()
      if (mesh) {
        this.updateMaterials(mesh)
        this.textureApplied = true
      }
    }

    super.update(deltaTime)
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.isWalking) {
      // Leg animation - lizard waddle
      this.legAnimPhase += deltaTime * 7
      const legSwing = Math.sin(this.legAnimPhase) * 0.35

      if (this.legs.length >= 4) {
        // Diagonal pairs move together
        this.legs[0].rotation.x = legSwing // Front right
        this.legs[3].rotation.x = legSwing // Back left
        this.legs[1].rotation.x = -legSwing // Front left
        this.legs[2].rotation.x = -legSwing // Back right
      }

      // Body sway while walking
      if (this.head) {
        this.head.position.x = Math.sin(this.legAnimPhase) * 0.02
        this.head.rotation.y = Math.sin(this.legAnimPhase) * 0.05
      }

      // Tail sway while moving
      this.tailSwayPhase += deltaTime * 5
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailSwayPhase) * 0.25
      }

      // Hide tongue when moving
      if (this.tongue) this.tongue.visible = false
      this.tongueExtended = false
      this.tonguePhase = 0
    } else {
      // Reset legs when standing
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9
      }

      // Reset head position
      if (this.head) {
        this.head.position.x *= 0.9
        this.head.rotation.y *= 0.9
      }

      // Gentle tail sway while idle
      this.tailSwayPhase += deltaTime * 2
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailSwayPhase) * 0.12
      }

      // Tongue flick animation (when idle)
      this.tonguePhase += deltaTime

      if (!this.tongueExtended && this.tonguePhase >= TONGUE_FLICK_INTERVAL) {
        this.tongueExtended = true
        this.tonguePhase = 0
        if (this.tongue) this.tongue.visible = true
      }

      if (this.tongueExtended && this.tonguePhase >= TONGUE_FLICK_DURATION) {
        this.tongueExtended = false
        this.tonguePhase = 0
        if (this.tongue) this.tongue.visible = false
      }
    }
  }

  dispose(): void {
    this.legs = []
    this.head = null
    this.tail = null
    this.tongue = null
    super.dispose()
  }
}
