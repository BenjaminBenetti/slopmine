import * as THREE from 'three'
import type { ChunkMesh } from './ChunkMesh.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'

/**
 * Performs chunk-level frustum culling to skip rendering chunks outside the camera view.
 * Supports both legacy full-height chunks and new 64-height sub-chunks.
 * Sub-chunk bounding boxes enable vertical culling for caves and underground areas.
 */
export class FrustumCuller {
  private readonly frustum = new THREE.Frustum()
  private readonly projScreenMatrix = new THREE.Matrix4()
  private readonly tempBox = new THREE.Box3()

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
   * Calculate the world-space bounding box for a chunk or sub-chunk.
   * Sub-chunks use their Y index to determine vertical bounds.
   */
  private getChunkBoundingBox(chunkMesh: ChunkMesh): THREE.Box3 {
    const coord = chunkMesh.chunkCoordinate
    const worldX = Number(coord.x) * CHUNK_SIZE_X
    const worldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Sub-chunk: use 64-height slice
    if (chunkMesh.subY !== null) {
      const worldYMin = chunkMesh.subY * SUB_CHUNK_HEIGHT
      const worldYMax = worldYMin + SUB_CHUNK_HEIGHT
      this.tempBox.min.set(worldX, worldYMin, worldZ)
      this.tempBox.max.set(worldX + CHUNK_SIZE_X, worldYMax, worldZ + CHUNK_SIZE_Z)
    } else {
      // Legacy full-height chunk
      this.tempBox.min.set(worldX, 0, worldZ)
      this.tempBox.max.set(worldX + CHUNK_SIZE_X, CHUNK_HEIGHT, worldZ + CHUNK_SIZE_Z)
    }
    return this.tempBox
  }
}
