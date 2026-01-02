import * as THREE from 'three'
import type { IItem } from '../../items/Item.ts'
import { createHandMesh } from './meshes/HandMesh.ts'
import { createToolMesh } from './meshes/ToolMesh.ts'
import { createBlockMesh } from './meshes/BlockMesh.ts'

/**
 * Configuration for the held item renderer
 */
export interface HeldItemRendererConfig {
  /** Offset from camera center (x = right, y = up, z = forward) */
  handOffset: THREE.Vector3
  /** Bob amplitude when walking */
  bobAmplitude: number
  /** Bob frequency in Hz */
  bobFrequency: number
}

const DEFAULT_CONFIG: HeldItemRendererConfig = {
  handOffset: new THREE.Vector3(0.52, -0.45, -0.35),
  bobAmplitude: 0.015,
  bobFrequency: 2.0,
}

/**
 * Swing animation configuration
 */
interface SwingAnimationConfig {
  /** Duration of one complete swing cycle in seconds */
  duration: number
  /** Forward/backward arc amplitude */
  forwardAmplitude: number
  /** Up/down arc amplitude */
  verticalAmplitude: number
  /** Rotation amplitude in radians */
  rotationAmplitude: number
  /** Speed to return to idle position when mining stops */
  returnSpeed: number
}

const SWING_CONFIG: SwingAnimationConfig = {
  duration: 0.35,
  forwardAmplitude: 0.04,
  verticalAmplitude: 0.03,
  rotationAmplitude: Math.PI / 16,
  returnSpeed: 10,
}

/**
 * Determines the type of item for rendering purposes.
 */
function isBlockItem(item: IItem): boolean {
  return item.id.endsWith('_block')
}

/**
 * Renders the currently held item in the player's hand.
 *
 * Uses a separate overlay scene that renders on top of the main world,
 * ensuring the held item is always visible and doesn't clip with terrain.
 */
export class HeldItemRenderer {
  private readonly overlayScene: THREE.Scene
  private readonly overlayCamera: THREE.PerspectiveCamera
  private readonly mainRenderer: THREE.WebGLRenderer

  private currentMesh: THREE.Object3D | null = null
  private currentItem: IItem | null = null

  private isWalking = false
  private bobPhase = 0

  // Swing animation state
  private isMining = false
  private swingPhase = 0
  /** Stores the current swing offset applied to position */
  private readonly swingOffset = new THREE.Vector3()
  /** Stores the current swing rotation applied to mesh */
  private readonly swingRotation = new THREE.Euler()
  /** Base rotation of the mesh (saved when setting item) */
  private readonly baseRotation = new THREE.Euler()

  private readonly config: HeldItemRendererConfig
  private readonly basePosition: THREE.Vector3

  constructor(
    mainRenderer: THREE.WebGLRenderer,
    mainCamera: THREE.PerspectiveCamera,
    config?: Partial<HeldItemRendererConfig>
  ) {
    this.mainRenderer = mainRenderer
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.basePosition = this.config.handOffset.clone()

    // Create overlay scene
    this.overlayScene = new THREE.Scene()

    // Create overlay camera matching main camera's FOV
    this.overlayCamera = new THREE.PerspectiveCamera(
      mainCamera.fov,
      mainCamera.aspect,
      0.01,
      10
    )
    this.overlayCamera.position.set(0, 0, 0)

    // Add lighting to overlay scene
    this.setupLighting()

    // Handle window resize
    this.onResize = this.onResize.bind(this)
    window.addEventListener('resize', this.onResize)

    // Show empty hand by default
    this.setItem(null)
  }

  /**
   * Set up lighting for the overlay scene.
   * Uses ambient + directional light for good visibility.
   */
  private setupLighting(): void {
    // Ambient light for base visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.overlayScene.add(ambient)

    // Directional light from upper-left-front
    const directional = new THREE.DirectionalLight(0xffffff, 0.8)
    directional.position.set(-1, 1, 1)
    this.overlayScene.add(directional)
  }

  /**
   * Handle window resize - update overlay camera aspect ratio.
   */
  private onResize(): void {
    const canvas = this.mainRenderer.domElement
    this.overlayCamera.aspect = canvas.clientWidth / canvas.clientHeight
    this.overlayCamera.updateProjectionMatrix()
  }

  /**
   * Set whether the player is currently walking.
   * Controls the bob animation.
   */
  setWalking(walking: boolean): void {
    this.isWalking = walking
  }

  /**
   * Set whether the player is currently mining.
   * Controls the swing animation.
   */
  setMining(mining: boolean): void {
    this.isMining = mining
  }

  /**
   * Set the currently held item.
   * Updates the rendered mesh accordingly.
   */
  setItem(item: IItem | null): void {
    // Remove current mesh if exists
    if (this.currentMesh) {
      this.overlayScene.remove(this.currentMesh)
      this.disposeMesh(this.currentMesh)
      this.currentMesh = null
    }

    this.currentItem = item

    // Create appropriate mesh
    let mesh: THREE.Object3D

    if (!item) {
      // Empty slot - show hand
      mesh = createHandMesh()
    } else if (isBlockItem(item)) {
      // Block item - show 3D cube
      mesh = createBlockMesh(item)
    } else {
      // Tool/other item - show flat plane
      mesh = createToolMesh(item)
    }

    // Position mesh
    mesh.position.copy(this.basePosition)

    // Save base rotation for swing animation to layer on top
    this.baseRotation.copy(mesh.rotation)

    this.currentMesh = mesh
    this.overlayScene.add(mesh)

    // Reset animation phases when switching items
    this.bobPhase = 0
    this.swingPhase = 0
    this.swingOffset.set(0, 0, 0)
    this.swingRotation.set(0, 0, 0)
  }

