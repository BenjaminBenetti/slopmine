import * as THREE from 'three'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { IPhysicsWorld } from '../physics/interfaces/IPhysicsWorld.ts'
import type { PhysicsEngine } from '../physics/PhysicsEngine.ts'
import { EYE_HEIGHT, JUMP_VELOCITY, CLIMB_VELOCITY } from '../physics/constants.ts'

export interface FirstPersonCameraControlOptions {
  movementSpeed?: number
  lookSensitivity?: number
}

export interface CameraControls {
  update(deltaTime: number): void
  dispose(): void
  setInputEnabled(enabled: boolean): void
  applyKnockback(knockback: THREE.Vector3): void
}

/**
 * First-person camera controller with physics integration.
 * - WASD for horizontal movement
 * - Space for jump (when grounded)
 * - Mouse look with pointer lock
 *
 * Camera position follows the physics body with eye height offset.
 */
export class FirstPersonCameraControls implements CameraControls {
  private readonly camera: THREE.PerspectiveCamera
  private readonly domElement: HTMLElement
  private readonly movementSpeed: number
  private readonly lookSensitivity: number

  private inputEnabled = true

  private yaw = 0
  private pitch = 0

  private moveForward = false
  private moveBackward = false
  private moveLeft = false
  private moveRight = false
  private jumpPressed = false
  private shiftPressed = false

  // Debug flying mode
  private flyingMode = false
  private readonly flyingSpeed = 32 // Fast flying speed

  private pointerLocked = false

  // Physics references
  private physicsBody: IPhysicsBody | null = null
  private physicsEngine: PhysicsEngine | null = null
  private physicsWorld: IPhysicsWorld | null = null

  // Pre-allocated vectors to avoid per-frame GC pressure
  private readonly tempDirection = new THREE.Vector3()
  private readonly tempForward = new THREE.Vector3()
  private readonly tempRight = new THREE.Vector3()

