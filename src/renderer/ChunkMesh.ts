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
  private readonly blockPositions: Map<BlockId, number[]> = new Map()
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
    positions.push(x, y, z)
  }

  /**
   * Build all InstancedMesh objects from collected block positions.
   * Call this after all addBlock() calls are complete.
   */
  build(): void {
    const matrix = new THREE.Matrix4()

    for (const [blockId, positions] of this.blockPositions) {
      const count = positions.length / 3
      if (count === 0) continue

      const block = getBlock(blockId)
      const material = block.getInstanceMaterial()
      const geometry = block.getInstanceGeometry()

      // Create InstancedMesh with exact count needed
      const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
      instancedMesh.frustumCulled = true
      instancedMesh.castShadow = true
      instancedMesh.receiveShadow = true

      // Set position for each instance
      // Offset by 0.5 because geometry is centered at origin (-0.5 to 0.5)
      // but block coordinates represent the min corner (block occupies x to x+1)
      for (let i = 0; i < count; i++) {
        const idx = i * 3
        matrix.setPosition(
          positions[idx] + 0.5,
          positions[idx + 1] + 0.5,
          positions[idx + 2] + 0.5
        )
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
      total += positions.length / 3
    }
    return total
  }
}
