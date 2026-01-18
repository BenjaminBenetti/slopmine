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

// More dramatic swing for tools (pickaxe, shovel, axe)
const TOOL_SWING_CONFIG: SwingAnimationConfig = {
  duration: 0.45,
  forwardAmplitude: 0.12,
  verticalAmplitude: 0.15,
  rotationAmplitude: Math.PI / 4,
  returnSpeed: 12,
}

/**
 * Eating animation configuration
 */
interface EatingAnimationConfig {
  /** Amount to raise item toward mouth (positive Y) */
  raiseAmplitude: number
  /** Amount to move item toward camera (positive Z) */
  forwardAmplitude: number
  /** Amount to move item left toward center/mouth (negative X) */
  leftAmplitude: number
  /** Tilt angle in radians (X rotation, pitch up toward mouth) */
  tiltAngle: number
  /** Nibble oscillation frequency in Hz */
  bobFrequency: number
  /** Nibble oscillation amplitude */
  bobAmplitude: number
  /** Speed to return to idle position when eating stops */
  returnSpeed: number
}

const EATING_CONFIG: EatingAnimationConfig = {
  raiseAmplitude: 0.15,      // Raise toward mouth
  forwardAmplitude: 0.12,    // Bring closer to face
  leftAmplitude: 0.2,        // Move left toward center/mouth
  tiltAngle: 0.4,            // Tilt up toward mouth (~23 degrees)
  bobFrequency: 2.5,         // Gentle chewing rhythm
  bobAmplitude: 0.015,       // Subtle bite motion
  returnSpeed: 8,
}

/**
 * Determines the type of item for rendering purposes.
 */
function isBlockItem(item: IItem): boolean {
  return item.id.endsWith('_block')
}