  // External velocity from knockback, decays over time
  private readonly knockbackVelocity = new THREE.Vector3()
  private static readonly KNOCKBACK_DECAY = 8.0 // How fast knockback decays per second

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    options: FirstPersonCameraControlOptions = {}
  ) {
    this.camera = camera
    this.domElement = domElement
    this.movementSpeed = options.movementSpeed ?? 8
    this.lookSensitivity = options.lookSensitivity ?? 0.002

    // Configure camera for FPS-style rotation
    this.camera.rotation.order = 'YXZ'
    this.yaw = this.camera.rotation.y
    this.pitch = this.camera.rotation.x

    this.domElement.addEventListener('click', this.onClick)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onWindowBlur)
  }

  /**
   * Connect this controller to the physics system.
   */
  setPhysics(body: IPhysicsBody, engine: PhysicsEngine): void {
    this.physicsBody = body
    this.physicsEngine = engine
  }

  /**
   * Set the physics world for climbable block checks.
   */
  setWorld(world: IPhysicsWorld): void {
    this.physicsWorld = world
  }

  /**
   * Check if the player is currently inside a climbable block.
   * Checks both feet level and mid-body level for better detection.
   */
  private isInClimbableBlock(): boolean {
    if (!this.physicsBody || !this.physicsWorld) return false

    const x = Math.floor(this.physicsBody.position.x)
    const yFeet = Math.floor(this.physicsBody.position.y)
    const yMid = Math.floor(this.physicsBody.position.y + 1)
    const z = Math.floor(this.physicsBody.position.z)

    return this.physicsWorld.isClimbableBlock(x, yFeet, z) ||
           this.physicsWorld.isClimbableBlock(x, yMid, z)
  }

  private onClick = (): void => {
    if (document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock()
    }
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.domElement

    if (this.pointerLocked) {
      document.addEventListener('mousemove', this.onMouseMove)
    } else {
      document.removeEventListener('mousemove', this.onMouseMove)
      this.resetMovement()
    }
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked || !this.inputEnabled) return

    const movementX = event.movementX || 0
    const movementY = event.movementY || 0

    this.yaw -= movementX * this.lookSensitivity
    this.pitch -= movementY * this.lookSensitivity

    const pitchLimit = Math.PI / 2
    if (this.pitch < -pitchLimit) this.pitch = -pitchLimit
    if (this.pitch > pitchLimit) this.pitch = pitchLimit
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.inputEnabled) return

    // Toggle flying mode with Ctrl+Alt+P
    if (event.code === 'KeyP' && event.ctrlKey && event.altKey) {
      this.flyingMode = !this.flyingMode
      if (this.physicsBody) {
        this.physicsBody.skipPhysics = this.flyingMode
      }
      console.log(`[DEBUG] Flying mode: ${this.flyingMode ? 'ENABLED' : 'DISABLED'}`)
      event.preventDefault()
      return
    }

    switch (event.code) {
      case 'KeyW':
        this.moveForward = true
        break
      case 'KeyS':
        this.moveBackward = true
        break
      case 'KeyA':
        this.moveLeft = true
        break
      case 'KeyD':
        this.moveRight = true
        break
      case 'Space':
        this.jumpPressed = true
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.shiftPressed = true
        break
    }
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!this.inputEnabled) return

    switch (event.code) {
      case 'KeyW':
        this.moveForward = false
        break
      case 'KeyS':
        this.moveBackward = false
        break
      case 'KeyA':
        this.moveLeft = false
        break
      case 'KeyD':
        this.moveRight = false
        break
      case 'Space':
        this.jumpPressed = false
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.shiftPressed = false
        break
    }
  }

  private onWindowBlur = (): void => {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock()
    }
    this.resetMovement()
  }

  private resetMovement(): void {
    this.moveForward = false
    this.moveBackward = false
    this.moveLeft = false
    this.moveRight = false
    this.jumpPressed = false
    this.shiftPressed = false
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled
    if (!enabled) {
      this.resetMovement()
    }
  }

  /**
   * Apply an external knockback impulse to the player.
   * This velocity is added to movement and decays over time.
   */
  applyKnockback(knockback: THREE.Vector3): void {
    this.knockbackVelocity.x += knockback.x
    this.knockbackVelocity.y += knockback.y
    this.knockbackVelocity.z += knockback.z
  }

  update(_deltaTime: number): void {
    // Apply yaw/pitch rotation to the camera
    this.camera.rotation.x = this.pitch
    this.camera.rotation.y = this.yaw
    this.camera.rotation.z = 0

    if (!this.physicsBody || !this.physicsEngine) {
      // Fallback to noclip mode if physics not set
      this.updateNoclip(_deltaTime)
      return
    }

    // Flying mode: bypass physics, move freely
    if (this.flyingMode) {
      this.updateFlying(_deltaTime)
      return
    }

    // Calculate horizontal movement direction based on yaw using pre-allocated vectors
    this.tempDirection.set(0, 0, 0)
    this.tempForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.tempRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    if (this.moveForward) this.tempDirection.add(this.tempForward)
    if (this.moveBackward) this.tempDirection.sub(this.tempForward)
    if (this.moveLeft) this.tempDirection.sub(this.tempRight)
    if (this.moveRight) this.tempDirection.add(this.tempRight)

    // Normalize and apply movement speed to horizontal velocity
    if (this.tempDirection.lengthSq() > 0) {
      this.tempDirection.normalize()
      this.tempDirection.multiplyScalar(this.movementSpeed)
    }

    // Set horizontal velocity = movement + knockback
    this.physicsBody.velocity.x = this.tempDirection.x + this.knockbackVelocity.x
    this.physicsBody.velocity.z = this.tempDirection.z + this.knockbackVelocity.z

    // Apply vertical knockback (added to existing velocity, not replacing it)
    if (this.knockbackVelocity.y !== 0) {
      this.physicsBody.velocity.y += this.knockbackVelocity.y
      this.knockbackVelocity.y = 0 // Vertical knockback is instant impulse
    }

    // Decay horizontal knockback over time
    const decay = FirstPersonCameraControls.KNOCKBACK_DECAY * _deltaTime
    if (Math.abs(this.knockbackVelocity.x) > 0.01) {
      this.knockbackVelocity.x -= Math.sign(this.knockbackVelocity.x) * Math.min(decay, Math.abs(this.knockbackVelocity.x))
    } else {
      this.knockbackVelocity.x = 0
    }
    if (Math.abs(this.knockbackVelocity.z) > 0.01) {
      this.knockbackVelocity.z -= Math.sign(this.knockbackVelocity.z) * Math.min(decay, Math.abs(this.knockbackVelocity.z))
    } else {
      this.knockbackVelocity.z = 0
    }

    // Handle climbing and jumping
    const isClimbing = this.isInClimbableBlock()

    // Set climbing flag so physics engine skips gravity
    this.physicsBody.isClimbing = isClimbing

    if (isClimbing) {
      // Player is on a climbable block (ladder, vine, etc.)
      if (this.jumpPressed) {
        // Climbing up: set upward velocity
        this.physicsBody.velocity.y = CLIMB_VELOCITY
      } else if (this.shiftPressed) {
        // Climbing down: set downward velocity
        this.physicsBody.velocity.y = -CLIMB_VELOCITY
      } else {
        // Not pressing jump or shift: stop in place
        this.physicsBody.velocity.y = 0
      }
    } else if (this.jumpPressed) {
      // Normal jump when on ground
      this.physicsEngine.applyJump(this.physicsBody, JUMP_VELOCITY)
    }

    // Sync camera position with physics body (add eye height)
    // Offset camera forward (-Z) to align view with hitbox center
    this.camera.position.set(
      this.physicsBody.position.x,
      this.physicsBody.position.y + EYE_HEIGHT,
      this.physicsBody.position.z
    )
  }

  /**
   * Debug flying mode - free movement without physics/collision.
   * Space = up, Shift = down, WASD = horizontal movement
   */
  private updateFlying(deltaTime: number): void {
    if (!this.physicsBody) return

    // Calculate movement direction
    this.tempDirection.set(0, 0, 0)
    this.tempForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.tempRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    // Horizontal movement (WASD)
    if (this.moveForward) this.tempDirection.add(this.tempForward)
    if (this.moveBackward) this.tempDirection.sub(this.tempForward)
    if (this.moveLeft) this.tempDirection.sub(this.tempRight)
    if (this.moveRight) this.tempDirection.add(this.tempRight)

    // Vertical movement (Space = up, Shift = down)
    if (this.jumpPressed) this.tempDirection.y += 1
    if (this.shiftPressed) this.tempDirection.y -= 1

    // Normalize and apply flying speed
    if (this.tempDirection.lengthSq() > 0) {
      this.tempDirection.normalize()
      this.tempDirection.multiplyScalar(this.flyingSpeed * deltaTime)
    }

    // Directly update position (bypass physics)
    this.physicsBody.position.x += this.tempDirection.x
    this.physicsBody.position.y += this.tempDirection.y
    this.physicsBody.position.z += this.tempDirection.z

    // Reset velocity so physics doesn't accumulate when we exit flying mode
    this.physicsBody.velocity.set(0, 0, 0)

    // Sync camera position
    this.camera.position.set(
      this.physicsBody.position.x,
      this.physicsBody.position.y + EYE_HEIGHT,
      this.physicsBody.position.z
    )
  }

  /**
   * Fallback noclip movement when physics not connected.
   */
  private updateNoclip(deltaTime: number): void {
    // Use pre-allocated vectors
    this.tempDirection.set(0, 0, 0)
    this.tempForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.tempRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    if (this.moveForward) this.tempDirection.add(this.tempForward)
    if (this.moveBackward) this.tempDirection.sub(this.tempForward)
    if (this.moveLeft) this.tempDirection.sub(this.tempRight)
    if (this.moveRight) this.tempDirection.add(this.tempRight)

    if (this.tempDirection.lengthSq() > 0) {
      this.tempDirection.normalize()
      this.tempDirection.multiplyScalar(this.movementSpeed * deltaTime)
      this.camera.position.add(this.tempDirection)
    }
  }

  /**
   * Check if the player is currently walking (any movement key pressed).
   */
  isWalking(): boolean {
    return this.moveForward || this.moveBackward ||
           this.moveLeft || this.moveRight
  }

  /**
   * Get the current yaw angle (horizontal rotation) in radians.
   * 0 = looking at -Z (north), positive = counter-clockwise
   */
  getYaw(): number {
    return this.yaw
  }

  dispose(): void {
    this.domElement.removeEventListener('click', this.onClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onWindowBlur)
  }
}
