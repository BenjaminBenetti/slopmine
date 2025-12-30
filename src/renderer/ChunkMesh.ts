import * as THREE from 'three'
import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { IChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'

/**
 * Manages a single merged mesh for a chunk.
 * Combines all block instances into one mesh for efficient rendering.
 */
export class ChunkMesh {
  private mesh: THREE.Mesh | null = null
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
   * Build a single merged mesh from all block instances.
   * Call this after all addBlock() calls are complete.
   */
  build(): void {
    const matrix = new THREE.Matrix4()
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const materialIndexMap = new Map<THREE.Material, number>()

    for (const [blockId, positions] of this.blockPositions) {
      const count = positions.length / 3
      if (count === 0) continue

      const block = getBlock(blockId)
      const baseMaterialOrArray = block.getInstanceMaterial()
      const baseGeometry = block.getInstanceGeometry()

      // Handle both single material and material array
      const baseMaterials = Array.isArray(baseMaterialOrArray) 
        ? baseMaterialOrArray 
        : [baseMaterialOrArray]

      // Map each material from the block to global material array
      const materialIndices: number[] = []
      for (const mat of baseMaterials) {
        let materialIndex = materialIndexMap.get(mat)
        if (materialIndex === undefined) {
          materialIndex = materials.length
          materials.push(mat)
          materialIndexMap.set(mat, materialIndex)
        }
        materialIndices.push(materialIndex)
      }

      // Create a geometry for each instance of this block type
      // Offset by 0.5 because geometry is centered at origin (-0.5 to 0.5)
      // but block coordinates represent the min corner (block occupies x to x+1)
      for (let i = 0; i < count; i++) {
        const idx = i * 3
        const clonedGeometry = baseGeometry.clone()
        
        matrix.makeTranslation(
          positions[idx] + 0.5,
          positions[idx + 1] + 0.5,
          positions[idx + 2] + 0.5
        )
        clonedGeometry.applyMatrix4(matrix)
        
        // Set material indices for this geometry
        if (materials.length > 1) {
          // Clear existing groups and set new ones
          clonedGeometry.clearGroups()
          
          if (baseGeometry.groups.length > 0) {
            // Geometry has groups (multi-material), map them to global indices
            for (let g = 0; g < baseGeometry.groups.length; g++) {
              const group = baseGeometry.groups[g]
              const localMaterialIndex = group.materialIndex !== undefined ? group.materialIndex : 0
              const globalMaterialIndex = materialIndices[localMaterialIndex] || materialIndices[0]
              clonedGeometry.addGroup(group.start, group.count, globalMaterialIndex)
            }
          } else {
            // No groups, add one for entire geometry
            clonedGeometry.addGroup(0, Infinity, materialIndices[0])
          }
        }
        
        geometries.push(clonedGeometry)
      }
    }

    if (geometries.length === 0) return

    // Merge all geometries into one
    const mergedGeometry = mergeBufferGeometries(geometries)
    if (!mergedGeometry) return

    // Create mesh with merged geometry and materials
    const material = materials.length === 1 ? materials[0] : materials
    this.mesh = new THREE.Mesh(mergedGeometry, material)
    this.mesh.frustumCulled = true
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true

    this.group.add(this.mesh)

    // Clean up cloned geometries
    for (const geo of geometries) {
      geo.dispose()
    }
  }

  /**
   * Get the THREE.Group containing the merged mesh.
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
    if (this.mesh) {
      this.mesh.geometry.dispose()
      // Note: We don't dispose materials as they're shared across blocks
      this.group.remove(this.mesh)
      this.mesh = null
    }
    this.blockPositions.clear()
  }

  /**
   * Get the total number of block instances.
   */
  getTotalInstanceCount(): number {
    let total = 0
    for (const positions of this.blockPositions.values()) {
      total += positions.length / 3
    }
    return total
  }
}

/**
 * Merge multiple BufferGeometry objects into one.
 * Custom implementation for merging geometries with proper material index handling.
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geometries.length === 0) return null
  if (geometries.length === 1) return geometries[0].clone()

  const mergedGeometry = new THREE.BufferGeometry()

  // Collect all attribute names
  const attributeNames = new Set<string>()
  for (const geometry of geometries) {
    for (const name in geometry.attributes) {
      attributeNames.add(name)
    }
  }

  // Merge each attribute
  const mergedAttributes: { [name: string]: Float32Array } = {}
  const attributeItemSizes: { [name: string]: number } = {}

  for (const name of attributeNames) {
    const arrays: Float32Array[] = []
    let itemSize = 3

    for (const geometry of geometries) {
      const attribute = geometry.attributes[name]
      if (attribute) {
        itemSize = attribute.itemSize
        const array = attribute.array as Float32Array
        arrays.push(array)
      }
      // Note: If a geometry is missing this attribute, it's skipped from merging
    }

    if (arrays.length === geometries.length) {
      // All geometries have this attribute, merge them
      const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
      const mergedArray = new Float32Array(totalLength)
      let offset = 0
      for (const array of arrays) {
        mergedArray.set(array, offset)
        offset += array.length
      }
      mergedAttributes[name] = mergedArray
      attributeItemSizes[name] = itemSize
    }
  }

  // Set merged attributes on the geometry
  for (const name in mergedAttributes) {
    mergedGeometry.setAttribute(
      name,
      new THREE.BufferAttribute(mergedAttributes[name], attributeItemSizes[name])
    )
  }

  // Merge indices if present
  const hasIndex = geometries.every(geo => geo.index !== null)
  if (hasIndex) {
    const indexArrays: number[][] = []
    let indexOffset = 0

    for (const geometry of geometries) {
      const index = geometry.index!
      const array = Array.from(index.array)
      // Offset indices by the current vertex count
      const offsetArray = array.map((i: number) => i + indexOffset)
      indexArrays.push(offsetArray)
      
      // Update offset for next geometry
      const positionAttribute = geometry.attributes.position
      indexOffset += positionAttribute.count
    }

    const mergedIndices = indexArrays.flat()
    mergedGeometry.setIndex(mergedIndices)
  }

  // Merge groups for multi-material support
  let groupOffset = 0
  for (const geometry of geometries) {
    if (geometry.groups.length > 0) {
      for (const group of geometry.groups) {
        mergedGeometry.addGroup(
          group.start + groupOffset,
          group.count,
          group.materialIndex
        )
      }
    }
    // Update offset based on index count or vertex count
    if (geometry.index) {
      groupOffset += geometry.index.count
    } else if (geometry.attributes.position) {
      groupOffset += geometry.attributes.position.count
    }
  }

  return mergedGeometry
}