function isToolItem(item: IItem): boolean {
  return (
    item.id.endsWith('_pickaxe') ||
    item.id.endsWith('_shovel') ||
    item.id.endsWith('_axe') ||
    item.id.endsWith('_sword') ||
    item.id.endsWith('_hoe')
  )
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

  // Lighting for the overlay scene
  private readonly ambientLight: THREE.AmbientLight
  private readonly directionalLight: THREE.DirectionalLight

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

  // Eating animation state
  private isEating = false
  private eatingPhase = 0
  /** Stores the current eating offset applied to position */
  private readonly eatingOffset = new THREE.Vector3()
  /** Stores the current eating rotation applied to mesh */
  private readonly eatingRotation = new THREE.Euler()
  /** Bite oscillation offset (computed fresh each frame, not accumulated) */
  private currentBiteOffset = 0

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

    // Initialize lights (assigned in setupLighting)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)

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
    this.overlayScene.add(this.ambientLight)

    // Directional light from upper-left-front
    this.directionalLight.position.set(-1, 1, 1)
    this.overlayScene.add(this.directionalLight)
  }

  /**
   * Update lighting intensity based on surrounding block light level.
   * @param level Light level from 0-15 (same as block lighting)
   */
  setLightLevel(level: number): void {
    // Use same brightness formula as block rendering for visual consistency
    const minBrightness = 0.02
    const normalized = level / 15
    const brightness = minBrightness + Math.pow(normalized, 2.2) * (1 - minBrightness)

    // Scale base intensities by brightness
    this.ambientLight.intensity = 0.6 * brightness
    this.directionalLight.intensity = 0.8 * brightness
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
   * Set whether the player is currently eating.
   * Controls the eating animation.
   */
  setEating(eating: boolean): void {
    this.isEating = eating
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
    this.eatingPhase = 0
    this.eatingOffset.set(0, 0, 0)
    this.eatingRotation.set(0, 0, 0)
    this.currentBiteOffset = 0
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

    // Update eating animation
    this.updateEatingAnimation(deltaTime)

    // Compose final position: base + bob + swing + eating + bite
    this.currentMesh.position.set(
      this.basePosition.x + bobX + this.swingOffset.x + this.eatingOffset.x,
      this.basePosition.y + bobY + this.swingOffset.y + this.eatingOffset.y,
      this.basePosition.z + this.swingOffset.z + this.eatingOffset.z + this.currentBiteOffset
    )

    // Compose final rotation: base + swing + eating rotation
    this.currentMesh.rotation.set(
      this.baseRotation.x + this.swingRotation.x + this.eatingRotation.x,
      this.baseRotation.y + this.swingRotation.y + this.eatingRotation.y,
      this.baseRotation.z + this.swingRotation.z + this.eatingRotation.z
    )
  }

  /**
   * Get the swing config for the current item.
   */
  private getSwingConfig(): SwingAnimationConfig {
    if (this.currentItem && isToolItem(this.currentItem)) {
      return TOOL_SWING_CONFIG
    }
    return SWING_CONFIG
  }

  /**
   * Update the swing animation state.
   */
  private updateSwingAnimation(deltaTime: number): void {
    const config = this.getSwingConfig()

    if (this.isMining) {
      // Advance swing phase (loops continuously)
      const swingSpeed = (1 / config.duration) * Math.PI * 2
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
      this.swingOffset.z = forwardProgress * config.forwardAmplitude

      // Vertical arc motion (y-axis): slight downward arc during strike
      // Negative sine so it goes down during the forward swing
      const verticalProgress = -Math.sin(t) * Math.abs(Math.sin(t * 0.5))
      this.swingOffset.y = verticalProgress * config.verticalAmplitude

      // Slight horizontal shift during swing for more natural motion
      this.swingOffset.x = Math.sin(t * 0.5) * 0.01

      // Rotation: tilt the item as if striking
      // X rotation: pitch forward during strike
      this.swingRotation.x = Math.sin(t) * config.rotationAmplitude

      // Z rotation: slight roll for natural wrist motion
      this.swingRotation.z = Math.sin(t * 0.5) * (config.rotationAmplitude * 0.3)
    } else {
      // Not mining - smoothly return to idle
      const returnFactor = 1 - Math.exp(-deltaTime * config.returnSpeed)

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
   * Update the eating animation state.
   */
  private updateEatingAnimation(deltaTime: number): void {
    if (this.isEating) {
      // Smoothly interpolate toward eating position
      const approachSpeed = 6
      const approachFactor = 1 - Math.exp(-deltaTime * approachSpeed)

      // Target position: raised up, moved left, brought toward camera (mouth)
      const targetX = -EATING_CONFIG.leftAmplitude   // Negative = move left toward center
      const targetY = EATING_CONFIG.raiseAmplitude   // Positive = raise up
      const targetZ = EATING_CONFIG.forwardAmplitude // Positive = toward camera

      // Target rotation: tilt food toward mouth
      const targetRotX = -EATING_CONFIG.tiltAngle    // Negative = pitch up toward mouth

      // Smoothly move toward target position
      this.eatingOffset.x += (targetX - this.eatingOffset.x) * approachFactor
      this.eatingOffset.y += (targetY - this.eatingOffset.y) * approachFactor
      this.eatingOffset.z += (targetZ - this.eatingOffset.z) * approachFactor

      // Smoothly rotate toward target
      this.eatingRotation.x += (targetRotX - this.eatingRotation.x) * approachFactor

      // Only add bite motion once mostly in position
      const distanceToTarget = Math.abs(this.eatingOffset.x - targetX) +
                               Math.abs(this.eatingOffset.y - targetY) +
                               Math.abs(this.eatingOffset.z - targetZ)
      if (distanceToTarget < 0.05) {
        // Advance eating phase for bite animation
        const eatingSpeed = EATING_CONFIG.bobFrequency * Math.PI * 2
        this.eatingPhase += deltaTime * eatingSpeed

        // Keep phase in [0, 2π] range
        if (this.eatingPhase > Math.PI * 2) {
          this.eatingPhase -= Math.PI * 2
        }

        // Smooth in-and-out bite motion using sine wave
        // sin gives us -1 to 1, we want 0 to 1 to 0 pattern
        const biteProgress = (Math.sin(this.eatingPhase) + 1) * 0.5
        this.currentBiteOffset = biteProgress * EATING_CONFIG.bobAmplitude
      } else {
        this.currentBiteOffset = 0
      }
    } else {
      // Not eating - smoothly return to idle
      const returnFactor = 1 - Math.exp(-deltaTime * EATING_CONFIG.returnSpeed)

      // Lerp offset back to zero
      this.eatingOffset.x *= 1 - returnFactor
      this.eatingOffset.y *= 1 - returnFactor
      this.eatingOffset.z *= 1 - returnFactor

      // Lerp rotation back to zero
      this.eatingRotation.x *= 1 - returnFactor
      this.eatingRotation.y *= 1 - returnFactor
      this.eatingRotation.z *= 1 - returnFactor

      // Smoothly reduce bite offset
      this.currentBiteOffset *= 1 - returnFactor

      // Reset phase when values are near zero
      const offsetMagnitude = this.eatingOffset.length()
      const rotationMagnitude = Math.abs(this.eatingRotation.x) +
                                Math.abs(this.eatingRotation.y) +
                                Math.abs(this.eatingRotation.z)
      if (offsetMagnitude < 0.001 && rotationMagnitude < 0.001) {
        this.eatingOffset.set(0, 0, 0)
        this.eatingRotation.set(0, 0, 0)
        this.currentBiteOffset = 0
        this.eatingPhase = 0
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
