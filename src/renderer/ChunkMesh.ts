import * as THREE from 'three'
import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { IChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'

/**
 * Manages InstancedMesh objects for a single chunk.
 * One InstancedMesh per block type for efficient batched rendering.
 */
export class ChunkMesh {
  private readonly instancedMeshes: Map<BlockId, THREE.InstancedMesh> = new Map()
  private readonly blockPositions: Map<BlockId, Array<{ x: number; y: number; z: number }>> = new Map()
  private readonly group: THREE.Group = new THREE.Group()

  readonly chunkCoordinate: IChunkCoordinate

  constructor(chunkCoordinate: IChunkCoordinate) {
    this.chunkCoordinate = chunkCoordinate
  }

  /**
   * Add a block instance at the given world position.
   */
  addBlock(blockId: BlockId, x: number, y: number, z: number): void {
    let positions = this.blockPositions.get(blockId)
    if (!positions) {
      positions = []
      this.blockPositions.set(blockId, positions)
    }
    positions.push({ x, y, z })
  }

  /**
   * Build all InstancedMesh objects from collected block positions.
   * Call this after all addBlock() calls are complete.
   */
  build(): void {
    const matrix = new THREE.Matrix4()

    for (const [blockId, positions] of this.blockPositions) {
      if (positions.length === 0) continue

      const block = getBlock(blockId)
      const material = block.getInstanceMaterial()
      const geometry = block.getInstanceGeometry()

      // Create InstancedMesh with exact count needed
      const instancedMesh = new THREE.InstancedMesh(geometry, material, positions.length)
      instancedMesh.frustumCulled = true

      // Set position for each instance
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        matrix.setPosition(pos.x, pos.y, pos.z)
        instancedMesh.setMatrixAt(i, matrix)
      }

      instancedMesh.instanceMatrix.needsUpdate = true
      this.instancedMeshes.set(blockId, instancedMesh)
      this.group.add(instancedMesh)
    }
  }

  /**
   * Get the THREE.Group containing all instanced meshes.
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
    for (const instancedMesh of this.instancedMeshes.values()) {
      instancedMesh.dispose()
      // Note: We don't dispose geometry (SharedGeometry) or materials (shared across blocks)
    }
    this.instancedMeshes.clear()
    this.blockPositions.clear()
  }

  /**
   * Get the number of block types in this chunk mesh.
   */
  getBlockTypeCount(): number {
    return this.instancedMeshes.size
  }

  /**
   * Get the total number of block instances across all types.
   */
  getTotalInstanceCount(): number {
    let total = 0
    for (const positions of this.blockPositions.values()) {
      total += positions.length
    }
    return total
  }
}
