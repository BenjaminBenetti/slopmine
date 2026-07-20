import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { VenisonItem } from '../../../items/food/venison/VenisonItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Deer colors
const DEER_TAN = 0xb5905e
const DEER_BROWN = 0x8a6a42
const DEER_CREAM = 0xe8dcc4 // Belly, tail underside, snout
const DEER_DARK = 0x2a2119 // Eyes, nose, hooves
const ANTLER_COLOR = 0x9c8563

// Deer dimensions (in world units) - noticeably larger than fox
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 9 * SCALE
const BODY_HEIGHT = 8 * SCALE
const BODY_DEPTH = 16 * SCALE
const NECK_WIDTH = 4 * SCALE
const NECK_HEIGHT = 7 * SCALE
const NECK_DEPTH = 4 * SCALE
const HEAD_WIDTH = 4.5 * SCALE
const HEAD_HEIGHT = 4.5 * SCALE
const HEAD_DEPTH = 5 * SCALE
const SNOUT_WIDTH = 2.5 * SCALE
const SNOUT_HEIGHT = 2 * SCALE
const SNOUT_DEPTH = 2.5 * SCALE
const EAR_WIDTH = 2 * SCALE
const EAR_HEIGHT = 2.5 * SCALE
const EAR_DEPTH = 0.8 * SCALE
const LEG_WIDTH = 1.6 * SCALE // Slender legs
const LEG_HEIGHT = 9 * SCALE // Long legs
const LEG_DEPTH = 1.6 * SCALE
const HOOF_HEIGHT = 1.2 * SCALE
const TAIL_WIDTH = 2.5 * SCALE
const TAIL_HEIGHT = 3 * SCALE
const TAIL_DEPTH = 1.5 * SCALE
const EYE_SIZE = 1.1 * SCALE
const ANTLER_BEAM_SIZE = 0.9 * SCALE
const ANTLER_BEAM_HEIGHT = 4 * SCALE
const ANTLER_TINE_HEIGHT = 2.2 * SCALE

// Skittish behavior: bolt when the player gets this close
const PLAYER_SCARE_DISTANCE = 6.0 // blocks
const SCARE_FLEE_REFRESH = 0.6 // seconds of flee re-applied while player is close
const ANTLER_CHANCE = 0.5 // Half of deer are bucks with small antlers

/**
 * A deer entity for the pine forest - a large, skittish grazer.
 * Bolts away as soon as the player comes near (~6 blocks). Some deer
 * (random cosmetic flag) carry a small set of antlers.
 */
export class DeerEntity extends PeacefulEntity {
  readonly type = 'deer'

  /** Cosmetic: some deer are bucks with antlers */
  private readonly hasAntlers: boolean

  // Skittish behavior: player tracking (injected by EntityManager via duck typing)
  private playerPositionRef: THREE.Vector3 | null = null
  private readonly scareDirection = new THREE.Vector3()

  // Animation state
  private legAnimPhase = 0
  private tailAnimPhase = 0
  private headBobPhase = 0

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private tail: THREE.Object3D | null = null

