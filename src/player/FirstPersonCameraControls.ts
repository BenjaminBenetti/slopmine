import * as THREE from 'three'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { PhysicsEngine } from '../physics/PhysicsEngine.ts'
import { EYE_HEIGHT, JUMP_VELOCITY } from '../physics/constants.ts'

export interface FirstPersonCameraControlOptions {
  movementSpeed?: number
  lookSensitivity?: number
}

export interface CameraControls {
  update(deltaTime: number): void
  dispose(): void
  setInputEnabled(enabled: boolean): void
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

  private pointerLocked = false

  // Physics references
  private physicsBody: IPhysicsBody | null = null
  private physicsEngine: PhysicsEngine | null = null

  // Pre-allocated vectors to avoid per-frame GC pressure
  private readonly tempDirection = new THREE.Vector3()
  private readonly tempForward = new THREE.Vector3()
  private readonly tempRight = new THREE.Vector3()

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
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled
    if (!enabled) {
      this.resetMovement()
    }
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

    // Set horizontal velocity (physics handles vertical via gravity)
    this.physicsBody.velocity.x = this.tempDirection.x
    this.physicsBody.velocity.z = this.tempDirection.z

    // Handle jump
    if (this.jumpPressed) {
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

  dispose(): void {
    this.domElement.removeEventListener('click', this.onClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onWindowBlur)
  }
}
