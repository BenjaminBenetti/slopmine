import * as THREE from 'three'
import type { WorldManager } from '../world/index.ts'
import type { DistanceFog, FogOverride } from './DistanceFog.ts'
import { lightLevelsToColor } from './lightCurve.ts'
import { getWorldDaylight, getWorldLightFloor } from './worldLightShader.ts'

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
  fogHaze: number // Distance (blocks) at which the fog hides 63% (exponential)
  fogFar: number // Distance (blocks) beyond which everything is fog color
}

/**
 * Pre-defined colors and fog settings matching liquid textures
 */
const LIQUID_CONFIGS: Record<LiquidFamily, LiquidOverlayConfig> = {
  water: { color: 0x1a4a7a, opacity: 0.5, fogHaze: 16, fogFar: 40 },        // Deep blue, moderate visibility
  lava: { color: 0xff4400, opacity: 0.6, fogHaze: 3, fogFar: 12 },          // Orange-red, very thick
  swamp_water: { color: 0x2a4a2a, opacity: 0.55, fogHaze: 10, fogFar: 28 }, // Murky green, reduced visibility
}

/** Pre-built fog overrides per liquid family (colors converted once). */
const LIQUID_FOG: Record<LiquidFamily, FogOverride> = {
  water: toFogOverride(LIQUID_CONFIGS.water),
  lava: toFogOverride(LIQUID_CONFIGS.lava),
  swamp_water: toFogOverride(LIQUID_CONFIGS.swamp_water),
}

function toFogOverride(config: LiquidOverlayConfig): FogOverride {
  return { color: new THREE.Color(config.color), haze: config.fogHaze, far: config.fogFar }
}

/** Liquids whose haze is light scattered from outside (lava glows by itself). */
const LIT_FAMILIES: ReadonlySet<LiquidFamily> = new Set(['water', 'swamp_water'])

/** How far up (blocks) to look for the liquid's surface above the camera. */
const SURFACE_SCAN_LIMIT = 48

/**
 * Lava pulsing animation configuration
 */
const LAVA_PULSE_SPEED = 2.5 // Hz
const LAVA_PULSE_MIN_OPACITY = 0.5
const LAVA_PULSE_MAX_OPACITY = 0.7

/**
 * Renders a full-screen color tint overlay when the camera is inside a liquid block.
 * Also overrides the scene's distance fog with a short liquid-colored fog for
 * the underwater haze effect (the persistent fog object is only re-parameterized,
 * never swapped, so no materials recompile on entering/leaving liquid).
 *
 * Uses a separate overlay scene that renders on top of the main world,
 * similar to the HeldItemRenderer pattern.
 */
export class LiquidOverlay {
  private readonly overlayScene: THREE.Scene
  private readonly overlayCamera: THREE.OrthographicCamera
  private readonly mainRenderer: THREE.WebGLRenderer
  private readonly distanceFog: DistanceFog

  // Full-screen quad with transparent material
  private readonly overlayMesh: THREE.Mesh
  private readonly material: THREE.MeshBasicMaterial

  // Current state
  private currentLiquidFamily: LiquidFamily | null = null
  private pulsePhase = 0

  /**
   * Fog override for water and swamp water, its color (and the overlay's)
   * scaled every frame by the light the liquid receives (see applyLiquidLight)
   */
  private readonly litFog: { color: THREE.Color; haze: number; far: number } = { color: new THREE.Color(), haze: 0, far: 0 }
  private readonly baseOverlayColor = new THREE.Color()
  private readonly cameraLight = { r: 1, g: 1, b: 1 }
  private readonly surfaceLight = { r: 1, g: 1, b: 1 }

  constructor(mainRenderer: THREE.WebGLRenderer, distanceFog: DistanceFog) {
    this.mainRenderer = mainRenderer
    this.distanceFog = distanceFog

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
      this.currentLiquidFamily = liquidFamily

      if (liquidFamily) {
        // Apply liquid color and fog
        const config = LIQUID_CONFIGS[liquidFamily]
        this.baseOverlayColor.setHex(config.color)
        this.material.color.copy(this.baseOverlayColor)
        this.material.opacity = config.opacity
        if (LIT_FAMILIES.has(liquidFamily)) {
          const fog = LIQUID_FOG[liquidFamily]
          this.litFog.color.copy(fog.color)
          this.litFog.haze = fog.haze
          this.litFog.far = fog.far
          this.distanceFog.setOverride(this.litFog)
        } else {
          this.distanceFog.setOverride(LIQUID_FOG[liquidFamily])
        }
      } else {
        // No liquid - make transparent and restore the distance fog
        this.material.opacity = 0
        this.distanceFog.setOverride(null)
      }

      // Reset pulse phase when entering lava
      if (liquidFamily === 'lava') {
        this.pulsePhase = 0
      }
    }

    if (this.currentLiquidFamily && LIT_FAMILIES.has(this.currentLiquidFamily)) {
      this.applyLiquidLight(cameraPosition, world, this.currentLiquidFamily)
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
   * Scale the underwater haze and tint by the light the liquid receives, with
   * the world light model (sky light × daylight, warm block light, floor):
   * the haze is light scattered in the water, so a flooded cave pocket at
   * light 0 stays as dark as the cave around it instead of glowing blue or
   * green. The light is the brighter of the camera's cell and the liquid's
   * surface above it (the cell over the topmost liquid cell) - water dims
   * sky light by a level per block, but a daylight lake is lit from its
   * surface and keeps its full haze at any depth.
   */
  private applyLiquidLight(cameraPosition: THREE.Vector3, world: WorldManager, family: LiquidFamily): void {
    const x = Math.floor(cameraPosition.x)
    const y = Math.floor(cameraPosition.y)
    const z = Math.floor(cameraPosition.z)
    let surfaceY = y + 1
    while (surfaceY < y + SURFACE_SCAN_LIMIT && world.getBlockFast(x, surfaceY, z).properties.liquidFamily === family) {
      surfaceY++
    }
    const daylight = getWorldDaylight()
    const floor = getWorldLightFloor()
    const camera = world.getPackedLightFast(x, y, z)
    const surface = world.getPackedLightFast(x, surfaceY, z)
    lightLevelsToColor(camera >> 4, camera & 15, daylight, this.cameraLight, floor)
    lightLevelsToColor(surface >> 4, surface & 15, daylight, this.surfaceLight, floor)
    const r = Math.min(1, Math.max(this.cameraLight.r, this.surfaceLight.r))
    const g = Math.min(1, Math.max(this.cameraLight.g, this.surfaceLight.g))
    const b = Math.min(1, Math.max(this.cameraLight.b, this.surfaceLight.b))
    const base = LIQUID_FOG[family].color
    this.litFog.color.setRGB(base.r * r, base.g * g, base.b * b)
    this.material.color.setRGB(this.baseOverlayColor.r * r, this.baseOverlayColor.g * g, this.baseOverlayColor.b * b)
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
    // Restore the distance fog if we're in a liquid
    if (this.currentLiquidFamily !== null) {
      this.distanceFog.setOverride(null)
    }

    this.overlayMesh.geometry.dispose()
    this.material.dispose()

    // Clear scene
    this.overlayScene.remove(this.overlayMesh)
  }
}