  constructor(config: IPeacefulEntityConfig) {
    super('deer', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 1.4, 1.3),
      walkSpeed: 2.5,
      fleeSpeed: 7.5, // Very fast when bolting (fox is 6.0)
      fleeDuration: 4.0,
      wanderMinDistance: 5.0,
      wanderMaxDistance: 12.0,
      maxHealth: 12,
      drops: [
        { createItem: () => new VenisonItem(), minCount: 1, maxCount: 2 },
      ],
    })

    this.hasAntlers = Math.random() < ANTLER_CHANCE
  }

  /**
   * Called by EntityManager on spawn (duck-typed, same hook aggressive
   * entities use). The deer uses it to detect and flee nearby players.
   */
  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  update(deltaTime: number): void {
    // Skittish check: bolt whenever the player is too close.
    // Reuses PeacefulEntity's flee state, which overrides wandering.
    if (!this.isDying && this.playerPositionRef) {
      const distSq = this.position.distanceToSquared(this.playerPositionRef)
      if (distSq <= PLAYER_SCARE_DISTANCE * PLAYER_SCARE_DISTANCE) {
        this.scareDirection.copy(this.position).sub(this.playerPositionRef)
        this.scareDirection.y = 0
        if (this.scareDirection.lengthSq() > 0.0001) {
          this.scareDirection.normalize()
        } else {
          const angle = Math.random() * Math.PI * 2
          this.scareDirection.set(Math.cos(angle), 0, Math.sin(angle))
        }
        this.fleeDirection.copy(this.scareDirection)
        // Keep the flee timer topped up while the player stays close
        this.fleeTimer = Math.max(this.fleeTimer, SCARE_FLEE_REFRESH)
      }
    }

    super.update(deltaTime)
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const tanMaterial = new THREE.MeshLambertMaterial({ color: DEER_TAN })
    const brownMaterial = new THREE.MeshLambertMaterial({ color: DEER_BROWN })
    const creamMaterial = new THREE.MeshLambertMaterial({ color: DEER_CREAM })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: DEER_DARK })
    const antlerMaterial = new THREE.MeshLambertMaterial({ color: ANTLER_COLOR })

    this.registerMaterialForLighting(tanMaterial)
    this.registerMaterialForLighting(brownMaterial)
    this.registerMaterialForLighting(creamMaterial)
    this.registerMaterialForLighting(darkMaterial)
    this.registerMaterialForLighting(antlerMaterial)

    // Body (tan)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, tanMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Cream belly
    const bellyGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.8, BODY_HEIGHT * 0.3, BODY_DEPTH * 0.7)
    const belly = new THREE.Mesh(bellyGeometry, creamMaterial)
    belly.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.15, 0)
    group.add(belly)

    // Brown saddle across the back
    const saddleGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.9, BODY_HEIGHT * 0.25, BODY_DEPTH * 0.6)
    const saddle = new THREE.Mesh(saddleGeometry, brownMaterial)
    saddle.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.95, -BODY_DEPTH * 0.05)
    saddle.castShadow = true
    group.add(saddle)

    // Head group (neck + head + ears + antlers), pivots at neck base
    const headGroup = new THREE.Group()

    // Neck (tan, angled forward-up)
    const neckGeometry = new THREE.BoxGeometry(NECK_WIDTH, NECK_HEIGHT, NECK_DEPTH)
    const neck = new THREE.Mesh(neckGeometry, tanMaterial)
    neck.position.set(0, NECK_HEIGHT * 0.35, NECK_DEPTH * 0.2)
    neck.rotation.x = 0.35
    neck.castShadow = true
    headGroup.add(neck)

    // Head (tan)
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, tanMaterial)
    headMesh.position.set(0, NECK_HEIGHT * 0.8, NECK_DEPTH * 0.8)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Snout (cream)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, creamMaterial)
    snout.position.set(0, -HEAD_HEIGHT / 6, HEAD_DEPTH / 2 + SNOUT_DEPTH / 2)
    snout.castShadow = true
    headMesh.add(snout)

    // Nose (dark, on tip of snout)
    const noseGeometry = new THREE.BoxGeometry(SNOUT_WIDTH * 0.5, SNOUT_HEIGHT * 0.5, SNOUT_DEPTH * 0.2)
    const nose = new THREE.Mesh(noseGeometry, darkMaterial)
    nose.position.set(0, SNOUT_HEIGHT * 0.1, SNOUT_DEPTH / 2 + SNOUT_DEPTH * 0.1)
    snout.add(nose)

    // Eyes (dark, on head sides)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.3, EYE_SIZE, EYE_SIZE)
    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_WIDTH / 2 - 0.01, HEAD_HEIGHT * 0.1, HEAD_DEPTH * 0.15)
    headMesh.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_WIDTH / 2 + 0.01, HEAD_HEIGHT * 0.1, HEAD_DEPTH * 0.15)
    headMesh.add(rightEye)

    // Ears (tan, wide and alert)
    const earGeometry = new THREE.BoxGeometry(EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH)

    const leftEar = new THREE.Mesh(earGeometry, tanMaterial)
    leftEar.position.set(-HEAD_WIDTH / 2, HEAD_HEIGHT / 2 + EAR_HEIGHT / 3, -HEAD_DEPTH * 0.15)
    leftEar.rotation.z = 0.4
    leftEar.castShadow = true
    headMesh.add(leftEar)

    const rightEar = new THREE.Mesh(earGeometry, tanMaterial)
    rightEar.position.set(HEAD_WIDTH / 2, HEAD_HEIGHT / 2 + EAR_HEIGHT / 3, -HEAD_DEPTH * 0.15)
    rightEar.rotation.z = -0.4
    rightEar.castShadow = true
    headMesh.add(rightEar)

    // Small antlers on bucks (cosmetic variation)
    if (this.hasAntlers) {
      const beamGeometry = new THREE.BoxGeometry(ANTLER_BEAM_SIZE, ANTLER_BEAM_HEIGHT, ANTLER_BEAM_SIZE)
      const tineGeometry = new THREE.BoxGeometry(ANTLER_BEAM_SIZE * 0.8, ANTLER_TINE_HEIGHT, ANTLER_BEAM_SIZE * 0.8)

      for (const side of [-1, 1]) {
        // Main beam angled outward
        const beam = new THREE.Mesh(beamGeometry, antlerMaterial)
        beam.position.set(
          side * HEAD_WIDTH * 0.28,
          HEAD_HEIGHT / 2 + ANTLER_BEAM_HEIGHT / 2 - ANTLER_BEAM_SIZE / 2,
          -HEAD_DEPTH * 0.1
        )
        beam.rotation.z = -side * 0.35
        beam.castShadow = true
        headMesh.add(beam)

        // Forward tine partway up the beam
        const tine = new THREE.Mesh(tineGeometry, antlerMaterial)
        tine.position.set(0, ANTLER_BEAM_HEIGHT * 0.15, ANTLER_TINE_HEIGHT * 0.3)
        tine.rotation.x = -0.7
        tine.castShadow = true
        beam.add(tine)
      }
    }

    // Position head group at the front of the body
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT * 0.75
    headGroup.position.z = BODY_DEPTH / 2 - NECK_DEPTH * 0.25
    group.add(headGroup)
    this.head = headGroup

    // Tail (short, brown with cream underside, angled up)
    const tailGroup = new THREE.Group()

    const tailGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_HEIGHT, TAIL_DEPTH)
    const tailMesh = new THREE.Mesh(tailGeometry, brownMaterial)
    tailMesh.castShadow = true
    tailGroup.add(tailMesh)

    const tailUnderGeometry = new THREE.BoxGeometry(TAIL_WIDTH * 0.7, TAIL_HEIGHT * 0.7, TAIL_DEPTH * 0.4)
    const tailUnder = new THREE.Mesh(tailUnderGeometry, creamMaterial)
    tailUnder.position.z = -TAIL_DEPTH * 0.4
    tailGroup.add(tailUnder)

    tailGroup.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.85, -BODY_DEPTH / 2 - TAIL_DEPTH * 0.2)
    tailGroup.rotation.x = 0.5
    group.add(tailGroup)
    this.tail = tailGroup

    // Legs (4 slender legs with dark hooves)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const hoofGeometry = new THREE.BoxGeometry(LEG_WIDTH * 1.1, HOOF_HEIGHT, LEG_DEPTH * 1.1)
    const legPositions = [
      { x: BODY_WIDTH / 3, z: BODY_DEPTH / 2 - LEG_DEPTH }, // Front right
      { x: -BODY_WIDTH / 3, z: BODY_DEPTH / 2 - LEG_DEPTH }, // Front left
      { x: BODY_WIDTH / 3, z: -BODY_DEPTH / 2 + LEG_DEPTH }, // Back right
      { x: -BODY_WIDTH / 3, z: -BODY_DEPTH / 2 + LEG_DEPTH }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, tanMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.castShadow = true
      leg.receiveShadow = true

      const hoof = new THREE.Mesh(hoofGeometry, darkMaterial)
      hoof.position.y = -LEG_HEIGHT / 2 + HOOF_HEIGHT / 2
      hoof.castShadow = true
      leg.add(hoof)

      group.add(leg)
      this.legs.push(leg)
    }

    // Merge rigid same-shadow boxes and freeze static nodes.
    // Legs, head and tail animate.
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [...this.legs, this.head, this.tail],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.isWalking) {
      // Long-legged stride; the flee gallop reads as a faster swing
      this.legAnimPhase += deltaTime * (this.fleeTimer > 0 ? 14 : 8)
      const legSwing = Math.sin(this.legAnimPhase) * 0.55

      if (this.legs.length >= 4) {
        this.legs[0].rotation.x = legSwing // Front right
        this.legs[1].rotation.x = -legSwing // Front left
        this.legs[2].rotation.x = -legSwing // Back right
        this.legs[3].rotation.x = legSwing // Back left
      }

      // Tail raised and flicking while running (white-tail alarm)
      this.tailAnimPhase += deltaTime * 8
      if (this.tail) {
        this.tail.rotation.x = 0.9
        this.tail.rotation.y = Math.sin(this.tailAnimPhase) * 0.2
      }

      // Head lowered slightly forward while running
      if (this.head) {
        this.head.rotation.x = 0.1
      }
    } else {
      // Smoothly return legs to neutral
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9
      }

      // Tail settles back down with a gentle sway
      this.tailAnimPhase += deltaTime * 2
      if (this.tail) {
        this.tail.rotation.x += (0.5 - this.tail.rotation.x) * 0.1
        this.tail.rotation.y = Math.sin(this.tailAnimPhase) * 0.08
      }

      // Idle grazing head bob - dips low, then lifts to look around
      this.headBobPhase += deltaTime * 0.8
      if (this.head) {
        const graze = Math.max(0, Math.sin(this.headBobPhase)) * 0.55
        this.head.rotation.x = graze
      }
    }
  }

  dispose(): void {
    this.playerPositionRef = null
    this.legs = []
    this.head = null
    this.tail = null
    super.dispose()
  }
}
