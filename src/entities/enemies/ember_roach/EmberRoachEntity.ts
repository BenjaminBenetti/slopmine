import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { PillarDetector, type PillarClingPoint } from './PillarDetector.ts'
import { EmberRoachWingItem } from '../../../items/materials/ember_roach_wing/EmberRoachWingItem.ts'
import { CorruptedEssenceItem } from '../../../items/materials/corrupted_essence/CorruptedEssenceItem.ts'

/**
 * State machine states for Ember Roach behavior.
 */
enum EmberRoachState {
  /** Clinging to a pillar, waiting to detect player */
  IDLE_ON_PILLAR = 'idle_on_pillar',
  /** Diving at the player in an attack arc */
  SWOOPING_ATTACK = 'swooping_attack',
  /** Flying toward a new pillar to cling to */
  FLYING_TO_PILLAR = 'flying_to_pillar',
}

// Combat stats
const MAX_HEALTH = 16 // 8 hearts
const DETECTION_RANGE = 36 // blocks (doubled to reach from pillars)
const ATTACK_DAMAGE = 5 // 2.5 hearts
const ATTACK_KNOCKBACK_HORIZONTAL = 6.0
const ATTACK_KNOCKBACK_VERTICAL = 4.0

// Flight speeds (blocks/sec)
const FLIGHT_SPEED = 8.0

// Timing constants
const MIN_CLING_DURATION = 3.0 // seconds
const MAX_CLING_DURATION = 8.0 // seconds
const SWOOP_DURATION = 1.5 // seconds for full swoop arc (slower so player can react)
const ATTACK_COOLDOWN = 4.0 // seconds after attack before can attack again

// Damage constants
const DEFAULT_BASE_DAMAGE = 2 // Fist damage
const KNOCKBACK_HORIZONTAL = 6.0
const KNOCKBACK_VERTICAL = 5.0
const KNOCKBACK_STUN_TIME = 2.0 // 2 seconds stun when hit

// Death animation constants
const DEATH_FALL_DURATION = 0.5
const DEATH_LINGER_DURATION = 1.0
const DEATH_GRAVITY = -20.0 // blocks/sec^2

// Ember Roach colors
const CARAPACE_COLOR = 0x2a1810 // Dark brown-red
const LEG_COLOR = 0x1a0808 // Near-black
const WING_COLOR = 0x3a2018 // Semi-transparent brown
const EYE_RED = 0xff2200 // Glowing red

// Pixel scale (similar to skeleton)
const SCALE = 0.05

// Body dimensions
const BODY_LENGTH = 24 * SCALE // 1.2 blocks long
const BODY_WIDTH = 16 * SCALE // 0.8 blocks wide
const BODY_HEIGHT = 8 * SCALE // 0.4 blocks tall

const HEAD_SIZE = 6 * SCALE
const THORAX_LENGTH = 8 * SCALE
const ABDOMEN_LENGTH = 12 * SCALE
const ABDOMEN_WIDTH = 10 * SCALE

const WING_LENGTH = 28 * SCALE  // Much larger wings
const WING_WIDTH = 16 * SCALE   // Wider wings
const WING_THICKNESS = 0.3 * SCALE

const LEG_SEGMENT_LENGTH = 6 * SCALE
const LEG_SEGMENT_WIDTH = 1.5 * SCALE

const ANTENNA_LENGTH = 8 * SCALE
const ANTENNA_SEGMENTS = 4

// Animation constants
const WING_FLUTTER_SPEED = 30.0 // radians/sec (wing flap speed)
const WING_FLUTTER_AMPLITUDE = 0.8 // radians (bigger flap range)
const LEG_IDLE_SPEED = 2.0
const LEG_FLIGHT_SPEED = 8.0

/**
 * Configuration for EmberRoachEntity.
 */
export interface IEmberRoachEntityConfig extends Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'> {
  /** Initial pillar detector (optional, usually set after spawn) */
  pillarDetector?: PillarDetector
}

