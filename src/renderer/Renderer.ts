import * as THREE from 'three'
import { FrustumCuller } from './FrustumCuller.ts'
import { OcclusionCuller } from './OcclusionCuller.ts'
import type { ChunkMesh } from './ChunkMesh.ts'

export class Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  private readonly frustumCuller = new FrustumCuller()
  private readonly occlusionCuller = new OcclusionCuller()
  private chunkMeshSource: (() => Iterable<ChunkMesh>) | null = null
  private occlusionCullingEnabled = true // Enabled with very conservative settings

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
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  /**
   * Set the chunk mesh source for frustum culling.
   */
  setChunkMeshSource(source: () => Iterable<ChunkMesh>): void {
    this.chunkMeshSource = source
  }

  /**
   * Enable or disable occlusion culling.
   * Occlusion culling uses raycasting to hide chunks blocked by other chunks.
   */
  setOcclusionCullingEnabled(enabled: boolean): void {
    this.occlusionCullingEnabled = enabled
    if (!enabled) {
      // Clear cached data when disabling
      this.occlusionCuller.clearAllCaches()
    }
  }

  render(): void {
    if (this.chunkMeshSource) {
      // First apply frustum culling (fast, eliminates off-screen chunks)
      this.frustumCuller.updateVisibility(this.camera, this.chunkMeshSource())
      
      // Then apply occlusion culling (more expensive, but only on visible chunks)
      if (this.occlusionCullingEnabled) {
        this.occlusionCuller.updateVisibility(this.camera, this.chunkMeshSource())
      }
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.renderer.dispose()
  }
}
