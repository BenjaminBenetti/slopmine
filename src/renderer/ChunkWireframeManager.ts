import * as THREE from 'three'
import type { IChunkCoordinate, ISubChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { createChunkKey, createSubChunkKey, type ChunkKey, type SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import type { IChunkMesh } from './ChunkMesh.ts'
import { BIOME_REGION_SIZE } from '../world/generate/biomes/BiomeRegistry.ts'

/**
 * Manages debug wireframe boxes around chunk boundaries.
 * Uses shared geometry and materials for efficiency.
 * Wireframes are pink when visible, yellow when culled.
 * Supports both legacy full-height chunks and 64-height sub-chunks.
 * Also shows biome boundaries with diagonal line walls.
 */
export class ChunkWireframeManager {
  private readonly scene: THREE.Scene
  private readonly wireframes: Map<ChunkKey, THREE.LineSegments> = new Map()
  private readonly subChunkWireframes: Map<SubChunkKey, THREE.LineSegments> = new Map()
  private readonly biomeBoundaryWireframes: Map<ChunkKey, THREE.LineSegments[]> = new Map()
  private readonly visibleMaterial: THREE.LineBasicMaterial
  private readonly culledMaterial: THREE.LineBasicMaterial
  private readonly lightingMaterial: THREE.LineBasicMaterial
  private readonly biomeBoundaryMaterial: THREE.LineBasicMaterial
  private readonly geometry: THREE.EdgesGeometry
  private readonly subChunkGeometry: THREE.EdgesGeometry
  private readonly biomeBoundaryXGeometry: THREE.BufferGeometry // Wall on X edge (runs along Z)
  private readonly biomeBoundaryZGeometry: THREE.BufferGeometry // Wall on Z edge (runs along X)
  private visible = false

  // Track columns being lit (chunkKey -> expiry timestamp)
  private readonly lightingHighlights: Map<ChunkKey, number> = new Map()

  // Frame counter for throttling color updates
  private frameCount = 0
  private readonly UPDATE_INTERVAL = 60

  // Pre-allocated Maps to avoid per-update allocation
  private readonly chunkVisibilityMap: Map<ChunkKey, boolean> = new Map()
  private readonly subChunkVisibilityMap: Map<SubChunkKey, boolean> = new Map()

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

    // Cyan wireframe material for biome boundaries
    this.biomeBoundaryMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      depthTest: true,
      depthWrite: false,
    })

    // Create diagonal line geometries for biome boundaries
    this.biomeBoundaryXGeometry = this.createDiagonalWallGeometry(CHUNK_SIZE_Z, CHUNK_HEIGHT)
    this.biomeBoundaryZGeometry = this.createDiagonalWallGeometry(CHUNK_SIZE_X, CHUNK_HEIGHT)
  }

  /**
   * Create geometry for a wall of diagonal lines (like /////).
   * The wall is vertical in the XY plane, centered at origin.
   * Lines go from bottom-left toward top-right at 45 degrees.
   */
  private createDiagonalWallGeometry(width: number, height: number): THREE.BufferGeometry {
    const positions: number[] = []
    const spacing = 16 // Space between diagonal lines in blocks

    // Create parallel diagonal lines starting from bottom edge and left edge
    for (let startOffset = -height; startOffset < width; startOffset += spacing) {
      // Start point (on bottom edge or left edge of the wall)
      let x1: number, y1: number
      if (startOffset >= 0) {
        x1 = startOffset
        y1 = 0
      } else {
        x1 = 0
        y1 = -startOffset
      }

      // End point (on right edge or top edge of the wall)
      const maxRise = height - y1
      const maxRun = width - x1
      const diagonal = Math.min(maxRise, maxRun)
      const x2 = x1 + diagonal
      const y2 = y1 + diagonal

      // Add line if it has length (centered at origin)
      if (diagonal > 0) {
        positions.push(x1 - width / 2, y1 - height / 2, 0)
        positions.push(x2 - width / 2, y2 - height / 2, 0)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geometry
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

    // Add biome boundary wireframes if this chunk is on a boundary
    // (addBiomeBoundary is idempotent - it checks if boundaries already exist)
    this.addBiomeBoundary(coordinate)
  }

  /**
   * Add biome boundary wireframes for a chunk if it's on a biome boundary.
   * Biome regions are BIOME_REGION_SIZE chunks (16x16).
   */
  private addBiomeBoundary(coordinate: IChunkCoordinate): void {
    const chunkKey = createChunkKey(coordinate.x, coordinate.z)
    if (this.biomeBoundaryWireframes.has(chunkKey)) return

    // Calculate local position within biome region
    const chunkX = Number(coordinate.x)
    const chunkZ = Number(coordinate.z)
    const localX = ((chunkX % BIOME_REGION_SIZE) + BIOME_REGION_SIZE) % BIOME_REGION_SIZE
    const localZ = ((chunkZ % BIOME_REGION_SIZE) + BIOME_REGION_SIZE) % BIOME_REGION_SIZE

    const boundaries: THREE.LineSegments[] = []
    const worldX = chunkX * CHUNK_SIZE_X
    const worldZ = chunkZ * CHUNK_SIZE_Z

    // Boundary on -X edge (west side of chunk)
    if (localX === 0) {
      const wall = new THREE.LineSegments(this.biomeBoundaryXGeometry, this.biomeBoundaryMaterial)
      // Rotate to face X direction and position at west edge
      wall.rotation.y = Math.PI / 2
      wall.position.set(worldX, CHUNK_HEIGHT / 2, worldZ + CHUNK_SIZE_Z / 2)
      wall.visible = this.visible
      wall.renderOrder = 999
      this.scene.add(wall)
      boundaries.push(wall)
    }

    // Boundary on -Z edge (north side of chunk)
    if (localZ === 0) {
      const wall = new THREE.LineSegments(this.biomeBoundaryZGeometry, this.biomeBoundaryMaterial)
      // Already facing Z direction, position at north edge
      wall.position.set(worldX + CHUNK_SIZE_X / 2, CHUNK_HEIGHT / 2, worldZ)
      wall.visible = this.visible
      wall.renderOrder = 999
      this.scene.add(wall)
      boundaries.push(wall)
    }

    if (boundaries.length > 0) {
      this.biomeBoundaryWireframes.set(chunkKey, boundaries)
    }
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

    // Remove biome boundary wireframes only when no sub-chunks remain in this column
    if (!this.hasAnySubChunkInColumn(coordinate.x, coordinate.z)) {
      this.removeBiomeBoundary(coordinate)
    }
  }

  /**
   * Check if any sub-chunks exist for a given column.
   */
  private hasAnySubChunkInColumn(chunkX: bigint, chunkZ: bigint): boolean {
    const prefix = `${chunkX},${chunkZ},`
    for (const key of this.subChunkWireframes.keys()) {
      if (key.startsWith(prefix)) {
        return true
      }
    }
    return false
  }

  /**
   * Remove biome boundary wireframes for a chunk.
   */
  private removeBiomeBoundary(coordinate: IChunkCoordinate): void {
    const chunkKey = createChunkKey(coordinate.x, coordinate.z)
    const boundaries = this.biomeBoundaryWireframes.get(chunkKey)
    if (boundaries) {
      for (const wall of boundaries) {
        this.scene.remove(wall)
      }
      this.biomeBoundaryWireframes.delete(chunkKey)
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
    for (const boundaries of this.biomeBoundaryWireframes.values()) {
      for (const wall of boundaries) {
        wall.visible = visible
      }
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
  updateColors(chunkMeshes: Iterable<IChunkMesh>): void {
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

    // Clear and reuse pre-allocated maps to avoid per-update allocation
    this.chunkVisibilityMap.clear()
    this.subChunkVisibilityMap.clear()

    for (const chunkMesh of chunkMeshes) {
      const coord = chunkMesh.chunkCoordinate
      const isVisible = chunkMesh.getGroup().visible

      // Use cached key to avoid string allocation
      if (chunkMesh.subChunkKey !== null) {
        // Sub-chunk mesh
        this.subChunkVisibilityMap.set(chunkMesh.subChunkKey, isVisible)
      } else {
        // Legacy full-chunk mesh
        const key = createChunkKey(coord.x, coord.z)
        this.chunkVisibilityMap.set(key, isVisible)
      }
    }

    // Update legacy chunk wireframe materials
    for (const [key, wireframe] of this.wireframes) {
      const isChunkVisible = this.chunkVisibilityMap.get(key) ?? false
      wireframe.material = isChunkVisible ? this.visibleMaterial : this.culledMaterial
    }

    // Update sub-chunk wireframe materials
    for (const [key, wireframe] of this.subChunkWireframes) {
      // Check if this sub-chunk's column is being lit
      // Parse key directly to avoid string split allocation (key format: "x,z,subY")
      const firstComma = key.indexOf(',')
      const secondComma = key.indexOf(',', firstComma + 1)
      const chunkKey = key.substring(0, secondComma) as ChunkKey
      const isLighting = this.lightingHighlights.has(chunkKey)

      if (isLighting) {
        wireframe.material = this.lightingMaterial
      } else {
        const isVisible = this.subChunkVisibilityMap.get(key) ?? false
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
    for (const boundaries of this.biomeBoundaryWireframes.values()) {
      for (const wall of boundaries) {
        this.scene.remove(wall)
      }
    }
    this.wireframes.clear()
    this.subChunkWireframes.clear()
    this.biomeBoundaryWireframes.clear()
    this.geometry.dispose()
    this.subChunkGeometry.dispose()
    this.biomeBoundaryXGeometry.dispose()
    this.biomeBoundaryZGeometry.dispose()
    this.visibleMaterial.dispose()
    this.culledMaterial.dispose()
    this.lightingMaterial.dispose()
    this.biomeBoundaryMaterial.dispose()
  }
}