/**
 * A flying cockroach-like entity that inhabits the Hell biome.
 * Clings to pillars, then swoops down to attack players before retreating.
 *
 * Stats:
 * - 16 HP (8 hearts)
 * - 5 damage (2.5 hearts)
 * - 36 block detection range
 * - Fast swoop attack
 *
 * Drops:
 * - 1-2 Ember Roach Wings
 * - 0-1 Corrupted Essence
 */
export class EmberRoachEntity extends Entity {
  readonly type = 'ember_roach'

  // State machine
  private currentState: EmberRoachState = EmberRoachState.FLYING_TO_PILLAR
  private stateTimer = 0

  // Combat
  private health = MAX_HEALTH
  private attackCooldown = 0
  private knockbackTimer = 0
  private readonly knockbackVelocity = new THREE.Vector3()

  // Death
  private _isDying = false
  private deathTimer = 0
  private deathVelocityY = 0
  private dropsCollected = false

  // Player tracking
  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null

  // Pillar detection
  private pillarDetector: PillarDetector | null = null
  private currentClingPoint: PillarClingPoint | null = null
  private targetClingPoint: PillarClingPoint | null = null

  // World query for ground collision during knockback
  private solidQueryFn: ((x: number, y: number, z: number) => boolean) | null = null
  private isGrounded = false

  // Swoop attack
  private swoopStartPos = new THREE.Vector3()
  private swoopTargetPos = new THREE.Vector3()
  private swoopControlPoint = new THREE.Vector3() // Bezier control point
  private swoopProgress = 0
  private hasDealtDamage = false

  // Cling state
  private clingNormal = new THREE.Vector3()
  private clingDuration = 0

  // Animation state
  private wingPhase = 0
  private legPhase = 0
  private isFlying = true

  // Mesh parts
  private leftWing: THREE.Mesh | null = null
  private rightWing: THREE.Mesh | null = null
  private legs: THREE.Group[] = []
  private eyeMaterial: THREE.MeshLambertMaterial | null = null

  // Reusable vectors
  private readonly tempVec = new THREE.Vector3()
  private readonly knockbackDir = new THREE.Vector3()

  constructor(config: IEmberRoachEntityConfig) {
    super('ember_roach', {
      ...config,
      hasPhysics: true, // Need physics body for hitbox detection
      hitboxSize: new THREE.Vector3(1.2, 0.8, 1.5), // Larger hitbox for easier hitting
    })

    // Disable physics simulation - we control movement manually
    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = true
    }

    if (config.pillarDetector) {
      this.pillarDetector = config.pillarDetector
    }

