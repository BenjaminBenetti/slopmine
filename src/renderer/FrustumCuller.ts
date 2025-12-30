import * as THREE from 'three'
import type { ChunkMesh } from './ChunkMesh.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'

/**
 * Performs chunk-level frustum culling to skip rendering chunks outside the camera view.
 * More efficient than per-mesh frustum culling because we skip entire chunk groups
 * before THREE.js traverses their children.
 */
export class FrustumCuller {
  private readonly frustum = new THREE.Frustum()
  private readonly projScreenMatrix = new THREE.Matrix4()
  private readonly chunkBoxCache = new Map<ChunkMesh, THREE.Box3>()

  /**
   * Update chunk visibility based on camera frustum.
   * Call this before each render.
   */
  updateVisibility(camera: THREE.PerspectiveCamera, chunkMeshes: Iterable<ChunkMesh>): void {
    // Build frustum from camera matrices
    camera.updateMatrixWorld()
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix)

    for (const chunkMesh of chunkMeshes) {
      const bbox = this.getChunkBoundingBox(chunkMesh)
      chunkMesh.getGroup().visible = this.frustum.intersectsBox(bbox)
    }
  }

  /**
   * Calculate the world-space bounding box for a chunk based on its actual geometry.
   * Uses cached box for performance, computing from mesh data on first access.
   */
  private getChunkBoundingBox(chunkMesh: ChunkMesh): THREE.Box3 {
    let box = this.chunkBoxCache.get(chunkMesh)
    
    if (!box) {
      const group = chunkMesh.getGroup()
      box = new THREE.Box3()
      
      // Update world matrices to ensure accurate bounds
      group.updateMatrixWorld(true)
      
      // Compute box from actual geometry
      if (group.children.length > 0) {
        box.setFromObject(group)
      } else {
        // Fallback if no children - use full chunk bounds
        const coord = chunkMesh.chunkCoordinate
        const worldX = Number(coord.x) * CHUNK_SIZE_X
        const worldZ = Number(coord.z) * CHUNK_SIZE_Z
        
        box.min.set(worldX, 0, worldZ)
        box.max.set(worldX + CHUNK_SIZE_X, CHUNK_HEIGHT, worldZ + CHUNK_SIZE_Z)
      }
      
      this.chunkBoxCache.set(chunkMesh, box)
    }
    
    // Return a clone to prevent external mutations from affecting the cache
    return box.clone()
  }

  /**
   * Clear cached bounding box for a chunk (call when chunk is updated/removed).
   */
  clearCache(chunk: ChunkMesh): void {
    this.chunkBoxCache.delete(chunk)
  }

  /**
   * Clear all cached bounding boxes.
   */
  clearAllCaches(): void {
    this.chunkBoxCache.clear()
  }
}