  /**
   * Update animation (walking bob + mining swing).
   */
  update(deltaTime: number): void {
    if (!this.currentMesh) return

    // Calculate bob offset
    let bobX = 0
    let bobY = 0

    if (this.isWalking) {
      // Advance bob phase
      this.bobPhase += deltaTime * this.config.bobFrequency * Math.PI * 2

      // Calculate bob offset (up/down sinusoidal motion)
      bobY = Math.sin(this.bobPhase) * this.config.bobAmplitude

      // Also add slight horizontal sway
      bobX = Math.sin(this.bobPhase * 0.5) * this.config.bobAmplitude * 0.3
    } else {
      // Decay bob phase for smooth stop
      if (this.bobPhase > 0) {
        this.bobPhase *= 0.9
        if (this.bobPhase < 0.01) {
          this.bobPhase = 0
        }
      }
    }

    // Update swing animation
    this.updateSwingAnimation(deltaTime)

    // Compose final position: base + bob + swing
    this.currentMesh.position.set(
      this.basePosition.x + bobX + this.swingOffset.x,
      this.basePosition.y + bobY + this.swingOffset.y,
      this.basePosition.z + this.swingOffset.z
    )

    // Compose final rotation: base + swing rotation
    this.currentMesh.rotation.set(
      this.baseRotation.x + this.swingRotation.x,
      this.baseRotation.y + this.swingRotation.y,
      this.baseRotation.z + this.swingRotation.z
    )
  }

  /**
   * Update the swing animation state.
   */
  private updateSwingAnimation(deltaTime: number): void {
    if (this.isMining) {
      // Advance swing phase (loops continuously)
      const swingSpeed = (1 / SWING_CONFIG.duration) * Math.PI * 2
      this.swingPhase += deltaTime * swingSpeed

      // Keep phase in [0, 2π] range to prevent float overflow
      if (this.swingPhase > Math.PI * 2) {
        this.swingPhase -= Math.PI * 2
      }

      // Calculate swing using a smooth arc motion
      // Phase 0 -> π: swing forward and down (striking)
      // Phase π -> 2π: return back up (recovery)
      const t = this.swingPhase

      // Forward/backward motion (z-axis): moves toward target then back
      // Uses a modified sine that peaks at the strike point
      const forwardProgress = Math.sin(t)
      this.swingOffset.z = forwardProgress * SWING_CONFIG.forwardAmplitude

      // Vertical arc motion (y-axis): slight downward arc during strike
      // Negative sine so it goes down during the forward swing
      const verticalProgress = -Math.sin(t) * Math.abs(Math.sin(t * 0.5))
      this.swingOffset.y = verticalProgress * SWING_CONFIG.verticalAmplitude

      // Slight horizontal shift during swing for more natural motion
      this.swingOffset.x = Math.sin(t * 0.5) * 0.01

      // Rotation: tilt the item as if striking
      // X rotation: pitch forward during strike
      this.swingRotation.x = Math.sin(t) * SWING_CONFIG.rotationAmplitude

      // Z rotation: slight roll for natural wrist motion
      this.swingRotation.z = Math.sin(t * 0.5) * (SWING_CONFIG.rotationAmplitude * 0.3)
    } else {
      // Not mining - smoothly return to idle
      const returnFactor = 1 - Math.exp(-deltaTime * SWING_CONFIG.returnSpeed)

      // Lerp offset back to zero
      this.swingOffset.x *= 1 - returnFactor
      this.swingOffset.y *= 1 - returnFactor
      this.swingOffset.z *= 1 - returnFactor

      // Lerp rotation back to zero
      this.swingRotation.x *= 1 - returnFactor
      this.swingRotation.y *= 1 - returnFactor
      this.swingRotation.z *= 1 - returnFactor

      // Reset phase when values are near zero
      const offsetMagnitude = this.swingOffset.length()
      if (offsetMagnitude < 0.001) {
        this.swingOffset.set(0, 0, 0)
        this.swingRotation.set(0, 0, 0)
        this.swingPhase = 0
      }
    }
  }

  /**
   * Render the held item overlay.
   * Should be called after the main scene render.
   */
  render(): void {
    // Disable auto-clearing to preserve the main scene
    const autoClear = this.mainRenderer.autoClear
    this.mainRenderer.autoClear = false

    // Clear only depth buffer so held item renders on top
    this.mainRenderer.clearDepth()

    // Render overlay scene
    this.mainRenderer.render(this.overlayScene, this.overlayCamera)

    // Restore auto-clear setting
    this.mainRenderer.autoClear = autoClear
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    window.removeEventListener('resize', this.onResize)

    if (this.currentMesh) {
      this.overlayScene.remove(this.currentMesh)
      this.disposeMesh(this.currentMesh)
      this.currentMesh = null
    }

    // Clear scene
    while (this.overlayScene.children.length > 0) {
      this.overlayScene.remove(this.overlayScene.children[0])
    }
  }

  /**
   * Dispose mesh and its children recursively.
   */
  private disposeMesh(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose()
      if (Array.isArray(object.material)) {
        object.material.forEach(m => m.dispose())
      } else if (object.material) {
        object.material.dispose()
      }
    }

    object.children.forEach(child => this.disposeMesh(child))
  }
}
