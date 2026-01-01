import * as THREE from 'three'
import { FrustumCuller } from './FrustumCuller.ts'
import { HorizonCuller } from './HorizonCuller.ts'
import type { ChunkMesh } from './ChunkMesh.ts'
import type { HeightmapCache } from './HeightmapCache.ts'
import type { GraphicsSettings, ResolutionPreset } from '../settings/index.ts'

const RESOLUTION_PRESETS: Record<Exclude<ResolutionPreset, 'native'>, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  private readonly frustumCuller = new FrustumCuller()
  private readonly horizonCuller = new HorizonCuller()
  private chunkMeshSource: (() => Iterable<ChunkMesh>) | null = null
  private heightmapCache: HeightmapCache | null = null
  private graphicsSettings: GraphicsSettings | null = null
  private currentResolutionPreset: ResolutionPreset = 'native'

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)

    // Enable shadow mapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    document.body.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    // Background is handled by Skybox - no solid color needed

    this.camera = new THREE.PerspectiveCamera(
      100,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.position.z = 5

    window.addEventListener('resize', this.onResize)
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.applyResolution()
  }

  /**
   * Calculate the pixel ratio for a given resolution preset.
   */
  private getPixelRatioForPreset(preset: ResolutionPreset): number {
    if (preset === 'native') {
      return window.devicePixelRatio
    }

    const target = RESOLUTION_PRESETS[preset]
    // Calculate pixel ratio needed to achieve target resolution
    const ratioForWidth = target.width / window.innerWidth
    const ratioForHeight = target.height / window.innerHeight
    // Use smaller ratio to fit within target, never exceed native
    return Math.min(ratioForWidth, ratioForHeight, window.devicePixelRatio)
  }

  /**
   * Apply the current resolution preset to the renderer.
   */
  private applyResolution(): void {
    const pixelRatio = this.getPixelRatioForPreset(this.currentResolutionPreset)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  /**
   * Update the rendering resolution preset.
   */
  setResolution(preset: ResolutionPreset): void {
    this.currentResolutionPreset = preset
    this.applyResolution()
  }

  /**
   * Get the current internal render resolution in pixels.
   */
  getRenderResolution(): { width: number; height: number } {
    const size = this.renderer.getSize(new THREE.Vector2())
    const pixelRatio = this.renderer.getPixelRatio()
    return {
      width: Math.round(size.x * pixelRatio),
      height: Math.round(size.y * pixelRatio),
    }
  }

  /**
   * Set the chunk mesh source for frustum culling.
   */
  setChunkMeshSource(source: () => Iterable<ChunkMesh>): void {
    this.chunkMeshSource = source
  }

  /**
   * Set the heightmap cache for horizon culling.
   */
  setHeightmapCache(cache: HeightmapCache): void {
    this.heightmapCache = cache
  }

  /**
   * Set graphics settings for configurable rendering options.
   */
  setGraphicsSettings(settings: GraphicsSettings): void {
    this.graphicsSettings = settings
    // Apply the saved resolution preset
    this.setResolution(settings.resolutionPreset)
  }

  render(): void {
    if (this.chunkMeshSource) {
      const doCulling = !this.graphicsSettings || this.graphicsSettings.cullingEnabled
      if (doCulling) {
        // Step 1: Frustum culling
        this.frustumCuller.updateVisibility(this.camera, this.chunkMeshSource())

        // Step 2: Horizon culling (only chunks that passed frustum culling)
        if (this.heightmapCache) {
          this.horizonCuller.updateVisibility(this.camera, this.chunkMeshSource(), this.heightmapCache)
        }
      } else {
        // Culling disabled - make all chunks visible
        for (const chunkMesh of this.chunkMeshSource()) {
          chunkMesh.getGroup().visible = true
        }
      }
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.renderer.dispose()
  }
}
