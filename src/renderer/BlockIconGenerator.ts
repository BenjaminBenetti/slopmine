import * as THREE from 'three'
import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { SharedGeometry } from '../world/blocks/Block.ts'

/**
 * Size of generated icons in pixels.
 */
const ICON_SIZE = 128

/**
 * Singleton instance for global access.
 */
let instance: BlockIconGenerator | null = null

/**
 * Generates isometric block icons by rendering blocks to offscreen textures.
 * Icons are cached as data URLs for use in UI elements.
 */
export class BlockIconGenerator {
  private readonly scene: THREE.Scene
  private readonly camera: THREE.OrthographicCamera
  private readonly renderTarget: THREE.WebGLRenderTarget
  private readonly iconCache = new Map<string, string>()
  private readonly ambientLight: THREE.AmbientLight
  private readonly directionalLight: THREE.DirectionalLight

  constructor() {
    // Create isolated scene for icon rendering
    this.scene = new THREE.Scene()

    // Orthographic camera for consistent isometric view
    // Size tuned to frame the rotated block nicely
    const size = 0.85
    this.camera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 10)

    // Classic isometric view: camera positioned to look down at block from corner
    // The angle arctan(1/sqrt(2)) ≈ 35.26° from horizontal gives equal-length edges
    // Position at (1, sqrt(2), 1) normalized gives this classic isometric angle
    const dist = 3
    this.camera.position.set(dist, dist * Math.SQRT2, dist)
    this.camera.lookAt(0, 0, 0)

    // Render target with alpha for transparent background
    this.renderTarget = new THREE.WebGLRenderTarget(ICON_SIZE, ICON_SIZE, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
    })

    // Lighting for depth/shading - bright enough to show block textures clearly
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
    this.scene.add(this.ambientLight)

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    this.directionalLight.position.set(1, 2, 2)
    this.scene.add(this.directionalLight)
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): BlockIconGenerator {
    if (!instance) {
      instance = new BlockIconGenerator()
    }
    return instance
  }

  /**
   * Check if an icon exists for a block.
   */
  hasIcon(blockName: string): boolean {
    return this.iconCache.has(blockName)
  }

  /**
   * Get the cached icon URL for a block.
   * Returns undefined if not yet generated.
   */
  getIcon(blockName: string): string | undefined {
    return this.iconCache.get(blockName)
  }

  /**
   * Generate an icon for a specific block.
   */
  generateIcon(renderer: THREE.WebGLRenderer, blockName: string): string {
    // Check cache first
    const cached = this.iconCache.get(blockName)
    if (cached) {
      return cached
    }

    // Get block from registry
    const block = BlockRegistry.getInstance().getBlockByName(blockName)
    if (!block) {
      console.warn(`BlockIconGenerator: Block "${blockName}" not found`)
      return ''
    }

    // Create mesh with block's materials
    const materials = block.getInstanceMaterial()
    const geometry = block.getInstanceGeometry()
    const mesh = new THREE.Mesh(geometry, materials)

    // No rotation needed - camera is positioned for classic isometric view

    // Add mesh to scene
    this.scene.add(mesh)

    // Save renderer state
    const oldRenderTarget = renderer.getRenderTarget()
    const oldClearColor = renderer.getClearColor(new THREE.Color())
    const oldClearAlpha = renderer.getClearAlpha()

    // Set transparent background
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(this.renderTarget)
    renderer.clear()
    renderer.render(this.scene, this.camera)

    // Read pixels from render target
    const pixels = new Uint8Array(ICON_SIZE * ICON_SIZE * 4)
    renderer.readRenderTargetPixels(
      this.renderTarget,
      0,
      0,
      ICON_SIZE,
      ICON_SIZE,
      pixels
    )

    // Restore renderer state
    renderer.setRenderTarget(oldRenderTarget)
    renderer.setClearColor(oldClearColor, oldClearAlpha)

    // Remove mesh from scene
    this.scene.remove(mesh)

    // Convert to canvas and flip vertically (WebGL renders upside down)
    const canvas = document.createElement('canvas')
    canvas.width = ICON_SIZE
    canvas.height = ICON_SIZE
    const ctx = canvas.getContext('2d')!

    // Create ImageData and flip vertically
    const imageData = ctx.createImageData(ICON_SIZE, ICON_SIZE)
    for (let y = 0; y < ICON_SIZE; y++) {
      const srcRow = (ICON_SIZE - 1 - y) * ICON_SIZE * 4
      const dstRow = y * ICON_SIZE * 4
      for (let x = 0; x < ICON_SIZE * 4; x++) {
        imageData.data[dstRow + x] = pixels[srcRow + x]
      }
    }
    ctx.putImageData(imageData, 0, 0)

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png')
    this.iconCache.set(blockName, dataUrl)

    return dataUrl
  }

  /**
   * Generate icons for all registered blocks.
   * Should be called after blocks are registered and textures are loaded.
   */
  generateAllIcons(renderer: THREE.WebGLRenderer): void {
    const registry = BlockRegistry.getInstance()
    const blockNames = registry.getAllBlockNames()

    for (const blockName of blockNames) {
      // Skip air block
      if (blockName === 'air') {
        continue
      }
      this.generateIcon(renderer, blockName)
    }

    console.log(`BlockIconGenerator: Generated ${this.iconCache.size} block icons`)
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderTarget.dispose()
    instance = null
  }
}
