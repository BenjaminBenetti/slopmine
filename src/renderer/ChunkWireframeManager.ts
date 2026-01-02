import * as THREE from 'three'
import type { IChunkCoordinate, ISubChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { createChunkKey, createSubChunkKey, type ChunkKey, type SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import type { ChunkMesh } from './ChunkMesh.ts'

/**
 * Manages debug wireframe boxes around chunk boundaries.
 * Uses shared geometry and materials for efficiency.
 * Wireframes are pink when visible, yellow when culled.
 * Supports both legacy full-height chunks and 64-height sub-chunks.
 */
export class ChunkWireframeManager {
  private readonly scene: THREE.Scene
  private readonly wireframes: Map<ChunkKey, THREE.LineSegments> = new Map()
  private readonly subChunkWireframes: Map<SubChunkKey, THREE.LineSegments> = new Map()
  private readonly visibleMaterial: THREE.LineBasicMaterial
  private readonly culledMaterial: THREE.LineBasicMaterial
  private readonly lightingMaterial: THREE.LineBasicMaterial
  private readonly geometry: THREE.EdgesGeometry
  private readonly subChunkGeometry: THREE.EdgesGeometry
  private visible = false

  // Track columns being lit (chunkKey -> expiry timestamp)
  private readonly lightingHighlights: Map<ChunkKey, number> = new Map()

  // Frame counter for throttling color updates
  private frameCount = 0
  private readonly UPDATE_INTERVAL = 60

  constructor(scene: THREE.Scene) {
    this.scene = scene

    // Create shared geometry for legacy full-height wireframes
    const boxGeometry = new THREE.BoxGeometry(CHUNK_SIZE_X, CHUNK_HEIGHT, CHUNK_SIZE_Z)
    this.geometry = new THREE.EdgesGeometry(boxGeometry)
    boxGeometry.dispose()

    // Create shared geometry for sub-chunk wireframes (64 height)
    const subChunkBoxGeometry = new THREE.BoxGeometry(CHUNK_SIZE_X, SUB_CHUNK_HEIGHT, CHUNK_SIZE_Z)
    this.subChunkGeometry = new THREE.EdgesGeometry(subChunkBoxGeometry)
    subChunkBoxGeometry.dispose()

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

    // Green wireframe material for chunks being lit
    this.lightingMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
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
   * Add wireframe for a sub-chunk at the given coordinate.
   */
  addSubChunk(coordinate: ISubChunkCoordinate): void {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    if (this.subChunkWireframes.has(key)) return

    const wireframe = new THREE.LineSegments(this.subChunkGeometry, this.visibleMaterial)

    // Position at sub-chunk center
    const worldX = Number(coordinate.x) * CHUNK_SIZE_X + CHUNK_SIZE_X / 2
    const worldZ = Number(coordinate.z) * CHUNK_SIZE_Z + CHUNK_SIZE_Z / 2
    const worldY = coordinate.subY * SUB_CHUNK_HEIGHT + SUB_CHUNK_HEIGHT / 2
    wireframe.position.set(worldX, worldY, worldZ)

    wireframe.visible = this.visible
    wireframe.renderOrder = 999

    this.scene.add(wireframe)
    this.subChunkWireframes.set(key, wireframe)
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
   * Remove wireframe for a sub-chunk.
   */
  removeSubChunk(coordinate: ISubChunkCoordinate): void {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    const wireframe = this.subChunkWireframes.get(key)
    if (wireframe) {
      this.scene.remove(wireframe)
      this.subChunkWireframes.delete(key)
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
    for (const wireframe of this.subChunkWireframes.values()) {
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
   * Highlight all sub-chunks in a column as being lit.
   * The highlight lasts for the specified duration.
   */
  highlightColumnLighting(coordinate: IChunkCoordinate, durationMs: number = 1000): void {
    const key = createChunkKey(coordinate.x, coordinate.z)
    const expiry = performance.now() + durationMs
    this.lightingHighlights.set(key, expiry)
  }

  /**
   * Update wireframe colors based on chunk mesh visibility.
   * Green = being lit, Pink = visible, Yellow = culled.
   */
  updateColors(chunkMeshes: Iterable<ChunkMesh>): void {
    if (!this.visible) return

    // Only update every N frames
    this.frameCount++
    if (this.frameCount < this.UPDATE_INTERVAL) return
    this.frameCount = 0

    const now = performance.now()

    // Clean up expired lighting highlights
    for (const [key, expiry] of this.lightingHighlights) {
      if (now >= expiry) {
        this.lightingHighlights.delete(key)
      }
    }

    // Build maps of chunk and sub-chunk visibility
    const chunkVisibilityMap = new Map<ChunkKey, boolean>()
    const subChunkVisibilityMap = new Map<SubChunkKey, boolean>()

    for (const chunkMesh of chunkMeshes) {
      const coord = chunkMesh.chunkCoordinate
      const isVisible = chunkMesh.getGroup().visible

      if (chunkMesh.subY !== null) {
        // Sub-chunk mesh
        const key = createSubChunkKey(coord.x, coord.z, chunkMesh.subY)
        subChunkVisibilityMap.set(key, isVisible)
      } else {
        // Legacy full-chunk mesh
        const key = createChunkKey(coord.x, coord.z)
        chunkVisibilityMap.set(key, isVisible)
      }
    }

    // Update legacy chunk wireframe materials
    for (const [key, wireframe] of this.wireframes) {
      const isChunkVisible = chunkVisibilityMap.get(key) ?? false
      wireframe.material = isChunkVisible ? this.visibleMaterial : this.culledMaterial
    }

    // Update sub-chunk wireframe materials
    for (const [key, wireframe] of this.subChunkWireframes) {
      // Check if this sub-chunk's column is being lit
      const [xStr, zStr] = key.split(',')
      const chunkKey = `${xStr},${zStr}` as ChunkKey
      const isLighting = this.lightingHighlights.has(chunkKey)

      if (isLighting) {
        wireframe.material = this.lightingMaterial
      } else {
        const isVisible = subChunkVisibilityMap.get(key) ?? false
        wireframe.material = isVisible ? this.visibleMaterial : this.culledMaterial
      }
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const wireframe of this.wireframes.values()) {
      this.scene.remove(wireframe)
    }
    for (const wireframe of this.subChunkWireframes.values()) {
      this.scene.remove(wireframe)
    }
    this.wireframes.clear()
    this.subChunkWireframes.clear()
    this.geometry.dispose()
    this.subChunkGeometry.dispose()
    this.visibleMaterial.dispose()
    this.culledMaterial.dispose()
    this.lightingMaterial.dispose()
  }
}
