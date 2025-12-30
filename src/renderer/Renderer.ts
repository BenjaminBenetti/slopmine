import * as THREE from 'three'
import { FrustumCuller } from './FrustumCuller.ts'
import type { ChunkMesh } from './ChunkMesh.ts'

export class Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  private readonly frustumCuller = new FrustumCuller()
  private chunkMeshSource: (() => Iterable<ChunkMesh>) | null = null

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

  render(): void {
    if (this.chunkMeshSource) {
      this.frustumCuller.updateVisibility(this.camera, this.chunkMeshSource())
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.renderer.dispose()
  }
}
