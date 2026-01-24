import * as THREE from 'three'
import { type BlockId, isMultiMeshBlock } from '../world/interfaces/IBlock.ts'
import type { IChunkCoordinate, SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { createSubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'
import type { MeshGroup, GreedyMeshResponse } from '../workers/GreedyMeshWorker.ts'
import type { IChunkMesh } from './ChunkMesh.ts'
import { getTextureAtlas } from './TextureAtlas.ts'
import { getMetadataFacing, facingToRotationY } from '../world/blocks/BlockFacing.ts'

// Liquid block ID ranges for identifying liquid blocks
const LIQUID_BLOCK_IDS = new Set([
  // Water (13-20)
  13, 14, 15, 16, 17, 18, 19, 20,
  // Lava (21-28)
  21, 22, 23, 24, 25, 26, 27, 28,
  // Swamp water (39-46)
  39, 40, 41, 42, 43, 44, 45, 46,
])

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
  private readonly batchedMeshes: Map<BlockId, THREE.BatchedMesh> = new Map()
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
    this.buildNonGreedyBlocks(
      response.nonGreedyBlocks,
      response.nonGreedyLights,
      response.nonGreedyMetadata,
      response.nonGreedyFaceVisibility
    )
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
   * Uses per-face geometry for liquid blocks to eliminate internal faces.
   */
  private buildNonGreedyBlocks(
    nonGreedyBlocks: Array<[number, Float32Array]>,
    nonGreedyLights: Array<[number, Uint8Array]>,
    nonGreedyMetadata: Array<[number, Uint8Array]>,
    nonGreedyFaceVisibility: Array<[number, Uint8Array]>
  ): void {
    const matrix = new THREE.Matrix4()
    const faceVisMap = new Map(nonGreedyFaceVisibility)

    for (let i = 0; i < nonGreedyBlocks.length; i++) {
      const [blockId, positions] = nonGreedyBlocks[i]
      const lights = nonGreedyLights[i]?.[1] ?? new Uint8Array(0)
      const metadata = nonGreedyMetadata[i]?.[1] ?? new Uint8Array(0)
      const faceVis = faceVisMap.get(blockId)

      const count = positions.length / 3
      if (count === 0) continue

      const block = getBlock(blockId)

      // Check if this is a liquid block with face visibility data
      if (LIQUID_BLOCK_IDS.has(blockId) && faceVis) {
        const material = block.getInstanceMaterial()
        const mat = Array.isArray(material) ? material[0] : material
        this.buildLiquidMesh(blockId, positions, lights, faceVis, material, mat)
      }
      // Check if block supports multi-mesh rendering (multiple geometry/material pairs)
      else if (isMultiMeshBlock(block)) {
        const parts = block.getMultiMeshParts()
        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
          const { geometry, material } = parts[partIndex]
          // Use a unique key for each part: blockId * 100 + partIndex
          const partKey = blockId * 100 + partIndex
          this.buildInstancedMesh(partKey, geometry, material, positions, lights, metadata, count, matrix, material)
        }
      }
      // Standard single-mesh rendering
      else {
        const material = block.getInstanceMaterial()
        const mat = Array.isArray(material) ? material[0] : material
        const geometry = block.getInstanceGeometry()
        this.buildInstancedMesh(blockId, geometry, material, positions, lights, metadata, count, matrix, mat)
      }
    }
  }

  /**
   * Build a single merged mesh for liquid blocks with per-face visibility.
   * Emits only visible faces as direct geometry (one draw call per liquid type).
   * Extracts bounding box from block geometry to respect height variations.
   */
  private buildLiquidMesh(
    blockId: BlockId,
    positions: Float32Array,
    lights: Uint8Array,
    faceVisibility: Uint8Array,
    material: THREE.Material | THREE.Material[],
    mat: THREE.Material | undefined
  ): void {
    const count = positions.length / 3
    if (count === 0) return

    // Get the block's actual geometry bounding box for correct dimensions
    const block = getBlock(blockId)
    const blockGeometry = block.getInstanceGeometry()
    blockGeometry.computeBoundingBox()
    const box = blockGeometry.boundingBox!

    // Small inset to prevent z-fighting with adjacent solid blocks
    // No inset on top face (maxY) to avoid gaps in water surface when viewed from below
    const INSET = 0.002

    // Extract min/max from bounding box with inset (except top face)
    const minX = box.min.x + INSET, maxX = box.max.x - INSET
    const minY = box.min.y + INSET, maxY = box.max.y  // No inset on top
    const minZ = box.min.z + INSET, maxZ = box.max.z - INSET

    // Calculate UV scale for side faces based on height ratio
    const height = maxY - minY
    const uvHeight = height // Side face UVs scale with height

    // Face vertex definitions using actual bounding box dimensions
    // Each face has 4 vertices in CCW winding from outside
    const FACE_VERTS: number[][][] = [
      // TOP (bit 0) - +Y face
      [[minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]],
      // BOTTOM (bit 1) - -Y face
      [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], [minX, minY, minZ]],
      // NORTH (bit 2) - -Z face
      [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]],
      // SOUTH (bit 3) - +Z face
      [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]],
      // EAST (bit 4) - +X face
      [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]],
      // WEST (bit 5) - -X face
      [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]],
    ]

    const FACE_NORMALS: number[][] = [
      [0, 1, 0], [0, -1, 0], [0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0]
    ]

    // UVs - top/bottom use full texture, sides use height-scaled V
    const FACE_UVS: number[][][] = [
      // TOP - full texture
      [[0, 0], [1, 0], [1, 1], [0, 1]],
      // BOTTOM - full texture
      [[0, 0], [1, 0], [1, 1], [0, 1]],
      // NORTH - height-scaled (bottom portion of texture)
      [[0, 0], [1, 0], [1, uvHeight], [0, uvHeight]],
      // SOUTH - height-scaled
      [[0, 0], [1, 0], [1, uvHeight], [0, uvHeight]],
      // EAST - height-scaled
      [[0, 0], [1, 0], [1, uvHeight], [0, uvHeight]],
      // WEST - height-scaled
      [[0, 0], [1, 0], [1, uvHeight], [0, uvHeight]],
    ]

    // Pre-count total faces for allocation
    let totalFaces = 0
    for (let i = 0; i < count; i++) {
      const pattern = faceVisibility[i]
      for (let f = 0; f < 6; f++) {
        if (pattern & (1 << f)) totalFaces++
      }
    }

    if (totalFaces === 0) return

    // Allocate arrays (4 verts per face, 6 indices per face)
    const posArr = new Float32Array(totalFaces * 4 * 3)
    const normArr = new Float32Array(totalFaces * 4 * 3)
    const uvArr = new Float32Array(totalFaces * 4 * 2)
    const colorArr = new Float32Array(totalFaces * 4 * 3)
    const indices: number[] = []

    let vertOffset = 0

    for (let i = 0; i < count; i++) {
      const pattern = faceVisibility[i]
      if (pattern === 0) continue

      // Block position (center offset)
      const px = positions[i * 3] + 0.5
      const py = positions[i * 3 + 1] + 0.5
      const pz = positions[i * 3 + 2] + 0.5

      // Calculate brightness
      const light = lights[i] ?? 15
      const minBrightness = 0.02
      const normalized = light / 15
      const brightness = minBrightness + Math.pow(normalized, 2.2) * (1 - minBrightness)

      for (let f = 0; f < 6; f++) {
        if (!(pattern & (1 << f))) continue

        const verts = FACE_VERTS[f]
        const uvs = FACE_UVS[f]
        const norm = FACE_NORMALS[f]
        const baseVert = vertOffset

        // Emit 4 vertices for this face
        for (let v = 0; v < 4; v++) {
          const vi = vertOffset * 3
          const ui = vertOffset * 2

          posArr[vi] = px + verts[v][0]
          posArr[vi + 1] = py + verts[v][1]
          posArr[vi + 2] = pz + verts[v][2]

          normArr[vi] = norm[0]
          normArr[vi + 1] = norm[1]
          normArr[vi + 2] = norm[2]

          uvArr[ui] = uvs[v][0]
          uvArr[ui + 1] = uvs[v][1]

          colorArr[vi] = brightness
          colorArr[vi + 1] = brightness
          colorArr[vi + 2] = brightness

          vertOffset++
        }

        // Emit 2 triangles (6 indices)
        indices.push(
          baseVert, baseVert + 1, baseVert + 2,
          baseVert, baseVert + 2, baseVert + 3
        )
      }
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2))
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArr, 3))

    // Use Uint32Array if needed
    const indexArray = vertOffset > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1))

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = true
    mesh.castShadow = true
    mesh.receiveShadow = true

    if (mat && mat.transparent) {
      mesh.renderOrder = 1
    }

    this.meshes.push(mesh)
    this.group.add(mesh)
  }

  /**
   * Build a BatchedMesh for blocks requiring per-instance depth sorting
   */
  private buildBatchedMesh(
    blockId: BlockId,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    positions: Float32Array,
    lights: Uint8Array,
    count: number,
    matrix: THREE.Matrix4
  ): void {
    const posAttr = geometry.getAttribute('position')
    const indexAttr = geometry.getIndex()
    const vertexCount = posAttr ? posAttr.count : 0
    const indexCount = indexAttr ? indexAttr.count : vertexCount * 2

    const batchedMesh = new THREE.BatchedMesh(
      count,
      vertexCount * count,
      indexCount * count,
      Array.isArray(material) ? material[0] : material
    )
    batchedMesh.frustumCulled = false  // Disable frustum culling - causes edge artifacts
    batchedMesh.perObjectFrustumCulled = false  // Disable per-instance culling too
    batchedMesh.castShadow = true
    batchedMesh.receiveShadow = true
    batchedMesh.sortObjects = true  // Enable per-instance depth sorting
    batchedMesh.renderOrder = 2     // Render after alpha-tested transparency

    // Add geometry once
    const geometryId = batchedMesh.addGeometry(geometry)

    // Add instances
    for (let j = 0; j < count; j++) {
      const posIdx = j * 3
      matrix.setPosition(
        positions[posIdx] + 0.5,
        positions[posIdx + 1] + 0.5,
        positions[posIdx + 2] + 0.5
      )
      const instanceId = batchedMesh.addInstance(geometryId)
      batchedMesh.setMatrixAt(instanceId, matrix)

      // Calculate brightness from light level
      const light = lights[j] ?? 15
      const minBrightness = 0.02
      const normalized = light / 15
      const brightness = minBrightness + Math.pow(normalized, 2.2) * (1 - minBrightness)
      batchedMesh.setColorAt(instanceId, new THREE.Color(brightness, brightness, brightness))
    }

    this.batchedMeshes.set(blockId, batchedMesh)
    this.group.add(batchedMesh)
  }

  /**
   * Build an InstancedMesh for opaque or alpha-tested blocks.
   */
  private buildInstancedMesh(
    blockId: BlockId,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    positions: Float32Array,
    lights: Uint8Array,
    metadata: Uint8Array,
    count: number,
    matrix: THREE.Matrix4,
    mat: THREE.Material | undefined
  ): void {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
    instancedMesh.frustumCulled = true
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true

    // Set renderOrder for alpha-tested transparent materials
    if (mat && mat.transparent) {
      instancedMesh.renderOrder = 1
    }

    const colors = new Float32Array(count * 3)
    const rotationMatrix = new THREE.Matrix4()
    const positionVector = new THREE.Vector3()

    for (let j = 0; j < count; j++) {
      const posIdx = j * 3
      const x = positions[posIdx] + 0.5
      const y = positions[posIdx + 1] + 0.5
      const z = positions[posIdx + 2] + 0.5

      // Get rotation from metadata (bits 0-1 = facing direction)
      const blockMeta = metadata[j] ?? 0
      const facing = getMetadataFacing(blockMeta)
      const rotationY = facingToRotationY(facing)

      // Build transformation matrix: rotation then translation
      if (rotationY !== 0) {
        rotationMatrix.makeRotationY(rotationY)
        positionVector.set(x, y, z)
        matrix.copy(rotationMatrix)
        matrix.setPosition(positionVector)
      } else {
        matrix.identity()
        matrix.setPosition(x, y, z)
      }

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
      // Remove buffer attributes from WebGL cache - critical for memory cleanup
      // Same pattern as InstancedMesh cleanup below
      if (renderer) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const glAttributes = (renderer as any).attributes
        if (glAttributes) {
          const geometry = mesh.geometry
          const position = geometry.getAttribute('position')
          const uv = geometry.getAttribute('uv')
          const normal = geometry.getAttribute('normal')
          const color = geometry.getAttribute('color')
          const index = geometry.getIndex()
          if (position) glAttributes.remove(position)
          if (uv) glAttributes.remove(uv)
          if (normal) glAttributes.remove(normal)
          if (color) glAttributes.remove(color)
          if (index) glAttributes.remove(index)
        }
      }
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

    for (const batchedMesh of this.batchedMeshes.values()) {
      batchedMesh.dispose()
      // Note: geometry and material are shared from Block definitions
    }
    this.batchedMeshes.clear()

    // Clear group children to release references
    this.group.clear()
  }

  /**
   * Get the number of mesh objects in this chunk.
   */
  getMeshCount(): number {
    return this.meshes.length + this.instancedMeshes.size + this.batchedMeshes.size
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
