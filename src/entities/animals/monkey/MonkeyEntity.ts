import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import type { IItem } from '../../../items/Item.ts'
import { TreeDetector, type TreePerch } from './TreeDetector.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

/**
 * State machine states for monkey behavior.
 *
 * ROAMING and the flee/knockback/death paths run on the normal physics-driven
 * PeacefulEntity brain. The tree states (APPROACH onward) move the monkey
 * manually with skipPhysics, ember-roach style.
 */
enum MonkeyState {
  /** Physics-driven ground wandering (PeacefulEntity AI) */
  ROAMING = 'roaming',
  /** Running toward the base of a chosen tree */
  APPROACH_TREE = 'approach_tree',
  /** Scrambling up the trunk face and through the canopy */
  CLIMBING = 'climbing',
  /** Sitting on top of the canopy */
  PERCHED = 'perched',
  /** Ballistic leap between two canopy perches */
  LEAPING = 'leaping',
  /** Climbing back down the trunk to the ground */
  DESCENDING = 'descending',
}

// Movement (blocks/sec)
const RUN_SPEED = 4.5 // Approach run - faster than wander walk
const CLIMB_SPEED = 3.5
const LEAP_SPEED = 8.0
const MIN_LEAP_DURATION = 0.5 // seconds

// Tree seeking - monkeys are arboreal, ground time is brief
const TREE_SEEK_MIN_INTERVAL = 2.0 // seconds roaming before looking for a tree
const TREE_SEEK_MAX_INTERVAL = 5.0
const TREE_SEARCH_RANGE = 16 // blocks
const MAX_BASE_Y_DELTA = 4 // tree base must be near the monkey's ground level
const APPROACH_TIMEOUT = 12.0 // seconds before giving up on an unreachable tree
const APPROACH_STUCK_TIME = 0.35 // seconds without progress before reacting
const MAX_APPROACH_JUMPS = 2 // consecutive failed jumps before abandoning

// Leaping between trees
const LEAP_MIN_DISTANCE = 2.5 // blocks (horizontal)
const LEAP_MAX_DISTANCE = 10.0 // blocks - "when the trees are close enough"
const LEAP_MAX_Y_DELTA = 8 // don't leap at canopies far above/below
const LEAP_ARC_HEIGHT = 2.5 // blocks above the higher perch

// Perching
const PERCH_MIN_DURATION = 3.0 // seconds
const PERCH_MAX_DURATION = 9.0
const LEAP_CHANCE = 0.7 // try to leap first when the perch timer expires
const STAY_CHANCE = 0.7 // of the non-leap remainder, re-perch vs climb down

// How far from the trunk center the monkey hangs while climbing
const CLIMB_OFFSET = 0.8

// Reach the trunk when this close (center-to-center); when stuck in the
// foliage that skirts many jungle trunks, grab on from farther out
const CLIMB_LATCH_DISTANCE = 1.8
const CLIMB_GRAB_THROUGH_FOLIAGE_DISTANCE = 3.0

// Swinging around obstructions (leaves, branches) while climbing:
// when the block ahead is solid, arc around the trunk instead of phasing
// through the canopy - visible from outside and much more monkey-like
const SWING_RISE = 1.3 // vertical gain per swing (blocks)
const SWING_DURATION = 0.45 // seconds per swing arc
const SWING_OUT_RADIUS = 1.4 // how far the arc bulges outward at its midpoint
const SWING_LAND_RADIUS = CLIMB_OFFSET + 0.5 // radius after landing a swing
// Candidate rotations around the trunk per swing, tried in random order
const SWING_ANGLES = [Math.PI * 0.4, -Math.PI * 0.4, Math.PI * 0.75, -Math.PI * 0.75]
// Safety cap per climb/descent - beyond this, phase through to guarantee arrival
const MAX_SWINGS = 12

// Seconds an unreachable tree stays blacklisted so the monkey tries others
// instead of re-picking the same nearest tree forever
const FAILED_TREE_MEMORY = 60.0

// Monkey colors
const FUR_BROWN = 0x6b4a2b
const FACE_TAN = 0xc9a87c
const DARK = 0x2a1a10

// Mesh dimensions
const SCALE = 0.0625 // 1 pixel = 1/16 block
const BODY_WIDTH = 6 * SCALE
const BODY_HEIGHT = 7 * SCALE
const BODY_DEPTH = 6 * SCALE
const HEAD_SIZE = 5 * SCALE
const ARM_WIDTH = 2 * SCALE
const ARM_LENGTH = 8 * SCALE
const LEG_WIDTH = 2 * SCALE
const LEG_LENGTH = 5 * SCALE
const EAR_SIZE = 2 * SCALE
const TAIL_WIDTH = 1.5 * SCALE
const TAIL_SEGMENT_LENGTH = 4 * SCALE
const EYE_SIZE = 1 * SCALE

