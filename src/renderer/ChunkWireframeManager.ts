import * as THREE from 'three'
import type { IChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import type { ChunkMesh } from './ChunkMesh.ts'

/**
 * Manages debug wireframe boxes around chunk boundaries.
 * Uses shared geometry and materials for efficiency.
 * Wireframes are pink when visible, yellow when culled.
 */
export class ChunkWireframeManager {
  private readonly scene: THREE.Scene
  private readonly wireframes: Map<ChunkKey, THREE.LineSegments> = new Map()
  private readonly visibleMaterial: THREE.LineBasicMaterial
  private readonly culledMaterial: THREE.LineBasicMaterial
  private readonly geometry: THREE.EdgesGeometry
  private visible = false

  constructor(scene: THREE.Scene) {
    this.scene = scene

    // Create shared geometry for all wireframes
    const boxGeometry = new THREE.BoxGeometry(CHUNK_SIZE_X, CHUNK_HEIGHT, CHUNK_SIZE_Z)
    this.geometry = new THREE.EdgesGeometry(boxGeometry)
    boxGeometry.dispose() // EdgesGeometry has its own copy

    // Pink wireframe material for visible chunks
    this.visibleMaterial = new THREE.LineBasicMaterial({
      color: 0xff69b4,
      depthTest: true,
      depthWrite: false,
    })

    // Yellow wireframe material for culled chunks
    this.culledMaterial = new THREE.LineBasicMaterial({
      color: 0xffff00,
      depthTest: true,
      depthWrite: false,
    })
  }

  /**
   * Add wireframe for a chunk at the given coordinate.
   */
  addChunk(coordinate: IChunkCoordinate): void {
    const key = createChunkKey(coordinate.x, coordinate.z)
    if (this.wireframes.has(key)) return

    const wireframe = new THREE.LineSegments(this.geometry, this.visibleMaterial)

    // Position at chunk center (geometry is centered at origin)
    const worldX = Number(coordinate.x) * CHUNK_SIZE_X + CHUNK_SIZE_X / 2
    const worldZ = Number(coordinate.z) * CHUNK_SIZE_Z + CHUNK_SIZE_Z / 2
    wireframe.position.set(worldX, CHUNK_HEIGHT / 2, worldZ)

    wireframe.visible = this.visible
    wireframe.renderOrder = 999

    this.scene.add(wireframe)
    this.wireframes.set(key, wireframe)
  }

  /**
   * Remove wireframe for a chunk.
   */
  removeChunk(coordinate: IChunkCoordinate): void {
    const key = createChunkKey(coordinate.x, coordinate.z)
    const wireframe = this.wireframes.get(key)
    if (wireframe) {
      this.scene.remove(wireframe)
      this.wireframes.delete(key)
    }
  }

  /**
   * Set visibility of all wireframes.
   */
  setVisible(visible: boolean): void {
    this.visible = visible
    for (const wireframe of this.wireframes.values()) {
      wireframe.visible = visible
    }
  }

  /**
   * Check if wireframes are currently visible.
   */
  isVisible(): boolean {
    return this.visible
  }

  /**
   * Update wireframe colors based on chunk mesh visibility.
   * Pink = visible, Yellow = culled.
   */
  updateColors(chunkMeshes: Iterable<ChunkMesh>): void {
    if (!this.visible) return

    // Build a map of chunk visibility
    const visibilityMap = new Map<ChunkKey, boolean>()
    for (const chunkMesh of chunkMeshes) {
      const coord = chunkMesh.chunkCoordinate
      const key = createChunkKey(coord.x, coord.z)
      visibilityMap.set(key, chunkMesh.getGroup().visible)
    }

    // Update wireframe materials based on visibility
    for (const [key, wireframe] of this.wireframes) {
      const isChunkVisible = visibilityMap.get(key) ?? false
      wireframe.material = isChunkVisible ? this.visibleMaterial : this.culledMaterial
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const wireframe of this.wireframes.values()) {
      this.scene.remove(wireframe)
    }
    this.wireframes.clear()
    this.geometry.dispose()
    this.visibleMaterial.dispose()
    this.culledMaterial.dispose()
  }
}
