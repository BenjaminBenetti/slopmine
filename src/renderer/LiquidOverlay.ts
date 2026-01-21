import * as THREE from 'three'
import type { WorldManager } from '../world/index.ts'

/**
 * Types of liquid families that can be detected
 */
export type LiquidFamily = 'water' | 'lava' | 'swamp_water'

/**
 * Configuration for liquid overlay colors, opacity, and fog
 */
interface LiquidOverlayConfig {
  color: number
  opacity: number
  fogDensity: number // Exponential fog density (higher = thicker fog)
}

/**
 * Pre-defined colors and fog settings matching liquid textures
 */
const LIQUID_CONFIGS: Record<LiquidFamily, LiquidOverlayConfig> = {
  water: { color: 0x1a4a7a, opacity: 0.5, fogDensity: 0.04 },        // Deep blue, moderate visibility
  lava: { color: 0xff4400, opacity: 0.6, fogDensity: 0.12 },         // Orange-red, very thick
  swamp_water: { color: 0x2a4a2a, opacity: 0.55, fogDensity: 0.06 }, // Murky green, reduced visibility
}

/**
 * Lava pulsing animation configuration
 */
const LAVA_PULSE_SPEED = 2.5 // Hz
const LAVA_PULSE_MIN_OPACITY = 0.5
const LAVA_PULSE_MAX_OPACITY = 0.7

/**
 * Renders a full-screen color tint overlay when the camera is inside a liquid block.
 * Also applies distance fog to the main scene for underwater haze effect.
 *
 * Uses a separate overlay scene that renders on top of the main world,
 * similar to the HeldItemRenderer pattern.
 */
export class LiquidOverlay {
  private readonly overlayScene: THREE.Scene
  private readonly overlayCamera: THREE.OrthographicCamera
  private readonly mainRenderer: THREE.WebGLRenderer
  private readonly mainScene: THREE.Scene

  // Full-screen quad with transparent material
  private readonly overlayMesh: THREE.Mesh
  private readonly material: THREE.MeshBasicMaterial

  // Fog state
  private readonly liquidFog: THREE.FogExp2
  private originalFog: THREE.Fog | THREE.FogExp2 | null = null

  // Current state
  private currentLiquidFamily: LiquidFamily | null = null
  private pulsePhase = 0

  constructor(mainRenderer: THREE.WebGLRenderer, mainScene: THREE.Scene) {
    this.mainRenderer = mainRenderer
    this.mainScene = mainScene

    // Create overlay scene
    this.overlayScene = new THREE.Scene()

    // Create orthographic camera (-1 to 1 in all axes)
    this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // Create full-screen quad (2x2 fills the -1 to 1 NDC space)
    const geometry = new THREE.PlaneGeometry(2, 2)

    // Create transparent material
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })

    this.overlayMesh = new THREE.Mesh(geometry, this.material)
    this.overlayScene.add(this.overlayMesh)

    // Create reusable fog object (color and density updated when entering liquid)
    this.liquidFog = new THREE.FogExp2(0x000000, 0)
  }

  /**
   * Update the overlay based on camera position.
   * Detects if camera is inside a liquid block and updates the tint accordingly.
   */
  update(cameraPosition: THREE.Vector3, world: WorldManager, deltaTime: number): void {
    // Convert camera position to bigint world coordinates
    const x = BigInt(Math.floor(cameraPosition.x))
    const y = BigInt(Math.floor(cameraPosition.y))
    const z = BigInt(Math.floor(cameraPosition.z))

    // Get block at camera position
    const block = world.getBlock(x, y, z)

    // Check if block is a liquid with a known family
    let liquidFamily: LiquidFamily | null = null
    if (block.properties.isLiquid && block.properties.liquidFamily) {
      const family = block.properties.liquidFamily
      if (family === 'water' || family === 'lava' || family === 'swamp_water') {
        liquidFamily = family
      }
    }

    // Update state when liquid type changes
    if (liquidFamily !== this.currentLiquidFamily) {
      const wasInLiquid = this.currentLiquidFamily !== null
      this.currentLiquidFamily = liquidFamily

      if (liquidFamily) {
        // Apply liquid color and fog
        const config = LIQUID_CONFIGS[liquidFamily]
        this.material.color.setHex(config.color)
        this.material.opacity = config.opacity

        // Apply fog to main scene
        if (!wasInLiquid) {
          // Store original fog before replacing
          this.originalFog = this.mainScene.fog
        }
        this.liquidFog.color.setHex(config.color)
        this.liquidFog.density = config.fogDensity
        this.mainScene.fog = this.liquidFog
      } else {
        // No liquid - make transparent and restore original fog
        this.material.opacity = 0
        this.mainScene.fog = this.originalFog
        this.originalFog = null
      }

      // Reset pulse phase when entering lava
      if (liquidFamily === 'lava') {
        this.pulsePhase = 0
      }
    }

    // Animate lava opacity with pulsing effect
    if (this.currentLiquidFamily === 'lava') {
      this.pulsePhase += deltaTime * LAVA_PULSE_SPEED * Math.PI * 2

      // Keep phase bounded
      if (this.pulsePhase > Math.PI * 2) {
        this.pulsePhase -= Math.PI * 2
      }

      // Sinusoidal pulse between min and max opacity
      const t = (Math.sin(this.pulsePhase) + 1) * 0.5 // 0 to 1
      this.material.opacity = LAVA_PULSE_MIN_OPACITY + t * (LAVA_PULSE_MAX_OPACITY - LAVA_PULSE_MIN_OPACITY)
    }
  }

  /**
   * Render the liquid overlay.
   * Should be called after the main scene and held item render.
   */
  render(): void {
    // Skip if no overlay active
    if (this.material.opacity === 0) {
      return
    }

    // Disable auto-clearing to preserve the main scene
    const autoClear = this.mainRenderer.autoClear
    this.mainRenderer.autoClear = false

    // Render overlay scene (no depth clear needed since depth test is disabled)
    this.mainRenderer.render(this.overlayScene, this.overlayCamera)

    // Restore auto-clear setting
    this.mainRenderer.autoClear = autoClear
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    // Restore original fog if we're in a liquid
    if (this.currentLiquidFamily !== null) {
      this.mainScene.fog = this.originalFog
    }

    this.overlayMesh.geometry.dispose()
    this.material.dispose()

    // Clear scene
    this.overlayScene.remove(this.overlayMesh)
  }
}