/**
 * A jungle monkey. Runs along the ground, climbs tree trunks, and leaps
 * from canopy to canopy when the trees are close enough.
 */
export class MonkeyEntity extends PeacefulEntity {
  readonly type = 'monkey'

  private currentState: MonkeyState = MonkeyState.ROAMING
  private stateTimer = 0

  // Tree navigation
  private treeDetector: TreeDetector | null = null
  private targetTree: TreePerch | null = null
  private currentTree: TreePerch | null = null
  private treeSeekTimer: number
  private treeSearchCooldown = 0

  // Approach progress tracking
  private approachTimer = 0
  private approachStuckTimer = 0
  private approachJumpAttempts = 0
  private lastApproachDistance = Infinity

  // Trees that recently proved unreachable (key -> seconds remaining)
  private readonly failedTrees = new Map<string, number>()

  // Climb state: position around the trunk as angle + radius, so swings can
  // rotate the monkey around the trunk to get past obstructions
  private climbAngle = 0
  private climbRadius = CLIMB_OFFSET
  private climbTopStartY = 0
  private swingCount = 0

  // Active swing arc (quadratic bezier around an obstruction, also used for
  // the final hop onto the perch and the drop off it)
  private swingArc: {
    readonly start: THREE.Vector3
    readonly control: THREE.Vector3
    readonly end: THREE.Vector3
    progress: number
    duration: number
    onDone: 'continue' | 'perch'
  } | null = null

  // World queries (wired by EntityManager)
  private solidQueryFn: ((x: number, y: number, z: number) => boolean) | null = null

  // Leap state (quadratic bezier)
  private readonly leapStart = new THREE.Vector3()
  private readonly leapControl = new THREE.Vector3()
  private readonly leapEnd = new THREE.Vector3()
  private leapProgress = 0
  private leapDuration = 1

  // Perch state
  private perchDuration = 0

  // Animation state
  private limbPhase = 0
  private tailPhase = 0
  private idlePhase = 0

  // Mesh parts
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private head: THREE.Group | null = null
  private tail: THREE.Group | null = null

  // Reusable vectors
  private readonly tempVec = new THREE.Vector3()