    // Randomize initial animation phases
    this.wingPhase = Math.random() * Math.PI * 2
    this.legPhase = Math.random() * Math.PI * 2
  }

  /**
   * Set the pillar detector for finding cling points.
   * Should be called by the spawner after entity creation.
   */
  setPillarDetector(detector: PillarDetector): void {
    this.pillarDetector = detector
  }

  /**
   * Set world query functions for pillar detection.
   * Called by EntityManager after entity is spawned.
   */
  setWorldQueryFns(
    blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    // Store solid query for ground collision during knockback
    this.solidQueryFn = solidQuery

    // Create a physics world adapter for the pillar detector
    const physicsWorldAdapter = {
      getBlockCollisions: () => [], // Not needed for pillar detection
      isSolidBlock: solidQuery,
    }
    this.pillarDetector = new PillarDetector(physicsWorldAdapter, blockQuery)
  }

  /**
   * Set the player position reference for tracking.
   */
  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  /**
   * Set the callback for when the entity attacks the player.
   */
  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    this.playerDamageCallback = callback
  }

  get isDying(): boolean {
    return this._isDying
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const carapaceMaterial = new THREE.MeshLambertMaterial({ color: CARAPACE_COLOR })
    const legMaterial = new THREE.MeshLambertMaterial({ color: LEG_COLOR })
    const wingMaterial = new THREE.MeshLambertMaterial({
      color: WING_COLOR,
      transparent: true,
      opacity: 0.35, // Very see-through insect wings
      side: THREE.DoubleSide,
    })
    this.eyeMaterial = new THREE.MeshLambertMaterial({
      color: EYE_RED,
      emissive: new THREE.Color(EYE_RED),
      emissiveIntensity: 0.8,
    })

    // Register materials for lighting (but NOT eye material - it glows)
    this.registerMaterialForLighting(carapaceMaterial)
    this.registerMaterialForLighting(legMaterial)
    this.registerMaterialForLighting(wingMaterial)

    // Body offset to center the mesh
    const bodyGroup = new THREE.Group()

    // ===== HEAD =====
    const headGeometry = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE * 0.8, HEAD_SIZE)
    const head = new THREE.Mesh(headGeometry, carapaceMaterial)
    head.position.set(0, 0, BODY_LENGTH / 2 - HEAD_SIZE / 2)
    head.castShadow = true
    bodyGroup.add(head)

    // Eyes (glowing red)
    const eyeGeometry = new THREE.BoxGeometry(HEAD_SIZE * 0.25, HEAD_SIZE * 0.25, HEAD_SIZE * 0.1)
    const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial)
    leftEye.position.set(-HEAD_SIZE * 0.25, HEAD_SIZE * 0.15, BODY_LENGTH / 2 + 0.01)
    bodyGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial)
    rightEye.position.set(HEAD_SIZE * 0.25, HEAD_SIZE * 0.15, BODY_LENGTH / 2 + 0.01)
    bodyGroup.add(rightEye)

    // Antennae
    const antennaGeometry = new THREE.BoxGeometry(
      LEG_SEGMENT_WIDTH * 0.5,
      LEG_SEGMENT_WIDTH * 0.5,
      ANTENNA_LENGTH / ANTENNA_SEGMENTS
    )
    for (const xMult of [-1, 1]) {
      for (let i = 0; i < ANTENNA_SEGMENTS; i++) {
        const segment = new THREE.Mesh(antennaGeometry, legMaterial)
        const angle = (i * 0.2 * xMult) // Curve outward
        const z = BODY_LENGTH / 2 + (i + 0.5) * (ANTENNA_LENGTH / ANTENNA_SEGMENTS) * Math.cos(angle)
        const x = xMult * (HEAD_SIZE * 0.3 + i * LEG_SEGMENT_WIDTH * 0.3)
        const y = HEAD_SIZE * 0.3 + i * LEG_SEGMENT_WIDTH * 0.2
        segment.position.set(x, y, z)
        segment.rotation.x = -0.1 * (i + 1)
        bodyGroup.add(segment)
      }
    }

    // ===== THORAX =====
    const thoraxGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.8, BODY_HEIGHT, THORAX_LENGTH)
    const thorax = new THREE.Mesh(thoraxGeometry, carapaceMaterial)
    thorax.position.set(0, 0, BODY_LENGTH / 2 - HEAD_SIZE - THORAX_LENGTH / 2)
    thorax.castShadow = true
    bodyGroup.add(thorax)

    // ===== WINGS =====
    const wingGeometry = new THREE.BoxGeometry(WING_WIDTH, WING_THICKNESS, WING_LENGTH)

    // Left wing
    this.leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
    this.leftWing.position.set(-BODY_WIDTH * 0.5, BODY_HEIGHT * 0.3, BODY_LENGTH / 2 - HEAD_SIZE - THORAX_LENGTH / 2)
    bodyGroup.add(this.leftWing)

    // Right wing
    this.rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
    this.rightWing.position.set(BODY_WIDTH * 0.5, BODY_HEIGHT * 0.3, BODY_LENGTH / 2 - HEAD_SIZE - THORAX_LENGTH / 2)
    bodyGroup.add(this.rightWing)

    // ===== ABDOMEN =====
    const abdomenGeometry = new THREE.BoxGeometry(ABDOMEN_WIDTH, BODY_HEIGHT * 0.9, ABDOMEN_LENGTH)
    const abdomen = new THREE.Mesh(abdomenGeometry, carapaceMaterial)
    abdomen.position.set(0, -BODY_HEIGHT * 0.05, -BODY_LENGTH / 2 + ABDOMEN_LENGTH / 2)
    abdomen.castShadow = true
    bodyGroup.add(abdomen)

    // Abdomen segments (darker stripes)
    const stripeGeometry = new THREE.BoxGeometry(ABDOMEN_WIDTH + 0.01, BODY_HEIGHT * 0.1, ABDOMEN_LENGTH * 0.08)
    const stripeMaterial = new THREE.MeshLambertMaterial({ color: LEG_COLOR })
    this.registerMaterialForLighting(stripeMaterial)

    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial)
      stripe.position.set(
        0,
        BODY_HEIGHT * 0.4,
        -BODY_LENGTH / 2 + ABDOMEN_LENGTH * 0.15 + i * ABDOMEN_LENGTH * 0.2
      )
      bodyGroup.add(stripe)
    }

    // ===== LEGS =====
    this.legs = []
    const legSegmentGeometry = new THREE.BoxGeometry(LEG_SEGMENT_WIDTH, LEG_SEGMENT_WIDTH, LEG_SEGMENT_LENGTH)

    // 6 legs: 3 pairs
    const legPositions = [
      { z: BODY_LENGTH / 2 - HEAD_SIZE - THORAX_LENGTH * 0.2 }, // Front
      { z: BODY_LENGTH / 2 - HEAD_SIZE - THORAX_LENGTH * 0.5 }, // Middle
      { z: BODY_LENGTH / 2 - HEAD_SIZE - THORAX_LENGTH * 0.8 }, // Back
    ]

    for (let pair = 0; pair < 3; pair++) {
      for (const xMult of [-1, 1]) {
        const legGroup = new THREE.Group()
        legGroup.position.set(
          xMult * BODY_WIDTH * 0.35,
          -BODY_HEIGHT * 0.3,
          legPositions[pair].z
        )

        // Coxa (upper leg segment)
        const coxa = new THREE.Mesh(legSegmentGeometry, legMaterial)
        coxa.position.set(xMult * LEG_SEGMENT_LENGTH * 0.5, 0, 0)
        coxa.rotation.y = xMult * 0.5
        coxa.castShadow = true
        legGroup.add(coxa)

        // Femur (middle leg segment)
        const femur = new THREE.Mesh(legSegmentGeometry, legMaterial)
        femur.position.set(xMult * LEG_SEGMENT_LENGTH * 1.2, -LEG_SEGMENT_LENGTH * 0.3, 0)
        femur.rotation.z = xMult * 0.6
        femur.castShadow = true
        legGroup.add(femur)

        // Tibia (lower leg segment)
        const tibia = new THREE.Mesh(legSegmentGeometry, legMaterial)
        tibia.position.set(xMult * LEG_SEGMENT_LENGTH * 1.5, -LEG_SEGMENT_LENGTH * 0.8, 0)
        tibia.rotation.z = xMult * 1.2
        tibia.castShadow = true
        legGroup.add(tibia)

        bodyGroup.add(legGroup)
        this.legs.push(legGroup)
      }
    }

    group.add(bodyGroup)

    return group
  }

  update(deltaTime: number): void {
    // Handle death animation
    if (this._isDying) {
      this.updateDeathAnimation(deltaTime)
      return
    }

    // Handle knockback stun
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      this.isFlying = false // Not flying while stunned

      // Apply gravity (full gravity to make it fall)
      this.knockbackVelocity.y += DEATH_GRAVITY * deltaTime

      // Check for ground collision before moving
      const nextY = this.position.y + this.knockbackVelocity.y * deltaTime
      const groundCheckY = nextY - 0.2 // Check slightly below

      if (this.solidQueryFn && this.solidQueryFn(
        Math.floor(this.position.x),
        Math.floor(groundCheckY),
        Math.floor(this.position.z)
      )) {
        // Hit the ground - stop falling
        this.knockbackVelocity.y = 0
        this.isGrounded = true
        // Snap to ground level
        this.position.y = Math.floor(groundCheckY) + 1.2
      } else {
        // Still in air - apply vertical velocity
        this.position.y = nextY
        this.isGrounded = false
      }

      // Apply horizontal knockback (with drag)
      this.position.x += this.knockbackVelocity.x * deltaTime
      this.position.z += this.knockbackVelocity.z * deltaTime
      this.knockbackVelocity.x *= 0.95 // Horizontal drag
      this.knockbackVelocity.z *= 0.95

      this.updateMeshPosition()
      this.updateAnimations(deltaTime)

      // Wiggle animation while stunned on the ground
      const mesh = this.getMesh()
      if (mesh && this.isGrounded) {
        const wiggleSpeed = 25.0
        const wiggleAmount = 0.15
        const wiggle = Math.sin(this.stateTimer * wiggleSpeed) * wiggleAmount
        mesh.rotation.z = wiggle
        mesh.rotation.x = Math.sin(this.stateTimer * wiggleSpeed * 0.7) * wiggleAmount * 0.5
      }

      // Update state timer for wiggle animation
      this.stateTimer += deltaTime
      return
    }

    // Just finished knockback - reset grounded state
    if (this.isGrounded) {
      this.isGrounded = false
    }

    // Update attack cooldown
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)

    // State machine update
    switch (this.currentState) {
      case EmberRoachState.IDLE_ON_PILLAR:
        this.updateIdleOnPillar(deltaTime)
        break
      case EmberRoachState.SWOOPING_ATTACK:
        this.updateSwoopingAttack(deltaTime)
        break
      case EmberRoachState.FLYING_TO_PILLAR:
        this.updateFlyingToPillar(deltaTime)
        break
    }

    this.updateMeshPosition()
    this.updateAnimations(deltaTime)
  }

  private updateIdleOnPillar(deltaTime: number): void {
    this.stateTimer += deltaTime
    this.isFlying = false

    // Check if player is in range and attack cooldown is ready
    if (this.playerPositionRef && this.attackCooldown <= 0) {
      const distance = this.position.distanceTo(this.playerPositionRef)
      if (distance <= DETECTION_RANGE) {
        this.startSwoopAttack()
        return
      }
    }

    // After cling duration, fly to a new pillar
    if (this.stateTimer >= this.clingDuration) {
      this.startFlyingToPillar()
    }
  }

  private updateSwoopingAttack(deltaTime: number): void {
    this.isFlying = true
    this.swoopProgress += deltaTime / SWOOP_DURATION

    // Check for collision with player (deal damage once during swoop)
    if (!this.hasDealtDamage && this.playerPositionRef) {
      const distToPlayer = this.position.distanceTo(this.playerPositionRef)
      if (distToPlayer < 1.5) { // Hit radius
        this.dealDamageToPlayer()
        this.hasDealtDamage = true
        // Immediately retreat to pillar after hitting
        this.attackCooldown = ATTACK_COOLDOWN
        this.startFlyingToPillar()
        return
      }
    }

    if (this.swoopProgress >= 1.0) {
      // Finished swoop (missed or hit), go find a pillar
      this.attackCooldown = ATTACK_COOLDOWN
      this.startFlyingToPillar()
      return
    }

    // Follow bezier curve
    const t = this.swoopProgress
    const pos = this.quadraticBezier(
      this.swoopStartPos,
      this.swoopControlPoint,
      this.swoopTargetPos,
      t
    )
    this.position.copy(pos)

    // Face movement direction
    const mesh = this.getMesh()
    if (mesh) {
      // Get tangent of bezier curve for facing direction
      const tangent = this.quadraticBezierTangent(
        this.swoopStartPos,
        this.swoopControlPoint,
        this.swoopTargetPos,
        t
      )
      if (tangent.lengthSq() > 0.001) {
        mesh.rotation.y = Math.atan2(tangent.x, tangent.z)
        // Pitch based on vertical direction
        mesh.rotation.x = -Math.atan2(tangent.y, Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z))
      }
    }
  }

  private updateFlyingToPillar(deltaTime: number): void {
    this.isFlying = true
    this.stateTimer += deltaTime

    if (!this.targetClingPoint) {
      // Try to find a pillar
      this.findNewTargetPillar()
      if (!this.targetClingPoint) {
        // No pillars found - fly upward to the air gap (Y=64-100) and search again
        // If already high enough, fly in a random direction
        if (this.position.y < 80) {
          // Fly upward into the air gap where pillars are
          this.position.y += FLIGHT_SPEED * 0.5 * deltaTime
        } else {
          // Fly in a random horizontal direction while searching
          if (this.stateTimer > 2.0) {
            // Periodically change direction and retry finding pillar
            this.stateTimer = 0
            this.pillarDetector?.invalidateCache()
          }
          // Drift slowly while searching
          const driftAngle = Math.sin(this.stateTimer * 0.5) * Math.PI
          this.position.x += Math.cos(driftAngle) * FLIGHT_SPEED * 0.3 * deltaTime
          this.position.z += Math.sin(driftAngle) * FLIGHT_SPEED * 0.3 * deltaTime
        }
        return
      }
    }

    // Fly toward target cling point
    this.tempVec.copy(this.targetClingPoint.position).sub(this.position)
    const distance = this.tempVec.length()

    if (distance < 0.5) {
      // Reached pillar, start clinging
      this.startIdleOnPillar(this.targetClingPoint)
      return
    }

    this.tempVec.normalize()
    this.position.add(this.tempVec.clone().multiplyScalar(FLIGHT_SPEED * deltaTime))

    // Face movement direction
    const mesh = this.getMesh()
    if (mesh && this.tempVec.lengthSq() > 0.001) {
      mesh.rotation.y = Math.atan2(this.tempVec.x, this.tempVec.z)
    }
  }

  private startIdleOnPillar(clingPoint: PillarClingPoint): void {
    this.currentState = EmberRoachState.IDLE_ON_PILLAR
    this.stateTimer = 0
    this.currentClingPoint = clingPoint
    this.clingNormal.copy(clingPoint.normal)
    this.clingDuration = MIN_CLING_DURATION + Math.random() * (MAX_CLING_DURATION - MIN_CLING_DURATION)
    this.position.copy(clingPoint.position)

    // Orient mesh to face away from pillar
    const mesh = this.getMesh()
    if (mesh) {
      mesh.rotation.y = Math.atan2(clingPoint.normal.x, clingPoint.normal.z)
      mesh.rotation.x = 0
    }
  }

  private startSwoopAttack(): void {
    if (!this.playerPositionRef) return

    this.currentState = EmberRoachState.SWOOPING_ATTACK
    this.swoopProgress = 0
    this.hasDealtDamage = false
    this.isFlying = true

    // Set up bezier curve for swoop
    this.swoopStartPos.copy(this.position)

    // Predict where player will be
    this.swoopTargetPos.copy(this.playerPositionRef)
    this.swoopTargetPos.y += 0.5 // Aim at player center

    // Control point is above the midpoint for an arc
    this.swoopControlPoint.copy(this.swoopStartPos).add(this.swoopTargetPos).multiplyScalar(0.5)
    this.swoopControlPoint.y = Math.max(this.swoopStartPos.y, this.swoopTargetPos.y) + 5 // Arc height
  }

  private startFlyingToPillar(): void {
    this.currentState = EmberRoachState.FLYING_TO_PILLAR
    this.stateTimer = 0
    this.targetClingPoint = null
    this.findNewTargetPillar()
  }

  private findNewTargetPillar(): void {
    if (!this.pillarDetector) return

    // Prefer random pillar for variety
    const point = this.pillarDetector.findRandomClingPoint(this.position, 5, 25)
    if (point) {
      this.targetClingPoint = point
    } else {
      // Fallback to nearest
      const nearest = this.pillarDetector.findNearestClingPoint(this.position, 3, 30)
      if (nearest) {
        this.targetClingPoint = nearest
      }
    }
  }

  private dealDamageToPlayer(): void {
    if (!this.playerPositionRef || !this.playerDamageCallback) return

    // Calculate knockback direction
    this.knockbackDir.copy(this.playerPositionRef).sub(this.position)
    this.knockbackDir.y = 0
    if (this.knockbackDir.lengthSq() > 0) {
      this.knockbackDir.normalize()
    }

    this.knockbackDir.multiplyScalar(ATTACK_KNOCKBACK_HORIZONTAL)
    this.knockbackDir.y = ATTACK_KNOCKBACK_VERTICAL

    this.playerDamageCallback(ATTACK_DAMAGE, this.knockbackDir)
  }

  /**
   * Quadratic bezier curve evaluation.
   */
  private quadraticBezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number): THREE.Vector3 {
    const result = new THREE.Vector3()
    const oneMinusT = 1 - t
    result.x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x
    result.y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y
    result.z = oneMinusT * oneMinusT * p0.z + 2 * oneMinusT * t * p1.z + t * t * p2.z
    return result
  }

  /**
   * Quadratic bezier tangent (derivative).
   */
  private quadraticBezierTangent(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number): THREE.Vector3 {
    const result = new THREE.Vector3()
    const oneMinusT = 1 - t
    result.x = 2 * oneMinusT * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
    result.y = 2 * oneMinusT * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
    result.z = 2 * oneMinusT * (p1.z - p0.z) + 2 * t * (p2.z - p1.z)
    return result
  }

  private updateDeathAnimation(deltaTime: number): void {
    this.deathTimer += deltaTime

    // Apply gravity
    this.deathVelocityY += DEATH_GRAVITY * deltaTime
    this.position.y += this.deathVelocityY * deltaTime

    // Rotate as falling (tumble)
    const mesh = this.getMesh()
    if (mesh) {
      const fallProgress = Math.min(this.deathTimer / DEATH_FALL_DURATION, 1.0)
      mesh.rotation.z = fallProgress * Math.PI // Flip over
      mesh.rotation.x += deltaTime * 5 // Tumble
    }

    this.updateMeshPosition()

    // After linger, actually die
    if (this.deathTimer >= DEATH_FALL_DURATION + DEATH_LINGER_DURATION) {
      this.kill()
    }
  }

  private updateMeshPosition(): void {
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
    }

    // Sync physics body position for hitbox detection
    const body = this.getPhysicsBody()
    if (body) {
      body.position.copy(this.position)
    }
  }

  private updateAnimations(deltaTime: number): void {
    // Wing flutter (faster when flying)
    const wingSpeed = this.isFlying ? WING_FLUTTER_SPEED : WING_FLUTTER_SPEED * 0.2
    this.wingPhase += deltaTime * wingSpeed

    if (this.leftWing && this.rightWing) {
      const wingAngle = Math.sin(this.wingPhase) * WING_FLUTTER_AMPLITUDE
      if (this.isFlying) {
        // Flap up and down when flying (rotation on X axis)
        this.leftWing.rotation.x = wingAngle
        this.rightWing.rotation.x = wingAngle
        // Slight outward angle
        this.leftWing.rotation.z = -0.3
        this.rightWing.rotation.z = 0.3
      } else {
        // Wings folded back when not flying
        this.leftWing.rotation.x = -0.2
        this.rightWing.rotation.x = -0.2
        this.leftWing.rotation.z = -0.5
        this.rightWing.rotation.z = 0.5
      }
    }

    // Leg animation
    const legSpeed = this.isFlying ? LEG_FLIGHT_SPEED : LEG_IDLE_SPEED
    this.legPhase += deltaTime * legSpeed

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]
      // Tripod gait: alternating legs move together
      const phaseOffset = (i % 2) * Math.PI
      const swing = Math.sin(this.legPhase + phaseOffset) * 0.3

      if (this.isFlying) {
        // Legs tucked while flying
        leg.rotation.x = -0.5
        leg.rotation.z = swing * 0.5
      } else {
        // Legs spread while clinging
        leg.rotation.x = 0
        leg.rotation.z = 0
      }
    }

    // Eye pulse (always on)
    if (this.eyeMaterial) {
      const pulse = 0.6 + 0.4 * Math.sin(this.wingPhase * 0.5)
      this.eyeMaterial.emissiveIntensity = pulse
    }
  }

  /**
   * Check if player can interact with this entity.
   */
  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying) return false
    return this.position.distanceTo(playerPosition) <= maxDistance
  }

  /**
   * Get items dropped when this entity dies.
   */
  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true

    const result: IItem[] = []

    // 1-2 Ember Roach Wings
    const wingCount = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < wingCount; i++) {
      result.push(new EmberRoachWingItem())
    }

    // 0-1 Corrupted Essence
    if (Math.random() < 0.5) {
      result.push(new CorruptedEssenceItem())
    }

    return result
  }

  /**
   * Handle player hitting this entity.
   */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick) return false
    if (!this.isAlive || this._isDying) return false

    // Calculate damage from held item
    let damage = DEFAULT_BASE_DAMAGE
    if (heldItem && 'toolStats' in heldItem) {
      const toolItem = heldItem as { toolStats: { damage: number } }
      damage = toolItem.toolStats.damage
    }

    // Apply damage
    this.health -= damage

    // Calculate knockback direction (away from player)
    this.knockbackDir.copy(this.position).sub(playerPosition)
    this.knockbackDir.y = 0
    if (this.knockbackDir.lengthSq() > 0) {
      this.knockbackDir.normalize()
    } else {
      this.knockbackDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    }

    // Set knockback velocity
    this.knockbackVelocity.set(
      this.knockbackDir.x * KNOCKBACK_HORIZONTAL,
      KNOCKBACK_VERTICAL,
      this.knockbackDir.z * KNOCKBACK_HORIZONTAL
    )

    // Check death
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.deathVelocityY = KNOCKBACK_VERTICAL * 0.5 // Pop up slightly
      this.knockbackTimer = 0
    } else {
      // Stun the bug and cancel any attack
      this.knockbackTimer = KNOCKBACK_STUN_TIME
      this.stateTimer = 0 // Reset for wiggle animation

      // Cancel swoop attack if in progress - bug will retreat to pillar after stun
      if (this.currentState === EmberRoachState.SWOOPING_ATTACK) {
        this.hasDealtDamage = true // Prevent dealing damage after being interrupted
      }

      // After stun ends, bug will fly to pillar (set state now, knockback handler will let it play out)
      this.currentState = EmberRoachState.FLYING_TO_PILLAR
      this.targetClingPoint = null // Find a new pillar
      this.attackCooldown = ATTACK_COOLDOWN // Reset attack cooldown
    }

    return true
  }

  onSpawn(): void {
    // Start by looking for a pillar
    this.startFlyingToPillar()
  }

  dispose(): void {
    this.leftWing = null
    this.rightWing = null
    this.legs = []
    this.eyeMaterial = null
    this.pillarDetector = null
    this.currentClingPoint = null
    this.targetClingPoint = null
    this.playerPositionRef = null
    this.playerDamageCallback = null
    super.dispose()
  }
}
