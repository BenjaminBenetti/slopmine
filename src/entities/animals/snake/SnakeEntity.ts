import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { RawSnakeItem } from '../../../items/food/raw_snake/RawSnakeItem.ts'

// Snake colors (desert rattlesnake inspired)
const SNAKE_BASE = 0xc4a35a // Sandy tan
const SNAKE_PATTERN = 0x8b6914 // Darker brown pattern
const SNAKE_BELLY = 0xf5e6c8 // Light cream
const SNAKE_DARK = 0x1a1a1a // Eyes
const SNAKE_TONGUE = 0xff4444 // Red tongue

// Snake dimensions (in world units)
const SCALE = 0.0625 // 1/16 block per pixel

const HEAD_WIDTH = 2.5 * SCALE
const HEAD_HEIGHT = 1.5 * SCALE
const HEAD_DEPTH = 3 * SCALE

const SEGMENT_WIDTH = 2.5 * SCALE
const SEGMENT_HEIGHT = 1.5 * SCALE
const SEGMENT_DEPTH = 3.5 * SCALE

const TAIL_WIDTH = 1.5 * SCALE
const TAIL_HEIGHT = 1 * SCALE
const TAIL_DEPTH = 3 * SCALE

const EYE_SIZE = 0.6 * SCALE
const TONGUE_WIDTH = 0.4 * SCALE
const TONGUE_LENGTH = 2 * SCALE

// Animation constants
const SLITHER_FREQUENCY = 6
const SLITHER_AMPLITUDE = 0.08
const TONGUE_FLICK_INTERVAL = 3.0
const TONGUE_FLICK_DURATION = 0.15

/**
 * A snake entity that slithers through the desert.
 * Uses segmented body with wave-based animation instead of walking.
 */
export class SnakeEntity extends PeacefulEntity {
  readonly type = 'snake'

  // Animation state
  private slitherPhase = 0
  private tonguePhase = 0
  private tongueExtended = false

  // Mesh references
  private head: THREE.Object3D | null = null
  private segments: THREE.Mesh[] = []
  private tongue: THREE.Mesh | null = null

