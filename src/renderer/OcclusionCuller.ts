import * as THREE from 'three'
import type { ChunkMesh } from './ChunkMesh.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'

/**
 * Performs occlusion culling using raycasting to hide chunks that are
 * completely blocked by other chunks closer to the camera.
 * 
 * This provides an additional optimization layer on top of frustum culling
 * by detecting when chunks are hidden behind other solid geometry.
 */
export class OcclusionCuller {
  private readonly raycaster = new THREE.Raycaster()
  private readonly chunkCenters = new Map<ChunkMesh, THREE.Vector3>()
  private readonly chunkBoxes = new Map<ChunkMesh, THREE.Box3>()

  // Configuration constants
  private static readonly MIN_CHUNKS_TO_SKIP = 5 // Closest chunks can't be occluded
  private static readonly CHUNK_PROXIMITY_MULTIPLIER = 1.5 // Ray proximity threshold multiplier
  private static readonly MIN_OCCLUSION_ANGLE_RADIANS = 0.35 // ~20 degrees - minimum angular size to occlude
  private static readonly CHUNK_HEIGHT_SCALE = 4 // Scale down height for angular size calculation (chunks are wider than tall)

  /**
   * Update chunk visibility based on occlusion from the camera.
   * Only call this for chunks that passed frustum culling.
   */
  updateVisibility(camera: THREE.PerspectiveCamera, chunkMeshes: Iterable<ChunkMesh>): void {
    // Convert to array and filter to only visible chunks (already passed frustum culling)
    const visibleChunks: ChunkMesh[] = []
    for (const chunk of chunkMeshes) {
      if (chunk.getGroup().visible) {
        visibleChunks.push(chunk)
      }
    }

    if (visibleChunks.length === 0) return

    // Update camera world matrix
    camera.updateMatrixWorld()
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3())

    // Calculate chunk centers and distances
    const chunksWithDistance: Array<{ chunk: ChunkMesh; distance: number; center: THREE.Vector3 }> = []
    
    for (const chunk of visibleChunks) {
      const center = this.getOrCreateChunkCenter(chunk)
      const distance = cameraPosition.distanceToSquared(center)
      chunksWithDistance.push({ chunk, distance, center })
    }

    // Sort by distance (closest first)
    chunksWithDistance.sort((a, b) => a.distance - b.distance)

    // Check each chunk for occlusion
    // We skip the closest chunks as they can't be occluded
    const occlusionCheckStart = Math.min(OcclusionCuller.MIN_CHUNKS_TO_SKIP, chunksWithDistance.length)
    
