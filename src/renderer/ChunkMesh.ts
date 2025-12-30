import * as THREE from 'three'
import type { IChunkCoordinate } from '../world/interfaces/ICoordinates.ts'

/**
 * Manages a single merged mesh for all blocks in a chunk.
 * Combines all visible block faces into one mesh for efficient rendering.
 */
export class ChunkMesh {
  private mesh: THREE.Mesh | null = null
  private readonly group: THREE.Group = new THREE.Group()

  readonly chunkCoordinate: IChunkCoordinate

  constructor(chunkCoordinate: IChunkCoordinate) {
    this.chunkCoordinate = chunkCoordinate
  }

  /**
   * Build the merged mesh from geometry data.
   */
  buildFromGeometry(
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    colors: Float32Array,
    indices: Uint32Array
  ): void {
    // Early exit if no geometry
    if (positions.length === 0 || indices.length === 0) {
      return
    }

    // Create BufferGeometry
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))

    // Create material with vertex colors enabled
    const material = new THREE.MeshLambertMaterial({ 
      vertexColors: true,
      // Smooth shading for better lighting
      flatShading: false,
    })

    // Create mesh
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = true
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true

    this.group.add(this.mesh)
  }

  /**
   * Get the THREE.Group containing the mesh.
   */
  getGroup(): THREE.Group {
    return this.group
  }

  /**
   * Add this chunk mesh to a scene.
   */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.group)
  }

  /**
   * Remove this chunk mesh from a scene.
   */
  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group)
  }

  /**
   * Dispose of all GPU resources.
   */
  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose()
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(m => m.dispose())
      } else {
        this.mesh.material.dispose()
      }
      this.group.remove(this.mesh)
      this.mesh = null
    }
  }

  /**
   * Get the number of triangles in this chunk mesh.
   */
  getTriangleCount(): number {
    if (!this.mesh || !this.mesh.geometry.index) {
      return 0
    }
    return Math.floor(this.mesh.geometry.index.count / 3)
  }
}