  constructor(config: IPeacefulEntityConfig) {
    super('snake', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.3, 0.2, 0.8),
      walkSpeed: 2.5,
      fleeSpeed: 5.0,
      maxHealth: 4,
      wanderMinDistance: 3.0,
      wanderMaxDistance: 6.0,
      wanderMinInterval: 4.0,
      wanderMaxInterval: 10.0,
      jumpVelocity: 0, // Snakes don't jump
      drops: [
        { createItem: () => new RawSnakeItem(), minCount: 1, maxCount: 2 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const baseMaterial = new THREE.MeshLambertMaterial({ color: SNAKE_BASE })
    const patternMaterial = new THREE.MeshLambertMaterial({ color: SNAKE_PATTERN })
    const bellyMaterial = new THREE.MeshLambertMaterial({ color: SNAKE_BELLY })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: SNAKE_DARK })
    const tongueMaterial = new THREE.MeshLambertMaterial({ color: SNAKE_TONGUE })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(baseMaterial)
    this.registerMaterialForLighting(patternMaterial)
    this.registerMaterialForLighting(bellyMaterial)
    this.registerMaterialForLighting(darkMaterial)
    this.registerMaterialForLighting(tongueMaterial)

    // Head group
    const headGroup = new THREE.Group()

    // Head body
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, baseMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Eyes (on the sides of the head)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.3, EYE_SIZE * 0.8, EYE_SIZE * 0.8)

    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_WIDTH / 2 - 0.01, HEAD_HEIGHT / 4, HEAD_DEPTH / 4)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_WIDTH / 2 + 0.01, HEAD_HEIGHT / 4, HEAD_DEPTH / 4)
    headGroup.add(rightEye)

    // Forked tongue (initially hidden)
    const tongueGeometry = new THREE.BoxGeometry(TONGUE_WIDTH, TONGUE_WIDTH * 0.3, TONGUE_LENGTH)
    const tongueMesh = new THREE.Mesh(tongueGeometry, tongueMaterial)
    tongueMesh.position.set(0, -HEAD_HEIGHT / 4, HEAD_DEPTH / 2 + TONGUE_LENGTH / 2)
    tongueMesh.visible = false
    headGroup.add(tongueMesh)
    this.tongue = tongueMesh

    // Fork prongs for the tongue
    const prongGeometry = new THREE.BoxGeometry(TONGUE_WIDTH * 0.4, TONGUE_WIDTH * 0.2, TONGUE_WIDTH * 0.8)

    const leftProng = new THREE.Mesh(prongGeometry, tongueMaterial)
    leftProng.position.set(-TONGUE_WIDTH * 0.4, 0, TONGUE_LENGTH / 2 + TONGUE_WIDTH * 0.3)
    tongueMesh.add(leftProng)

    const rightProng = new THREE.Mesh(prongGeometry, tongueMaterial)
    rightProng.position.set(TONGUE_WIDTH * 0.4, 0, TONGUE_LENGTH / 2 + TONGUE_WIDTH * 0.3)
    tongueMesh.add(rightProng)

    headGroup.position.y = HEAD_HEIGHT / 2
    headGroup.position.z = SEGMENT_DEPTH * 2 // Position at front
    group.add(headGroup)
    this.head = headGroup

    // Body segments (4 segments with alternating colors for pattern)
    this.segments = []
    const segmentOffsets = [
      { width: SEGMENT_WIDTH, depth: SEGMENT_DEPTH, z: SEGMENT_DEPTH * 1.2, material: baseMaterial },
      { width: SEGMENT_WIDTH, depth: SEGMENT_DEPTH, z: SEGMENT_DEPTH * 0.2, material: patternMaterial },
      { width: SEGMENT_WIDTH * 0.9, depth: SEGMENT_DEPTH, z: -SEGMENT_DEPTH * 0.8, material: baseMaterial },
      { width: SEGMENT_WIDTH * 0.75, depth: SEGMENT_DEPTH * 0.9, z: -SEGMENT_DEPTH * 1.7, material: patternMaterial },
    ]

    for (const offset of segmentOffsets) {
      const segGeometry = new THREE.BoxGeometry(offset.width, SEGMENT_HEIGHT, offset.depth)
      const segment = new THREE.Mesh(segGeometry, offset.material)
      segment.position.set(0, SEGMENT_HEIGHT / 2, offset.z)
      segment.castShadow = true
      segment.receiveShadow = true
      group.add(segment)
      this.segments.push(segment)
    }

    // Tail (tapered end)
    const tailGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_HEIGHT, TAIL_DEPTH)
    const tail = new THREE.Mesh(tailGeometry, baseMaterial)
    tail.position.set(0, TAIL_HEIGHT / 2, -SEGMENT_DEPTH * 2.5)
    tail.castShadow = true
    group.add(tail)
    this.segments.push(tail)

    return group
  }

  protected updateAnimations(deltaTime: number): void {
    // Slither animation
    if (this.isWalking) {
      this.slitherPhase += deltaTime * SLITHER_FREQUENCY

      // Apply wave motion to each segment
      for (let i = 0; i < this.segments.length; i++) {
        const phaseOffset = i * (Math.PI / 2.5)
        const sideOffset = Math.sin(this.slitherPhase + phaseOffset) * SLITHER_AMPLITUDE
        const rotationAngle = Math.sin(this.slitherPhase + phaseOffset) * 0.25

        this.segments[i].position.x = sideOffset
        this.segments[i].rotation.y = rotationAngle
      }

      // Head follows the wave slightly
      if (this.head) {
        const headOffset = Math.sin(this.slitherPhase) * SLITHER_AMPLITUDE * 0.5
        this.head.position.x = headOffset
        this.head.rotation.y = Math.sin(this.slitherPhase) * 0.15
      }

      // Hide tongue when moving
      if (this.tongue) this.tongue.visible = false
      this.tongueExtended = false
      this.tonguePhase = 0
    } else {
      // Return to neutral when stopped
      for (const segment of this.segments) {
        segment.position.x *= 0.9
        segment.rotation.y *= 0.9
      }
      if (this.head) {
        this.head.position.x *= 0.9
        this.head.rotation.y *= 0.9
      }

      // Tongue flicker animation (when idle)
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
    this.head = null
    this.segments = []
    this.tongue = null
    super.dispose()
  }
}
