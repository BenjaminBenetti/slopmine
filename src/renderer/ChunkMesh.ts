import * as THREE from 'three'
import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { IChunkCoordinate, SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { createSubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'

/**
 * Manages InstancedMesh objects for a single chunk or sub-chunk.
 * One InstancedMesh per block type for efficient batched rendering.
 */
export class ChunkMesh {
  private readonly instancedMeshes: Map<BlockId, THREE.InstancedMesh> = new Map()
  private readonly blockPositions: Map<BlockId, number[]> = new Map()
  private readonly blockLights: Map<BlockId, number[]> = new Map()
  private readonly group: THREE.Group = new THREE.Group()

  readonly chunkCoordinate: IChunkCoordinate
  /** Sub-chunk Y index (0-15), or null for legacy full-chunk meshes */
  readonly subY: number | null
  /** Cached sub-chunk key to avoid per-frame string allocation */
  readonly subChunkKey: SubChunkKey | null

  constructor(chunkCoordinate: IChunkCoordinate, subY: number | null = null) {
    this.chunkCoordinate = chunkCoordinate
    this.subY = subY
    // Pre-compute key once at construction to avoid per-frame allocation
    this.subChunkKey = subY !== null
      ? createSubChunkKey(chunkCoordinate.x, chunkCoordinate.z, subY)
      : null
  }

  /**
   * Add a block instance at the given world position with light level.
   */
  addBlock(blockId: BlockId, x: number, y: number, z: number, lightLevel: number = 15): void {
    let positions = this.blockPositions.get(blockId)
    if (!positions) {
      positions = []
      this.blockPositions.set(blockId, positions)
    }
    positions.push(x, y, z)

    let lights = this.blockLights.get(blockId)
    if (!lights) {
      lights = []
      this.blockLights.set(blockId, lights)
    }
    lights.push(lightLevel)
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

      // Get light levels for this block type
      const lights = this.blockLights.get(blockId) ?? []

      // Create instance colors for lighting
      const colors = new Float32Array(count * 3)

      // Set position and color for each instance
      // Offset by 0.5 because geometry is centered at origin (-0.5 to 0.5)
      // but block coordinates represent the min corner (block occupies x to x+1)
      for (let i = 0; i < count; i++) {
        const posIdx = i * 3
        matrix.setPosition(
          positions[posIdx] + 0.5,
          positions[posIdx + 1] + 0.5,
          positions[posIdx + 2] + 0.5
        )
        instancedMesh.setMatrixAt(i, matrix)

        // Calculate brightness from light level (0-15)
        // Power curve with exponent 2.2 for aggressive falloff into darkness
        // Minimum brightness of 2% to prevent pure black
        const light = lights[i] ?? 15
        const minBrightness = 0.02
        const normalized = light / 15
        const brightness = minBrightness + Math.pow(normalized, 2.2) * (1 - minBrightness)

        colors[posIdx] = brightness
        colors[posIdx + 1] = brightness
        colors[posIdx + 2] = brightness
      }

      // Set instance colors for lighting
      instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)

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
    this.blockLights.clear()
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
