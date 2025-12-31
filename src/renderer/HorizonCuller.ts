import * as THREE from 'three'
import type { ChunkMesh } from './ChunkMesh.ts'
import type { HeightmapCache } from './HeightmapCache.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/interfaces/IChunk.ts'

/**
 * Performs horizon-based occlusion culling using ray casting.
 * Complements frustum culling by hiding chunks that are occluded by terrain.
 */
export class HorizonCuller {
  /**
   * Sample points per chunk for conservative culling (4 corners + center).
   * Chunk is only culled if ALL sample points are occluded.
   */
  private readonly SAMPLE_OFFSETS = [
    { x: 0, z: 0 },                                    // min corner
    { x: CHUNK_SIZE_X, z: 0 },                         // max X corner
    { x: 0, z: CHUNK_SIZE_Z },                         // max Z corner
    { x: CHUNK_SIZE_X, z: CHUNK_SIZE_Z },              // max corner
    { x: CHUNK_SIZE_X / 2, z: CHUNK_SIZE_Z / 2 }       // center
  ]

  /** Step size for ray marching in blocks */
  private readonly RAY_STEP = 8

  /** Height margin above terrain to prevent popping artifacts */
  private readonly HEIGHT_MARGIN = 4

  /**
   * Update visibility of chunks based on horizon occlusion.
   * Should be called after frustum culling.
   */
  updateVisibility(
    camera: THREE.PerspectiveCamera,
    chunkMeshes: Iterable<ChunkMesh>,
    heightmap: HeightmapCache
  ): void {
    const camX = camera.position.x
    const camY = camera.position.y
    const camZ = camera.position.z

    for (const chunkMesh of chunkMeshes) {
      const group = chunkMesh.getGroup()

      // Skip chunks already culled by frustum culler
      if (!group.visible) continue

      const coord = chunkMesh.chunkCoordinate
      const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
      const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

      // Quick check: if chunk max height is well below camera, likely visible
      const chunkMaxHeight = heightmap.getChunkMaxHeight(coord.x, coord.z)
      if (chunkMaxHeight < camY - this.HEIGHT_MARGIN * 2) {
        // Chunk terrain is below camera - skip detailed ray check
        continue
      }

      // Conservative culling: chunk is visible if ANY sample point is visible
      let anyVisible = false

      for (const offset of this.SAMPLE_OFFSETS) {
        const targetX = chunkWorldX + offset.x
        const targetZ = chunkWorldZ + offset.z

        // Get terrain height at target to determine the Y we're testing visibility to
        const targetHeight = heightmap.getHeightAt(targetX, targetZ) + this.HEIGHT_MARGIN

        if (this.isPointVisible(camX, camY, camZ, targetX, targetHeight, targetZ, heightmap)) {
          anyVisible = true
          break // Early exit - chunk is visible
        }
      }

      if (!anyVisible) {
        group.visible = false
      }
    }
  }

  /**
   * Ray march from camera to target point, checking for terrain occlusion.
   * Returns true if the target is visible (not blocked by terrain).
   */
  private isPointVisible(
    camX: number,
    camY: number,
    camZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    heightmap: HeightmapCache
  ): boolean {
    const dx = targetX - camX
    const dz = targetZ - camZ
    const dy = targetY - camY

    const distXZ = Math.sqrt(dx * dx + dz * dz)

    // If very close, consider visible
    if (distXZ < this.RAY_STEP) return true

    // Normalize direction in XZ plane
    const dirX = dx / distXZ
    const dirZ = dz / distXZ
    const dirY = dy / distXZ // Y change per unit XZ distance

    // Step along ray (skip first step since we start at camera)
    const steps = Math.ceil(distXZ / this.RAY_STEP)

    for (let i = 1; i < steps; i++) {
      const t = i * this.RAY_STEP
      const rayX = camX + dirX * t
      const rayZ = camZ + dirZ * t
      const rayY = camY + dirY * t

      const terrainHeight = heightmap.getHeightAt(rayX, rayZ)

      // If terrain is above ray height, it occludes the target
      if (terrainHeight > rayY) {
        return false
      }
    }

    return true
  }
}
