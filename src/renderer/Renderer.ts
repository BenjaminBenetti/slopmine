import * as THREE from 'three'
import { FrustumCuller } from './FrustumCuller.ts'
import { SoftwareOcclusionCuller, type SoftwareOcclusionStats } from './SoftwareOcclusionCuller.ts'
import type { IChunkMesh } from './ChunkMesh.ts'
import type { SubChunkOpacityCache } from './SubChunkOpacityCache.ts'
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
  private readonly softwareOcclusionCuller = new SoftwareOcclusionCuller()
  private chunkMeshSource: (() => Iterable<IChunkMesh>) | null = null
  private opacityCache: SubChunkOpacityCache | null = null
  private graphicsSettings: GraphicsSettings | null = null
  private currentResolutionPreset: ResolutionPreset = 'native'

  // Pre-allocated to avoid per-frame GC pressure
  private readonly tempSize = new THREE.Vector2()
  private readonly renderResolution = { width: 0, height: 0 }

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
   * Enable or disable shadow rendering.
   */
  setShadowsEnabled(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled
    this.renderer.shadowMap.needsUpdate = true
  }

  /**
   * Get the current internal render resolution in pixels.
   */
  getRenderResolution(): { width: number; height: number } {
    this.renderer.getSize(this.tempSize)
    const pixelRatio = this.renderer.getPixelRatio()
    this.renderResolution.width = Math.round(this.tempSize.x * pixelRatio)
    this.renderResolution.height = Math.round(this.tempSize.y * pixelRatio)
    return this.renderResolution
  }

  /**
   * Set the chunk mesh source for frustum culling.
   */
  setChunkMeshSource(source: () => Iterable<IChunkMesh>): void {
    this.chunkMeshSource = source
  }

  /**
   * Set the opacity cache for software occlusion culling.
   */
  setOpacityCache(cache: SubChunkOpacityCache): void {
    this.opacityCache = cache
  }

  /**
   * Get the latest software occlusion culling statistics.
   */
  getOcclusionStats(): SoftwareOcclusionStats {
    return this.softwareOcclusionCuller.getStats()
  }

  /**
   * Get three.js renderer statistics (draw calls, triangles, memory).
   */
  getRendererStats(): { drawCalls: number; triangles: number; geometries: number; textures: number; sceneObjects: number } {
    const info = this.renderer.info
    // Count total objects in scene graph (for debugging updateMatrixWorld performance)
    let sceneObjects = 0
    this.scene.traverse(() => { sceneObjects++ })
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      sceneObjects,
    }
  }

  /**
   * Set graphics settings for configurable rendering options.
   */
  setGraphicsSettings(settings: GraphicsSettings): void {
    this.graphicsSettings = settings
    // Apply the saved resolution preset
    this.setResolution(settings.resolutionPreset)
    // Apply shadow setting
    this.setShadowsEnabled(settings.shadowsEnabled)
  }

  render(): void {
    if (this.chunkMeshSource) {
      const doCulling = !this.graphicsSettings || this.graphicsSettings.cullingEnabled
      if (doCulling) {
        // Step 1: Frustum culling
        this.frustumCuller.updateVisibility(this.camera, this.chunkMeshSource())

        // Step 2: Software occlusion culling (only sub-chunks that passed frustum culling)
        if (this.opacityCache) {
          this.softwareOcclusionCuller.updateVisibility(
            this.camera,
            this.chunkMeshSource(),
            this.opacityCache
          )
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
    this.softwareOcclusionCuller.dispose()
    this.renderer.dispose()
  }

  /**
   * Debug: Analyze scene contents to identify object accumulation.
   * Returns breakdown of object types in the scene.
   */
  debugAnalyzeScene(): { total: number; byType: Record<string, number>; byDepth: Record<number, number> } {
    const byType: Record<string, number> = {}
    const byDepth: Record<number, number> = {}
    let total = 0

    const countObject = (obj: THREE.Object3D, depth: number) => {
      total++
      const type = obj.type || obj.constructor.name
      byType[type] = (byType[type] || 0) + 1
      byDepth[depth] = (byDepth[depth] || 0) + 1

      for (const child of obj.children) {
        countObject(child, depth + 1)
      }
    }

    countObject(this.scene, 0)
    return { total, byType, byDepth }
  }

  /**
   * Debug: Log scene analysis to console.
   */
  debugLogSceneAnalysis(): void {
    const analysis = this.debugAnalyzeScene()
    console.log('=== Scene Analysis ===')
    console.log('Total objects:', analysis.total)
    console.log('By type:', analysis.byType)
    console.log('By depth:', analysis.byDepth)
    console.log('Direct scene children:', this.scene.children.length)
  }
}