    for (let i = occlusionCheckStart; i < chunksWithDistance.length; i++) {
      const target = chunksWithDistance[i]
      
      // Check if this chunk is occluded by any closer chunk
      let isOccluded = false
      
      // Cast ray from camera to chunk center
      const direction = target.center.clone().sub(cameraPosition).normalize()
      this.raycaster.set(cameraPosition, direction)
      
      // Check intersection with closer chunks
      for (let j = 0; j < i; j++) {
        const occluder = chunksWithDistance[j]
        
        // Skip if occluder is too far from the ray path
        if (!this.isChunkNearRay(occluder.chunk, cameraPosition, direction, target.distance)) {
          continue
        }
        
        // Check if the occluder blocks the view to the target
        if (this.doesChunkOcclude(occluder.chunk, target.chunk, cameraPosition, direction)) {
          isOccluded = true
          break
        }
      }
      
      // Update visibility - if occluded, hide the chunk
      if (isOccluded) {
        target.chunk.getGroup().visible = false
      }
    }
  }

  /**
   * Quick check if a chunk is near the ray path to the target.
   * This avoids expensive intersection tests for chunks that are clearly not in the way.
   */
  private isChunkNearRay(
    chunk: ChunkMesh,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number
  ): boolean {
    const center = this.getOrCreateChunkCenter(chunk)
    
    // Calculate closest point on ray to chunk center
    const toCenter = center.clone().sub(origin)
    const projection = toCenter.dot(direction)
    
    // Chunk is behind camera
    if (projection < 0) return false
    
    // Chunk is beyond target
    if (projection > Math.sqrt(maxDistance)) return false
    
    // Calculate perpendicular distance
    const closestPoint = origin.clone().add(direction.clone().multiplyScalar(projection))
    const perpDistance = closestPoint.distanceTo(center)
    
    // Use chunk diagonal as threshold (chunks are roughly CHUNK_SIZE across)
    const threshold = Math.sqrt(CHUNK_SIZE_X * CHUNK_SIZE_X + CHUNK_SIZE_Z * CHUNK_SIZE_Z) * OcclusionCuller.CHUNK_PROXIMITY_MULTIPLIER
    
    return perpDistance < threshold
  }

  /**
   * Check if an occluder chunk blocks the view to a target chunk.
   */
  private doesChunkOcclude(
    occluder: ChunkMesh,
    target: ChunkMesh,
    cameraPos: THREE.Vector3,
    direction: THREE.Vector3
  ): boolean {
    const occluderBox = this.getOrCreateChunkBox(occluder)
    const targetBox = this.getOrCreateChunkBox(target)
    
    // Ray intersects the occluder box
    const intersection = this.raycaster.ray.intersectBox(occluderBox, new THREE.Vector3())
    
    if (!intersection) return false
    
    // Check if intersection point is closer to camera than target
    const intersectionDist = cameraPos.distanceToSquared(intersection)
    const targetDist = cameraPos.distanceToSquared(this.getOrCreateChunkCenter(target))
    
    if (intersectionDist >= targetDist) return false
    
    // For a chunk to fully occlude another, it should significantly block the view
    // We use a simple heuristic: if the occluder's box is large enough relative to the view angle
    // and the target is directly behind it, consider it occluded
    
    // Calculate angular size of occluder from camera
    const occluderCenter = this.getOrCreateChunkCenter(occluder)
    const distToOccluder = Math.sqrt(cameraPos.distanceToSquared(occluderCenter))
    // Use horizontal dimensions for angular size (chunks are wider than tall)
    const occluderSize = Math.max(CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT / OcclusionCuller.CHUNK_HEIGHT_SCALE)
    const angularSize = Math.atan(occluderSize / distToOccluder)
    
    // If occluder appears large enough, it can occlude
    // This prevents distant tiny chunks from occluding large areas
    return angularSize > OcclusionCuller.MIN_OCCLUSION_ANGLE_RADIANS
  }

  /**
   * Get or calculate the center point of a chunk.
   */
  private getOrCreateChunkCenter(chunk: ChunkMesh): THREE.Vector3 {
    let center = this.chunkCenters.get(chunk)
    if (!center) {
      const coord = chunk.chunkCoordinate
      const worldX = Number(coord.x) * CHUNK_SIZE_X
      const worldZ = Number(coord.z) * CHUNK_SIZE_Z
      
      center = new THREE.Vector3(
        worldX + CHUNK_SIZE_X / 2,
        CHUNK_HEIGHT / 2,
        worldZ + CHUNK_SIZE_Z / 2
      )
      this.chunkCenters.set(chunk, center)
    }
    return center
  }

  /**
   * Get or calculate the bounding box of a chunk.
   */
  private getOrCreateChunkBox(chunk: ChunkMesh): THREE.Box3 {
    let box = this.chunkBoxes.get(chunk)
    if (!box) {
      const coord = chunk.chunkCoordinate
      const worldX = Number(coord.x) * CHUNK_SIZE_X
      const worldZ = Number(coord.z) * CHUNK_SIZE_Z
      
      box = new THREE.Box3(
        new THREE.Vector3(worldX, 0, worldZ),
        new THREE.Vector3(worldX + CHUNK_SIZE_X, CHUNK_HEIGHT, worldZ + CHUNK_SIZE_Z)
      )
      this.chunkBoxes.set(chunk, box)
    }
    return box
  }

  /**
   * Clear cached data for removed chunks.
   */
  clearCache(chunk: ChunkMesh): void {
    this.chunkCenters.delete(chunk)
    this.chunkBoxes.delete(chunk)
  }

  /**
   * Clear all cached data.
   */
  clearAllCaches(): void {
    this.chunkCenters.clear()
    this.chunkBoxes.clear()
  }
}