  constructor(config: IPeacefulEntityConfig) {
    super('monkey', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.6, 0.9, 0.6),
      walkSpeed: 3.0,
      fleeSpeed: 6.0,
      maxHealth: 8,
      drops: config.drops ?? [],
    })

    this.treeSeekTimer = this.randomRange(TREE_SEEK_MIN_INTERVAL, TREE_SEEK_MAX_INTERVAL)
    this.limbPhase = Math.random() * Math.PI * 2
    this.tailPhase = Math.random() * Math.PI * 2
  }

  /**
   * World query wiring - called automatically by EntityManager on spawn.
   */
  setWorldQueryFns(
    blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.treeDetector = new TreeDetector(blockQuery)
    this.solidQueryFn = solidQuery
  }

  // ===== MESH =====

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    const furMaterial = new THREE.MeshLambertMaterial({ color: FUR_BROWN })
    const faceMaterial = new THREE.MeshLambertMaterial({ color: FACE_TAN })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: DARK })
    this.registerMaterialForLighting(furMaterial)
    this.registerMaterialForLighting(faceMaterial)
    this.registerMaterialForLighting(darkMaterial)

    const hipY = LEG_LENGTH
    const shoulderY = hipY + BODY_HEIGHT * 0.85

    // Body
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, furMaterial)
    body.position.y = hipY + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Tan belly patch
    const bellyGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.6, BODY_HEIGHT * 0.6, 0.5 * SCALE)
    const belly = new THREE.Mesh(bellyGeometry, faceMaterial)
    belly.position.set(0, hipY + BODY_HEIGHT * 0.45, BODY_DEPTH / 2 + 0.1 * SCALE)
    group.add(belly)

    // Head group (pivots at neck)
    const headGroup = new THREE.Group()
    headGroup.position.set(0, shoulderY + BODY_HEIGHT * 0.15, BODY_DEPTH * 0.15)

    const headGeometry = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE)
    const headMesh = new THREE.Mesh(headGeometry, furMaterial)
    headMesh.position.y = HEAD_SIZE / 2
    headMesh.castShadow = true
    headGroup.add(headMesh)

    // Tan face plate
    const faceGeometry = new THREE.BoxGeometry(HEAD_SIZE * 0.75, HEAD_SIZE * 0.65, 0.5 * SCALE)
    const face = new THREE.Mesh(faceGeometry, faceMaterial)
    face.position.set(0, HEAD_SIZE * 0.42, HEAD_SIZE / 2 + 0.1 * SCALE)
    headGroup.add(face)

    // Eyes
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE, EYE_SIZE, 0.4 * SCALE)
    for (const xMult of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, darkMaterial)
      eye.position.set(xMult * HEAD_SIZE * 0.18, HEAD_SIZE * 0.55, HEAD_SIZE / 2 + 0.4 * SCALE)
      headGroup.add(eye)
    }

    // Muzzle
    const muzzleGeometry = new THREE.BoxGeometry(HEAD_SIZE * 0.4, HEAD_SIZE * 0.25, 0.8 * SCALE)
    const muzzle = new THREE.Mesh(muzzleGeometry, faceMaterial)
    muzzle.position.set(0, HEAD_SIZE * 0.2, HEAD_SIZE / 2 + 0.5 * SCALE)
    headGroup.add(muzzle)

    // Round ears with tan inner
    const earGeometry = new THREE.BoxGeometry(1 * SCALE, EAR_SIZE, EAR_SIZE)
    const innerEarGeometry = new THREE.BoxGeometry(0.5 * SCALE, EAR_SIZE * 0.6, EAR_SIZE * 0.6)
    for (const xMult of [-1, 1]) {
      const ear = new THREE.Mesh(earGeometry, furMaterial)
      ear.position.set(xMult * (HEAD_SIZE / 2 + 0.5 * SCALE), HEAD_SIZE * 0.6, 0)
      ear.castShadow = true
      headGroup.add(ear)
      const innerEar = new THREE.Mesh(innerEarGeometry, faceMaterial)
      innerEar.position.set(xMult * 0.3 * SCALE, 0, 0)
      ear.add(innerEar)
    }

    group.add(headGroup)
    this.head = headGroup

    // Long arms (pivot at shoulder so climbing reach looks right)
    const armGeometry = new THREE.BoxGeometry(ARM_WIDTH, ARM_LENGTH, ARM_WIDTH)
    const armMeshes: [THREE.Group | null, THREE.Group | null] = [null, null]
    ;[-1, 1].forEach((xMult, i) => {
      const armGroup = new THREE.Group()
      armGroup.position.set(xMult * (BODY_WIDTH / 2 + ARM_WIDTH / 2), shoulderY, BODY_DEPTH * 0.2)
      const arm = new THREE.Mesh(armGeometry, furMaterial)
      arm.position.y = -ARM_LENGTH / 2
      arm.castShadow = true
      armGroup.add(arm)
      // Tan hand
      const handGeometry = new THREE.BoxGeometry(ARM_WIDTH * 1.1, 1 * SCALE, ARM_WIDTH * 1.1)
      const hand = new THREE.Mesh(handGeometry, faceMaterial)
      hand.position.y = -ARM_LENGTH + 0.5 * SCALE
      armGroup.add(hand)
      group.add(armGroup)
      armMeshes[i] = armGroup
    })
    this.leftArm = armMeshes[0]
    this.rightArm = armMeshes[1]

    // Legs (pivot at hip)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_LENGTH, LEG_WIDTH)
    const legMeshes: [THREE.Group | null, THREE.Group | null] = [null, null]
    ;[-1, 1].forEach((xMult, i) => {
      const legGroup = new THREE.Group()
      legGroup.position.set(xMult * BODY_WIDTH * 0.28, hipY, -BODY_DEPTH * 0.2)
      const leg = new THREE.Mesh(legGeometry, furMaterial)
      leg.position.y = -LEG_LENGTH / 2
      leg.castShadow = true
      legGroup.add(leg)
      group.add(legGroup)
      legMeshes[i] = legGroup
    })
    this.leftLeg = legMeshes[0]
    this.rightLeg = legMeshes[1]

    // Long curling tail: chain of 3 segments, root pivots at the rump
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0, hipY + BODY_HEIGHT * 0.7, -BODY_DEPTH / 2)
    let parent: THREE.Object3D = tailGroup
    for (let i = 0; i < 3; i++) {
      const segGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_WIDTH, TAIL_SEGMENT_LENGTH)
      const seg = new THREE.Mesh(segGeometry, furMaterial)
      seg.position.z = -TAIL_SEGMENT_LENGTH / 2
      seg.castShadow = true
      const segPivot = new THREE.Group()
      segPivot.rotation.x = 0.5 // curl upward
      segPivot.add(seg)
      if (i > 0) segPivot.position.z = -TAIL_SEGMENT_LENGTH
      parent.add(segPivot)
      parent = segPivot
    }
    group.add(tailGroup)
    this.tail = tailGroup

    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.head, this.tail],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  // ===== BRAIN =====

  update(deltaTime: number): void {
    // Dying or knocked back while in a tree: fall out of it and let the
    // physics-driven PeacefulEntity paths (death anim, stun, flee) take over.
    if ((this._isDying || this.knockbackTimer > 0) && this.currentState !== MonkeyState.ROAMING) {
      this.exitTreeToGround()
    }

    // Expire failed-tree memory
    if (this.failedTrees.size > 0) {
      for (const [key, ttl] of this.failedTrees) {
        if (ttl - deltaTime <= 0) this.failedTrees.delete(key)
        else this.failedTrees.set(key, ttl - deltaTime)
      }
    }

    switch (this.currentState) {
      case MonkeyState.ROAMING:
        this.updateRoaming(deltaTime)
        break
      case MonkeyState.APPROACH_TREE:
        this.updateApproachTree(deltaTime)
        break
      case MonkeyState.CLIMBING:
        this.updateClimbing(deltaTime)
        break
      case MonkeyState.PERCHED:
        this.updatePerched(deltaTime)
        break
      case MonkeyState.LEAPING:
        this.updateLeaping(deltaTime)
        break
      case MonkeyState.DESCENDING:
        this.updateDescending(deltaTime)
        break
    }
  }

  private updateRoaming(deltaTime: number): void {
    // Full PeacefulEntity brain: wander, flee, knockback, death, animations
    super.update(deltaTime)
    if (this._isDying || this.knockbackTimer > 0 || this.fleeTimer > 0) return

    // Periodically go looking for a tree to climb
    this.treeSeekTimer -= deltaTime
    if (this.treeSeekTimer > 0) return
    this.treeSearchCooldown -= deltaTime
    if (this.treeSearchCooldown > 0) return
    this.treeSearchCooldown = 1.0 // Throttle scans while no tree is found

    const tree = this.findClimbableTree()
    if (!tree) return

    this.targetTree = tree
    this.currentState = MonkeyState.APPROACH_TREE
    this.stateTimer = 0
    this.approachTimer = 0
    this.approachStuckTimer = 0
    this.approachJumpAttempts = 0
    this.lastApproachDistance = Infinity
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = false
  }

  private findClimbableTree(): TreePerch | null {
    if (!this.treeDetector) return null
    const trees = this.treeDetector.findTrees(this.position, TREE_SEARCH_RANGE)
    for (const tree of trees) {
      // Base must be reachable from the monkey's current ground level
      if (Math.abs(tree.baseY - this.position.y) > MAX_BASE_Y_DELTA) continue
      // Skip trees that recently proved unreachable
      if (this.failedTrees.has(tree.key)) continue
      return tree
    }
    return null
  }

  private updateApproachTree(deltaTime: number): void {
    const body = this.getPhysicsBody()
    const tree = this.targetTree
    if (!body || !tree) {
      this.toRoaming()
      return
    }

    // Movement in this state is physics-driven but bypasses super.update(),
    // so pull the entity and mesh positions from the body ourselves - without
    // this the mesh runs on the spot while the invisible body sails away
    this.position.copy(body.position)
    const approachMesh = this.getMesh()
    if (approachMesh) approachMesh.position.copy(this.position)

    this.approachTimer += deltaTime
    if (this.approachTimer > APPROACH_TIMEOUT) {
      this.abandonTargetTree()
      return
    }

    // Run at the trunk
    const trunkCenterX = tree.trunkX + 0.5
    const trunkCenterZ = tree.trunkZ + 0.5
    this.tempVec.set(trunkCenterX - this.position.x, 0, trunkCenterZ - this.position.z)
    const distance = this.tempVec.length()

    if (distance < CLIMB_LATCH_DISTANCE) {
      this.startClimbing(tree)
      return
    }

    // Obstacle handling: react fast when progress stalls - hop over 1-block
    // steps like the wander brain does, and give up only after repeated
    // failed jumps (no more running on the spot)
    if (distance > this.lastApproachDistance - RUN_SPEED * deltaTime * 0.2) {
      this.approachStuckTimer += deltaTime
      if (this.approachStuckTimer > APPROACH_STUCK_TIME) {
        // Blocked but nearly there: many jungle trunks are skirted by solid
        // foliage - close enough counts, grab on through the leaves
        if (distance < CLIMB_GRAB_THROUGH_FOLIAGE_DISTANCE) {
          this.startClimbing(tree)
          return
        }
        if (body.isOnGround) {
          if (this.approachJumpAttempts < MAX_APPROACH_JUMPS) {
            body.velocity.y = this.jumpVelocity
            this.approachJumpAttempts++
            this.approachStuckTimer = 0
          } else {
            // Jumps didn't clear it - this tree isn't reachable from here
            this.abandonTargetTree()
            return
          }
        }
        // Mid-air: wait for the landing before deciding anything
      }
    } else {
      this.approachStuckTimer = 0
      if (body.isOnGround) {
        this.approachJumpAttempts = 0
      }
    }
    this.lastApproachDistance = distance

    this.tempVec.normalize()
    body.velocity.x = this.tempVec.x * RUN_SPEED
    body.velocity.z = this.tempVec.z * RUN_SPEED
    this.isWalking = true

    const mesh = this.getMesh()
    if (mesh) {
      mesh.rotation.y = Math.atan2(this.tempVec.x, this.tempVec.z)
    }

    this.updateAnimations(deltaTime)
  }

  /**
   * Give up on an unreachable tree and remember not to re-pick it.
   */
  private abandonTargetTree(): void {
    if (this.targetTree) {
      this.failedTrees.set(this.targetTree.key, FAILED_TREE_MEMORY)
    }
    this.toRoaming()
  }

  private startClimbing(tree: TreePerch): void {
    if (this.treeDetector && !this.treeDetector.isTreeStillThere(tree)) {
      this.treeDetector.invalidateCache()
      this.toRoaming()
      return
    }

    this.currentState = MonkeyState.CLIMBING
    this.currentTree = tree
    this.targetTree = null
    this.stateTimer = 0
    this.swingCount = 0
    this.swingArc = null

    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = true
      body.velocity.set(0, 0, 0)
    }

    // Cling to the trunk at the angle we approached from
    const trunkCenterX = tree.trunkX + 0.5
    const trunkCenterZ = tree.trunkZ + 0.5
    this.climbAngle = Math.atan2(
      this.position.z - trunkCenterZ,
      this.position.x - trunkCenterX
    )
    this.climbRadius = CLIMB_OFFSET
    this.climbTopStartY = tree.topY + 0.5
    this.position.set(
      trunkCenterX + Math.cos(this.climbAngle) * CLIMB_OFFSET,
      Math.max(this.position.y, tree.baseY),
      trunkCenterZ + Math.sin(this.climbAngle) * CLIMB_OFFSET
    )
    this.faceTrunk()
  }

  /** Face the trunk of the current tree. */
  private faceTrunk(): void {
    const tree = this.currentTree
    const mesh = this.getMesh()
    if (!tree || !mesh) return
    const dx = tree.trunkX + 0.5 - this.position.x
    const dz = tree.trunkZ + 0.5 - this.position.z
    if (dx * dx + dz * dz > 0.0001) {
      mesh.rotation.y = Math.atan2(dx, dz)
    }
  }

  /**
   * Whether a solid block occupies the given world position.
   */
  private isSolidAt(x: number, y: number, z: number): boolean {
    if (!this.solidQueryFn) return false
    return this.solidQueryFn(Math.floor(x), Math.floor(y), Math.floor(z))
  }

  /**
   * Launch a swing arc around an obstruction: rotate around the trunk to a
   * clear spot while gaining (or losing) SWING_RISE height, bulging outward
   * at mid-arc like a pendulum on a branch.
   * @param direction +1 climbing up, -1 climbing down
   */
  private startSwing(direction: 1 | -1): void {
    const tree = this.currentTree
    if (!tree) return

    const trunkCenterX = tree.trunkX + 0.5
    const trunkCenterZ = tree.trunkZ + 0.5
    const targetY = this.position.y + SWING_RISE * direction

    // Try candidate rotations in random order; prefer one whose landing spot
    // is clear, but take the last candidate regardless (the cap on total
    // swings guarantees termination either way)
    const angles = [...SWING_ANGLES].sort(() => Math.random() - 0.5)
    let chosenAngle = this.climbAngle + angles[angles.length - 1]
    for (const delta of angles) {
      const angle = this.climbAngle + delta
      const x = trunkCenterX + Math.cos(angle) * SWING_LAND_RADIUS
      const z = trunkCenterZ + Math.sin(angle) * SWING_LAND_RADIUS
      if (!this.isSolidAt(x, targetY + 0.5, z)) {
        chosenAngle = angle
        break
      }
    }

    const start = this.position.clone()
    const end = new THREE.Vector3(
      trunkCenterX + Math.cos(chosenAngle) * SWING_LAND_RADIUS,
      targetY,
      trunkCenterZ + Math.sin(chosenAngle) * SWING_LAND_RADIUS
    )
    // Midpoint bulges outward from the trunk for the pendulum feel
    const midAngle = this.climbAngle + (chosenAngle - this.climbAngle) * 0.5
    const control = new THREE.Vector3(
      trunkCenterX + Math.cos(midAngle) * SWING_OUT_RADIUS,
      (start.y + end.y) * 0.5 + 0.2 * direction,
      trunkCenterZ + Math.sin(midAngle) * SWING_OUT_RADIUS
    )

    this.swingArc = { start, control, end, progress: 0, duration: SWING_DURATION, onDone: 'continue' }
    this.climbAngle = chosenAngle
    this.climbRadius = SWING_LAND_RADIUS
    this.swingCount++
  }

  /**
   * Advance the active swing arc. Returns true while an arc is in flight.
   */
  private updateSwingArc(deltaTime: number): boolean {
    const arc = this.swingArc
    if (!arc) return false

    arc.progress += deltaTime / arc.duration
    const t = Math.min(arc.progress, 1)
    const s = 1 - t
    this.position.set(
      s * s * arc.start.x + 2 * s * t * arc.control.x + t * t * arc.end.x,
      s * s * arc.start.y + 2 * s * t * arc.control.y + t * t * arc.end.y,
      s * s * arc.start.z + 2 * s * t * arc.control.z + t * t * arc.end.z
    )
    this.faceTrunk()

    if (t >= 1) {
      const done = arc.onDone
      this.swingArc = null
      if (done === 'perch') {
        this.startPerched()
      }
    }
    return true
  }

  /** True while a swing arc is in flight (drives the hanging animation). */
  private get isSwinging(): boolean {
    return this.swingArc !== null
  }

  private updateClimbing(deltaTime: number): void {
    const tree = this.currentTree
    if (!tree) {
      this.exitTreeToGround()
      return
    }

    if (this.updateSwingArc(deltaTime)) {
      this.syncManualPosition()
      this.updateAnimations(deltaTime)
      return
    }

    // Near the top: one last swing-hop onto the perch
    if (this.position.y >= tree.perch.y - 0.6) {
      const start = this.position.clone()
      const end = tree.perch.clone()
      const control = start.clone().add(end).multiplyScalar(0.5)
      control.y = Math.max(start.y, end.y) + 0.8
      this.swingArc = { start, control, end, progress: 0, duration: SWING_DURATION, onDone: 'perch' }
      return
    }

    // Blocked ahead (canopy leaves, a branch)? Swing around it.
    const headY = this.position.y + 0.9
    if (this.swingCount < MAX_SWINGS && this.isSolidAt(this.position.x, headY, this.position.z)) {
      this.startSwing(1)
      return
    }

    // Clear: scramble straight up the trunk face, easing back in after swings
    this.position.y += CLIMB_SPEED * deltaTime
    this.climbRadius += (CLIMB_OFFSET - this.climbRadius) * Math.min(deltaTime * 2, 1)
    const trunkCenterX = tree.trunkX + 0.5
    const trunkCenterZ = tree.trunkZ + 0.5
    this.position.x = trunkCenterX + Math.cos(this.climbAngle) * this.climbRadius
    this.position.z = trunkCenterZ + Math.sin(this.climbAngle) * this.climbRadius
    this.faceTrunk()

    this.syncManualPosition()
    this.updateAnimations(deltaTime)
  }

  private startPerched(): void {
    const tree = this.currentTree
    if (!tree) {
      this.exitTreeToGround()
      return
    }
    this.currentState = MonkeyState.PERCHED
    this.stateTimer = 0
    this.perchDuration = this.randomRange(PERCH_MIN_DURATION, PERCH_MAX_DURATION)
    this.position.copy(tree.perch)
    this.syncManualPosition()
  }

  private updatePerched(deltaTime: number): void {
    this.stateTimer += deltaTime

    if (this.stateTimer >= this.perchDuration) {
      this.stateTimer = 0

      // First choice: leap to a neighboring tree when one is close enough
      if (Math.random() < LEAP_CHANCE) {
        const target = this.findLeapTarget()
        if (target) {
          this.startLeap(target)
          return
        }
      }

      if (Math.random() < STAY_CHANCE) {
        // Stay a while longer
        this.perchDuration = this.randomRange(PERCH_MIN_DURATION, PERCH_MAX_DURATION)
      } else {
        this.startDescending()
        return
      }
    }

    this.updateAnimations(deltaTime)
  }

  private findLeapTarget(): TreePerch | null {
    const tree = this.currentTree
    if (!this.treeDetector || !tree) return null

    const trees = this.treeDetector.findTrees(this.position, LEAP_MAX_DISTANCE + 2)
    const candidates: TreePerch[] = []
    for (const t of trees) {
      if (t.key === tree.key) continue
      const dx = t.perch.x - this.position.x
      const dz = t.perch.z - this.position.z
      const horizontal = Math.hypot(dx, dz)
      if (horizontal < LEAP_MIN_DISTANCE || horizontal > LEAP_MAX_DISTANCE) continue
      if (Math.abs(t.perch.y - this.position.y) > LEAP_MAX_Y_DELTA) continue
      candidates.push(t)
      if (candidates.length >= 6) break
    }
    if (candidates.length === 0) return null

    const target = candidates[Math.floor(Math.random() * candidates.length)]
    if (this.treeDetector && !this.treeDetector.isTreeStillThere(target)) {
      this.treeDetector.invalidateCache()
      return null
    }
    return target
  }

  private startLeap(target: TreePerch): void {
    this.currentState = MonkeyState.LEAPING
    this.stateTimer = 0
    this.leapProgress = 0

    this.leapStart.copy(this.position)
    this.leapEnd.copy(target.perch)
    this.leapControl.copy(this.leapStart).add(this.leapEnd).multiplyScalar(0.5)
    this.leapControl.y = Math.max(this.leapStart.y, this.leapEnd.y) + LEAP_ARC_HEIGHT

    const distance = this.leapStart.distanceTo(this.leapEnd)
    this.leapDuration = Math.max(distance / LEAP_SPEED, MIN_LEAP_DURATION)

    this.currentTree = target
  }

  private updateLeaping(deltaTime: number): void {
    this.leapProgress += deltaTime / this.leapDuration
    const t = Math.min(this.leapProgress, 1)

    // Quadratic bezier
    const oneMinusT = 1 - t
    this.position.set(
      oneMinusT * oneMinusT * this.leapStart.x + 2 * oneMinusT * t * this.leapControl.x + t * t * this.leapEnd.x,
      oneMinusT * oneMinusT * this.leapStart.y + 2 * oneMinusT * t * this.leapControl.y + t * t * this.leapEnd.y,
      oneMinusT * oneMinusT * this.leapStart.z + 2 * oneMinusT * t * this.leapControl.z + t * t * this.leapEnd.z
    )

    // Face along the leap
    const mesh = this.getMesh()
    if (mesh) {
      this.tempVec.set(
        2 * oneMinusT * (this.leapControl.x - this.leapStart.x) + 2 * t * (this.leapEnd.x - this.leapControl.x),
        2 * oneMinusT * (this.leapControl.y - this.leapStart.y) + 2 * t * (this.leapEnd.y - this.leapControl.y),
        2 * oneMinusT * (this.leapControl.z - this.leapStart.z) + 2 * t * (this.leapEnd.z - this.leapControl.z)
      )
      if (this.tempVec.lengthSq() > 0.001) {
        mesh.rotation.y = Math.atan2(this.tempVec.x, this.tempVec.z)
        mesh.rotation.x = -Math.atan2(
          this.tempVec.y,
          Math.hypot(this.tempVec.x, this.tempVec.z)
        ) * 0.5
      }
    }

    if (t >= 1) {
      const mesh2 = this.getMesh()
      if (mesh2) mesh2.rotation.x = 0
      this.startPerched()
      return
    }

    this.syncManualPosition()
    this.updateAnimations(deltaTime)
  }

  private startDescending(): void {
    const tree = this.currentTree
    if (!tree || (this.treeDetector && !this.treeDetector.isTreeStillThere(tree))) {
      this.exitTreeToGround()
      return
    }
    this.currentState = MonkeyState.DESCENDING
    this.stateTimer = 0
    this.swingCount = 0
    this.swingArc = null

    // Pick a side of the trunk to climb down (the perch may be offset from
    // the trunk, and leaps land without an established climb angle)
    this.climbAngle = Math.random() * Math.PI * 2
    this.climbRadius = SWING_LAND_RADIUS
    this.faceTrunk()
  }

  private updateDescending(deltaTime: number): void {
    const tree = this.currentTree
    if (!tree) {
      this.exitTreeToGround()
      return
    }

    if (this.updateSwingArc(deltaTime)) {
      this.syncManualPosition()
      this.updateAnimations(deltaTime)
      return
    }

    // Reached the trunk base: hop off and return to the ground brain
    if (this.position.y <= tree.baseY + 0.1) {
      this.position.y = tree.baseY + 0.1
      this.syncManualPosition()
      this.exitTreeToGround()
      return
    }

    // Blocked below (the canopy we're perched on, branches)? Swing down
    // around it - this is also what carries the monkey off the perch.
    const feetY = this.position.y - 0.4
    if (
      this.swingCount < MAX_SWINGS &&
      this.position.y > tree.baseY + 1.5 &&
      this.isSolidAt(this.position.x, feetY, this.position.z)
    ) {
      this.startSwing(-1)
      return
    }

    // Clear: climb straight down the trunk face
    this.position.y -= CLIMB_SPEED * deltaTime
    this.climbRadius += (CLIMB_OFFSET - this.climbRadius) * Math.min(deltaTime * 2, 1)
    const trunkCenterX = tree.trunkX + 0.5
    const trunkCenterZ = tree.trunkZ + 0.5
    this.position.x = trunkCenterX + Math.cos(this.climbAngle) * this.climbRadius
    this.position.z = trunkCenterZ + Math.sin(this.climbAngle) * this.climbRadius
    this.faceTrunk()

    this.syncManualPosition()
    this.updateAnimations(deltaTime)
  }

  /**
   * Return control to the physics engine and the PeacefulEntity ground brain.
   */
  private exitTreeToGround(): void {
    this.currentState = MonkeyState.ROAMING
    this.currentTree = null
    this.targetTree = null
    this.swingArc = null
    this.treeSeekTimer = this.randomRange(TREE_SEEK_MIN_INTERVAL, TREE_SEEK_MAX_INTERVAL)

    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = false
      body.position.copy(this.position)
    }

    const mesh = this.getMesh()
    if (mesh) mesh.rotation.x = 0
  }

  private toRoaming(): void {
    this.exitTreeToGround()
  }

  /**
   * Keep mesh and physics body in lockstep while movement is manual.
   */
  private syncManualPosition(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const body = this.getPhysicsBody()
    if (body) body.position.copy(this.position)
  }

  // ===== ANIMATION =====

  protected updateAnimations(deltaTime: number): void {
    const inTree =
      this.currentState === MonkeyState.CLIMBING ||
      this.currentState === MonkeyState.DESCENDING
    const leaping = this.currentState === MonkeyState.LEAPING
    const perched = this.currentState === MonkeyState.PERCHED

    this.idlePhase += deltaTime * 2

    if (leaping) {
      // Arms thrown forward-up, legs trailing, tail streaming behind
      if (this.leftArm) this.leftArm.rotation.x = -2.4
      if (this.rightArm) this.rightArm.rotation.x = -2.4
      if (this.leftLeg) this.leftLeg.rotation.x = 0.7
      if (this.rightLeg) this.rightLeg.rotation.x = 0.7
      if (this.tail) this.tail.rotation.x = 0.8
      return
    }

    if (inTree) {
      if (this.isSwinging) {
        // Hanging by both arms mid-swing, legs dangling, tail streaming
        this.limbPhase += deltaTime * 6
        const dangle = Math.sin(this.limbPhase) * 0.2
        if (this.leftArm) this.leftArm.rotation.x = -2.9
        if (this.rightArm) this.rightArm.rotation.x = -2.9
        if (this.leftLeg) this.leftLeg.rotation.x = 0.3 + dangle
        if (this.rightLeg) this.rightLeg.rotation.x = 0.3 - dangle
        if (this.tail) this.tail.rotation.x = 0.9
        return
      }
      // Alternating hand-over-hand scramble
      this.limbPhase += deltaTime * 9
      const reach = Math.sin(this.limbPhase)
      if (this.leftArm) this.leftArm.rotation.x = -Math.PI * 0.8 + reach * 0.5
      if (this.rightArm) this.rightArm.rotation.x = -Math.PI * 0.8 - reach * 0.5
      if (this.leftLeg) this.leftLeg.rotation.x = -0.6 - reach * 0.4
      if (this.rightLeg) this.rightLeg.rotation.x = -0.6 + reach * 0.4
      if (this.tail) this.tail.rotation.x = -0.3 + Math.sin(this.idlePhase) * 0.1
      return
    }

    if (perched) {
      // Sitting: legs tucked forward, arms resting, tail curling slowly
      if (this.leftLeg) this.leftLeg.rotation.x = -1.4
      if (this.rightLeg) this.rightLeg.rotation.x = -1.4
      if (this.leftArm) this.leftArm.rotation.x = -0.2
      if (this.rightArm) this.rightArm.rotation.x = -0.2
      this.tailPhase += deltaTime * 1.5
      if (this.tail) {
        this.tail.rotation.x = 0.3 + Math.sin(this.tailPhase) * 0.25
        this.tail.rotation.y = Math.sin(this.tailPhase * 0.7) * 0.3
      }
      if (this.head) {
        // Look around
        this.head.rotation.y = Math.sin(this.idlePhase * 0.6) * 0.6
      }
      return
    }

    // Ground states (ROAMING wander/flee + APPROACH run)
    if (this.isWalking) {
      this.limbPhase += deltaTime * 12
      const swing = Math.sin(this.limbPhase) * 0.9
      if (this.leftArm) this.leftArm.rotation.x = swing
      if (this.rightArm) this.rightArm.rotation.x = -swing
      if (this.leftLeg) this.leftLeg.rotation.x = -swing
      if (this.rightLeg) this.rightLeg.rotation.x = swing
      this.tailPhase += deltaTime * 6
      if (this.tail) {
        this.tail.rotation.x = 0.5
        this.tail.rotation.y = Math.sin(this.tailPhase) * 0.2
      }
      if (this.head) this.head.rotation.y *= 0.8
    } else {
      // Idle on the ground
      if (this.leftArm) this.leftArm.rotation.x *= 0.85
      if (this.rightArm) this.rightArm.rotation.x *= 0.85
      if (this.leftLeg) this.leftLeg.rotation.x *= 0.85
      if (this.rightLeg) this.rightLeg.rotation.x *= 0.85
      this.tailPhase += deltaTime * 2
      if (this.tail) {
        this.tail.rotation.x = 0.4 + Math.sin(this.tailPhase) * 0.15
        this.tail.rotation.y = Math.sin(this.tailPhase * 0.8) * 0.2
      }
      if (this.head) this.head.rotation.y = Math.sin(this.idlePhase * 0.5) * 0.3
    }
  }

  /**
   * Getting hit while in a tree knocks the monkey out of it; the shared
   * PeacefulEntity handler then applies damage, knockback, and flee.
   */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (handled && this.currentState !== MonkeyState.ROAMING) {
      this.exitTreeToGround()
    }
    return handled
  }

  dispose(): void {
    this.leftArm = null
    this.rightArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.head = null
    this.tail = null
    this.treeDetector = null
    this.targetTree = null
    this.currentTree = null
    super.dispose()
  }
}
