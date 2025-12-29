import * as THREE from 'three'

export interface FirstPersonCameraControlOptions {
  movementSpeed?: number
  lookSensitivity?: number
}

export interface CameraControls {
  update(deltaTime: number): void
  dispose(): void
}

/**
 * First-person "noclip" style camera controller.
 * - WASD for horizontal movement
 * - Space / Shift for vertical movement
 * - Mouse look with pointer lock
 */
export class FirstPersonCameraControls implements CameraControls {
  private readonly camera: THREE.PerspectiveCamera
  private readonly domElement: HTMLElement
  private readonly movementSpeed: number
  private readonly lookSensitivity: number

  private yaw = 0
  private pitch = 0

  private moveForward = false
  private moveBackward = false
  private moveLeft = false
  private moveRight = false
  private moveUp = false
  private moveDown = false

  private pointerLocked = false

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
    if (!this.pointerLocked) return

    const movementX = event.movementX || 0
    const movementY = event.movementY || 0

    this.yaw -= movementX * this.lookSensitivity
    this.pitch -= movementY * this.lookSensitivity

    const pitchLimit = Math.PI / 2
    if (this.pitch < -pitchLimit) this.pitch = -pitchLimit
    if (this.pitch > pitchLimit) this.pitch = pitchLimit
  }

  private onKeyDown = (event: KeyboardEvent): void => {
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
        this.moveUp = true
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = true
        break
    }
  }

  private onKeyUp = (event: KeyboardEvent): void => {
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
        this.moveUp = false
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = false
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
    this.moveUp = false
    this.moveDown = false
  }

  update(deltaTime: number): void {
    // Apply yaw/pitch rotation to the camera
    this.camera.rotation.x = this.pitch
    this.camera.rotation.y = this.yaw
    this.camera.rotation.z = 0

    const direction = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()

    // Forward/right based on yaw (horizontal rotation only)
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    if (this.moveForward) direction.add(forward)
    if (this.moveBackward) direction.sub(forward)
    if (this.moveLeft) direction.sub(right)
    if (this.moveRight) direction.add(right)
    if (this.moveUp) direction.y += 1
    if (this.moveDown) direction.y -= 1

    if (direction.lengthSq() > 0) {
      direction.normalize()
      direction.multiplyScalar(this.movementSpeed * deltaTime)
      this.camera.position.add(direction)
    }
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

