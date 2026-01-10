import * as THREE from 'three'
import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { IChunkCoordinate, SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { createSubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'
import type { MeshGroup, GreedyMeshResponse } from '../workers/GreedyMeshWorker.ts'
import type { IChunkMesh } from './ChunkMesh.ts'
import { getTextureAtlas } from './TextureAtlas.ts'

// Atlas materials cache (1 opaque + 1 transparent = 2 materials total)
// Normals are stored per-vertex, so we only need one material per transparency type
let opaqueAtlasMaterial: THREE.MeshLambertMaterial | null = null
let transparentAtlasMaterial: THREE.MeshLambertMaterial | null = null

/**
 * Initialize atlas materials if not already done.
 */
function initAtlasMaterials(): void {
  const atlas = getTextureAtlas()
  if (!atlas) {
    console.warn('TextureAtlas not ready, cannot init atlas materials')
    return
  }

  if (!opaqueAtlasMaterial) {
    opaqueAtlasMaterial = new THREE.MeshLambertMaterial({
      map: atlas.opaqueTexture,
      vertexColors: true,
    })
  }

  if (!transparentAtlasMaterial && atlas.transparentTexture) {
    transparentAtlasMaterial = new THREE.MeshLambertMaterial({
      map: atlas.transparentTexture,
      vertexColors: true,
      transparent: true,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    })
  }
}

/**
 * Get atlas material based on transparency.
 */
function getAtlasMaterial(isTransparent: boolean): THREE.Material {
  initAtlasMaterials()

  if (isTransparent && transparentAtlasMaterial) {
    return transparentAtlasMaterial
  }

  if (opaqueAtlasMaterial) {
    return opaqueAtlasMaterial
  }

  // Fallback: create a basic material
  return new THREE.MeshLambertMaterial({ color: 0xff00ff, vertexColors: true })
}

/**
 * Manages greedy-meshed geometry for a single sub-chunk.
 * Uses BufferGeometry with merged face quads instead of instanced cubes.
 */
export class GreedyChunkMesh implements IChunkMesh {
  private readonly meshes: THREE.Mesh[] = []
  private readonly instancedMeshes: Map<BlockId, THREE.InstancedMesh> = new Map()
  private readonly group: THREE.Group = new THREE.Group()

  readonly chunkCoordinate: IChunkCoordinate
  readonly subY: number
  readonly subChunkKey: SubChunkKey

  constructor(chunkCoordinate: IChunkCoordinate, subY: number) {
    this.chunkCoordinate = chunkCoordinate
    this.subY = subY
    this.subChunkKey = createSubChunkKey(chunkCoordinate.x, chunkCoordinate.z, subY)
  }

  /**
   * Build meshes from greedy mesh worker response.
   */
  build(response: GreedyMeshResponse): void {
    // Build opaque meshes first
    for (const meshGroup of response.opaqueGroups) {
      this.buildMeshGroup(meshGroup, false)
    }

    // Then transparent meshes (rendered after opaque)
    for (const meshGroup of response.transparentGroups) {
      this.buildMeshGroup(meshGroup, true)
    }

    // Handle non-greedy blocks (torch, etc.) with InstancedMesh fallback
    this.buildNonGreedyBlocks(response.nonGreedyBlocks, response.nonGreedyLights)
  }

  /**
   * Build a mesh from a single mesh group (same texture/face direction).
   */
  private buildMeshGroup(meshGroup: MeshGroup, isTransparent: boolean): void {
    if (meshGroup.vertices.length === 0) return

    const geometry = new THREE.BufferGeometry()

    // Vertex data layout: x,y,z,u,v,nx,ny,nz,r,g,b (11 floats per vertex)
    const vertexCount = meshGroup.vertices.length / 11
    const positions = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)
    const normals = new Float32Array(vertexCount * 3)
    const colors = new Float32Array(vertexCount * 3)

    // Unpack interleaved vertex data
    for (let i = 0; i < vertexCount; i++) {
      const srcIdx = i * 11
      const posIdx = i * 3
      const uvIdx = i * 2

      positions[posIdx] = meshGroup.vertices[srcIdx]
      positions[posIdx + 1] = meshGroup.vertices[srcIdx + 1]
      positions[posIdx + 2] = meshGroup.vertices[srcIdx + 2]

      uvs[uvIdx] = meshGroup.vertices[srcIdx + 3]
      uvs[uvIdx + 1] = meshGroup.vertices[srcIdx + 4]

      normals[posIdx] = meshGroup.vertices[srcIdx + 5]
      normals[posIdx + 1] = meshGroup.vertices[srcIdx + 6]
      normals[posIdx + 2] = meshGroup.vertices[srcIdx + 7]

      colors[posIdx] = meshGroup.vertices[srcIdx + 8]
      colors[posIdx + 1] = meshGroup.vertices[srcIdx + 9]
      colors[posIdx + 2] = meshGroup.vertices[srcIdx + 10]
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(meshGroup.indices, 1))

    // Get atlas material based on transparency (normals are per-vertex)
    const meshMaterial = getAtlasMaterial(isTransparent)

    const mesh = new THREE.Mesh(geometry, meshMaterial)
    mesh.frustumCulled = true
    mesh.castShadow = true
    mesh.receiveShadow = true

    // Transparent meshes render after opaque
    if (isTransparent) {
      mesh.renderOrder = 1
    }

    this.meshes.push(mesh)
    this.group.add(mesh)
  }

  /**
   * Build instanced meshes for non-greedy blocks (torch, etc.).
   */
  private buildNonGreedyBlocks(
    nonGreedyBlocks: Array<[number, Float32Array]>,
    nonGreedyLights: Array<[number, Uint8Array]>
  ): void {
    const matrix = new THREE.Matrix4()

    for (let i = 0; i < nonGreedyBlocks.length; i++) {
      const [blockId, positions] = nonGreedyBlocks[i]
      const lights = nonGreedyLights[i]?.[1] ?? new Uint8Array(0)

      const count = positions.length / 3
      if (count === 0) continue

      const block = getBlock(blockId)
      const material = block.getInstanceMaterial()
      const geometry = block.getInstanceGeometry()

      const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
      instancedMesh.frustumCulled = true
      instancedMesh.castShadow = true
      instancedMesh.receiveShadow = true

      const colors = new Float32Array(count * 3)

      for (let j = 0; j < count; j++) {
        const posIdx = j * 3
        matrix.setPosition(
          positions[posIdx] + 0.5,
          positions[posIdx + 1] + 0.5,
          positions[posIdx + 2] + 0.5
        )
        instancedMesh.setMatrixAt(j, matrix)

        // Calculate brightness from light level
        const light = lights[j] ?? 15
        const minBrightness = 0.02
        const normalized = light / 15
        const brightness = minBrightness + Math.pow(normalized, 2.2) * (1 - minBrightness)

        colors[posIdx] = brightness
        colors[posIdx + 1] = brightness
        colors[posIdx + 2] = brightness
      }

      instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
      instancedMesh.instanceMatrix.needsUpdate = true

      this.instancedMeshes.set(blockId, instancedMesh)
      this.group.add(instancedMesh)
    }
  }

  /**
   * Get the THREE.Group containing all meshes.
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
  dispose(renderer?: THREE.WebGLRenderer): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      // Do NOT dispose mesh.material - it's the shared atlas material
    }
    this.meshes.length = 0

    for (const instancedMesh of this.instancedMeshes.values()) {
      // Remove buffer attributes from WebGL cache - critical for memory cleanup
      // InstancedMesh instanceMatrix/instanceColor are NOT freed by dispose()
      if (renderer) {
        // Access internal WebGL attributes manager to properly free GPU memory
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const glAttributes = (renderer as any).attributes
        if (glAttributes) {
          glAttributes.remove(instancedMesh.instanceMatrix)
          if (instancedMesh.instanceColor) {
            glAttributes.remove(instancedMesh.instanceColor)
          }
        }
      }
      instancedMesh.dispose()
      // Note: geometry and material are shared from Block definitions
    }
    this.instancedMeshes.clear()

    // Clear group children to release references
    this.group.clear()
  }

  /**
   * Get the number of mesh objects in this chunk.
   */
  getMeshCount(): number {
    return this.meshes.length + this.instancedMeshes.size
  }

  /**
   * Get total vertex count across all meshes.
   */
  getTotalVertexCount(): number {
    let total = 0
    for (const mesh of this.meshes) {
      const posAttr = mesh.geometry.getAttribute('position')
      if (posAttr) {
        total += posAttr.count
      }
    }
    return total
  }

  /**
   * Get total triangle count across all meshes.
   */
  getTotalTriangleCount(): number {
    let total = 0
    for (const mesh of this.meshes) {
      const index = mesh.geometry.getIndex()
      if (index) {
        total += index.count / 3
      }
    }
    return total
  }
}
