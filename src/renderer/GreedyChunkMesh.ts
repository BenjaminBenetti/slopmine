import * as THREE from 'three'
import { type BlockId, hasGlowHalo, isMultiMeshBlock } from '../world/interfaces/IBlock.ts'
import type { IChunkCoordinate, SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { createSubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'
import type { MeshGroup, GreedyMeshResponse } from '../workers/GreedyMeshWorker.ts'
import type { IChunkMesh } from './interfaces/IChunkMesh.ts'
import { getChunkMaterial, getChunkCutoutDepthMaterial } from './ChunkMaterial.ts'
import {
  CHUNK_VERTEX_STRIDE, CHUNK_VERTEX_POSITION_OFFSET, CHUNK_VERTEX_TEX_OFFSET, CHUNK_VERTEX_LIGHT_OFFSET,
  LIQUID_SIDE_CLIP_SHIFT,
} from './ChunkVertexFormat.ts'
import { prepareInstancedBlockMaterial, writeInstanceLight } from './InstancedBlockLight.ts'
import { LIQUID_GLOW_ATTRIBUTE } from './LiquidMaterials.ts'
import { FoliageBatch, releaseFoliageMesh } from './foliage/FoliageRenderer.ts'
import { isFoliageBlock } from '../world/blocks/foliage/FoliageSpec.ts'
import { getMetadataFacing, getMetadataUses3DRotation, getMetadataFlipped, facingToEuler } from '../world/blocks/BlockFacing.ts'

// Fallback when the block texture array isn't ready (should not happen: it is
// built before any chunk is meshed)
let fallbackMaterial: THREE.MeshLambertMaterial | null = null

/**
 * Get the shared chunk material for a greedy mesh group.
 */
function getGreedyMaterial(isCutout: boolean): THREE.Material {
  const material = getChunkMaterial(isCutout)
  if (material) return material
  console.warn('Block texture array not ready, using fallback chunk material')
  fallbackMaterial ??= new THREE.MeshLambertMaterial({ color: 0xff00ff })
  return fallbackMaterial
}

/**
 * Release a buffer's JS-side array once it is on the GPU. Chunk geometry is
 * never read back on the CPU (only `.count`, which is kept), so holding the
 * array would double its memory.
 */
function releaseArrayAfterUpload(this: { array: ArrayLike<number> | null }): void {
  this.array = null
}

/** Reusable light → vertex colour scratch. */
const lightColor = { r: 1, g: 1, b: 1 }

/**
 * Liquid vertex colour for a packed light byte (sky << 4 | block): the light
 * LEVELS as (sky / 15, block / 15, 1). The liquid materials shade them with
 * the shared world light model at render time (LiquidMaterials), so water
 * follows daylight, the light floor and warm block light like terrain; white
 * (icons) means full light.
 */
function packedLightToColor(packed: number): typeof lightColor {
  lightColor.r = (packed >> 4) / 15
  lightColor.g = (packed & 15) / 15
  lightColor.b = 1
  return lightColor
}

/**
 * Manages greedy-meshed geometry for a single sub-chunk.
 * Uses BufferGeometry with merged face quads instead of instanced cubes.
 */
export class GreedyChunkMesh implements IChunkMesh {
  private readonly meshes: THREE.Mesh[] = []
  private readonly instancedMeshes: Map<BlockId, THREE.InstancedMesh> = new Map()
  private foliageMesh: THREE.Mesh | null = null
  private readonly group: THREE.Group = new THREE.Group()

  readonly chunkCoordinate: IChunkCoordinate
  readonly subY: number
  readonly subChunkKey: SubChunkKey

  constructor(chunkCoordinate: IChunkCoordinate, subY: number) {
    this.chunkCoordinate = chunkCoordinate
    this.subY = subY
    this.subChunkKey = createSubChunkKey(chunkCoordinate.x, chunkCoordinate.z, subY)

    // Chunk meshes are fully static once built (greedy geometry is local to the
    // sub-chunk origin, everything else is baked in world coordinates). Opt out
    // of the per-frame matrix recompose/multiply that three.js runs for every
    // scene object, and skip the subtree during scene.updateMatrixWorld
    // entirely. The one required world-matrix computation is forced once in
    // addToScene().
    this.group.matrixAutoUpdate = false
    this.group.matrixWorldAutoUpdate = false
  }

  /**
   * Set an explicit bounding box/sphere from the known 32-cube sub-chunk bounds,
   * so three.js never lazily scans every vertex via computeBoundingSphere on
   * first render.
   *
   * @param local True for geometry in sub-chunk local coordinates (greedy
   *   meshes, placed at the sub-chunk origin); false for world coordinates.
   */
  private setStaticChunkBounds(geometry: THREE.BufferGeometry, local: boolean): void {
    const minX = local ? 0 : Number(this.chunkCoordinate.x) * CHUNK_SIZE_X
    const minY = local ? 0 : this.subY * SUB_CHUNK_HEIGHT
    const minZ = local ? 0 : Number(this.chunkCoordinate.z) * CHUNK_SIZE_Z
    const maxX = minX + CHUNK_SIZE_X
    const maxY = minY + SUB_CHUNK_HEIGHT
    const maxZ = minZ + CHUNK_SIZE_Z

    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    )
    // Sphere enclosing the sub-chunk cube: center at midpoint, radius = half diagonal.
    const cx = minX + CHUNK_SIZE_X / 2
    const cy = minY + SUB_CHUNK_HEIGHT / 2
    const cz = minZ + CHUNK_SIZE_Z / 2
    const radius = Math.sqrt(
      (CHUNK_SIZE_X / 2) ** 2 + (SUB_CHUNK_HEIGHT / 2) ** 2 + (CHUNK_SIZE_Z / 2) ** 2
    )
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), radius)
  }

  /**
   * Build meshes from greedy mesh worker response.
   */
  build(response: GreedyMeshResponse): void {
    // Opaque greedy faces first, then alpha-tested (cutout) faces
    if (response.opaque) this.buildMeshGroup(response.opaque, false)
    if (response.cutout) this.buildMeshGroup(response.cutout, true)

    // Handle non-greedy blocks (torch, etc.) with InstancedMesh fallback
    this.buildNonGreedyBlocks(
      response.nonGreedyBlocks,
      response.nonGreedyLights,
      response.nonGreedyMetadata,
      response.nonGreedyFaceVisibility,
      response.nonGreedyLiquidGlow ?? []
    )
  }

  /**
   * Build the mesh for one greedy group (packed vertex format, local coords).
   */
  private buildMeshGroup(meshGroup: MeshGroup, isCutout: boolean): void {
    if (meshGroup.vertices.length === 0) return

    const geometry = new THREE.BufferGeometry()

    // Wrap the transferred bytes directly (zero copy); see ChunkVertexFormat.ts.
    // `position` is read as 4 bytes (x, y, z, pad) so every attribute is a
    // 4-component byte format; shaders only use its xyz.
    const interleaved = new THREE.InterleavedBuffer(meshGroup.vertices, CHUNK_VERTEX_STRIDE)
    interleaved.onUpload(releaseArrayAfterUpload)
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 4, CHUNK_VERTEX_POSITION_OFFSET))
    geometry.setAttribute('aTex', new THREE.InterleavedBufferAttribute(interleaved, 4, CHUNK_VERTEX_TEX_OFFSET))
    geometry.setAttribute('aLight', new THREE.InterleavedBufferAttribute(interleaved, 4, CHUNK_VERTEX_LIGHT_OFFSET))
    const index = new THREE.BufferAttribute(meshGroup.indices, 1)
    index.onUpload(releaseArrayAfterUpload)
    geometry.setIndex(index)

    // Set bounds from the known sub-chunk cube instead of a lazy per-vertex scan.
    this.setStaticChunkBounds(geometry, true)

    const mesh = new THREE.Mesh(geometry, getGreedyMaterial(isCutout))
    mesh.frustumCulled = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (isCutout) {
      mesh.customDepthMaterial = getChunkCutoutDepthMaterial() ?? undefined
    }

    // Local geometry: place at the sub-chunk origin (static, so compose once)
    mesh.position.set(
      Number(this.chunkCoordinate.x) * CHUNK_SIZE_X,
      this.subY * SUB_CHUNK_HEIGHT,
      Number(this.chunkCoordinate.z) * CHUNK_SIZE_Z
    )
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()

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
    nonGreedyFaceVisibility: Array<[number, Uint32Array]>,
    nonGreedyLiquidGlow: Array<[number, Uint8Array]>
  ): void {
    const matrix = new THREE.Matrix4()
    const faceVisMap = new Map(nonGreedyFaceVisibility)
    const liquidGlowMap = new Map(nonGreedyLiquidGlow)
    const foliage = new FoliageBatch()

    for (let i = 0; i < nonGreedyBlocks.length; i++) {
      const [blockId, positions] = nonGreedyBlocks[i]
      const lights = nonGreedyLights[i]?.[1] ?? new Uint8Array(0)
      const metadata = nonGreedyMetadata[i]?.[1] ?? new Uint8Array(0)
      const faceVis = faceVisMap.get(blockId)

      const count = positions.length / 3
      if (count === 0) continue

      const block = getBlock(blockId)

      // Grass, flowers, doodads: every kind shares the sub-chunk's one foliage mesh
      if (isFoliageBlock(block)) {
        foliage.add(blockId, block, positions, lights)
        continue
      }

      // Check if this is a liquid block with face visibility data
      if (block.properties.isLiquid && faceVis) {
        const material = block.getInstanceMaterial()
        const mat = Array.isArray(material) ? material[0] : material
        this.buildLiquidMesh(blockId, positions, lights, faceVis, liquidGlowMap.get(blockId) ?? null, material, mat)
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

      // Glowing water plants: a halo of light around each, after the liquids
      if (hasGlowHalo(block)) {
        const halo = block.getGlowHalo()
        const haloKey = blockId * 100 + 99
        this.buildInstancedMesh(haloKey, halo.geometry, halo.material, positions, lights, metadata, count, matrix, halo.material)
        const haloMesh = this.instancedMeshes.get(haloKey)!
        haloMesh.renderOrder = 2
        haloMesh.castShadow = false
        haloMesh.receiveShadow = false
      }
    }

    const foliageMesh = foliage.build(
      Number(this.chunkCoordinate.x) * CHUNK_SIZE_X,
      this.subY * SUB_CHUNK_HEIGHT,
      Number(this.chunkCoordinate.z) * CHUNK_SIZE_Z
    )
    if (foliageMesh) {
      this.foliageMesh = foliageMesh
      this.meshes.push(foliageMesh)
      this.group.add(foliageMesh)
    }
  }

  /**
   * Build a single merged mesh for liquid blocks with per-face visibility.
   * Emits only visible faces as direct geometry (one draw call per liquid type).
   * Extracts bounding box from block geometry to respect height variations.
   * Side faces of a height step start at the lower neighbour's surface (the
   * clip packed into the visibility value, see LIQUID_SIDE_CLIP_SHIFT).
   */
  private buildLiquidMesh(
    blockId: BlockId,
    positions: Float32Array,
    lights: Uint8Array,
    faceVisibility: Uint32Array,
    glow: Uint8Array | null,
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

    // Small inset to prevent z-fighting with adjacent solid blocks. Each face
    // plane moves inward along its own normal only; in-plane the face spans
    // the full block, so neighbouring liquid quads share their edges exactly
    // (an in-plane inset left 0.004-block slits between quads, which showed
    // the unfogged sky as bright grid lines from underwater).
    // No inset on top face (maxY) to avoid gaps in water surface when viewed from below
    const INSET = 0.002

    // Full block extents (face edges)
    const x0 = box.min.x, x1 = box.max.x
    const y0 = box.min.y, maxY = box.max.y
    const z0 = box.min.z, z1 = box.max.z
    // Inset face planes (except top face)
    const minX = x0 + INSET, maxX = x1 - INSET
    const minY = y0 + INSET
    const minZ = z0 + INSET, maxZ = z1 - INSET

    // Calculate UV scale for side faces based on height ratio
    const height = maxY - y0
    const uvHeight = height // Side face UVs scale with height

    // Face vertex definitions using actual bounding box dimensions
    // Each face has 4 vertices in CCW winding from outside
    const FACE_VERTS: number[][][] = [
      // TOP (bit 0) - +Y face
      [[x0, maxY, z0], [x1, maxY, z0], [x1, maxY, z1], [x0, maxY, z1]],
      // BOTTOM (bit 1) - -Y face
      [[x0, minY, z1], [x1, minY, z1], [x1, minY, z0], [x0, minY, z0]],
      // NORTH (bit 2) - -Z face
      [[x1, y0, minZ], [x0, y0, minZ], [x0, maxY, minZ], [x1, maxY, minZ]],
      // SOUTH (bit 3) - +Z face
      [[x0, y0, maxZ], [x1, y0, maxZ], [x1, maxY, maxZ], [x0, maxY, maxZ]],
      // EAST (bit 4) - +X face
      [[maxX, y0, z1], [maxX, y0, z0], [maxX, maxY, z0], [maxX, maxY, z1]],
      // WEST (bit 5) - -X face
      [[minX, y0, z0], [minX, y0, z1], [minX, maxY, z1], [minX, maxY, z0]],
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
    // Scatter glow of plants below (TOP faces; zero elsewhere and without glow)
    const glowArr = new Uint8Array(totalFaces * 4 * 3)
    const indices: number[] = []

    let vertOffset = 0

    for (let i = 0; i < count; i++) {
      const pattern = faceVisibility[i]
      if (pattern === 0) continue

      // Block position (center offset)
      const px = positions[i * 3] + 0.5
      const py = positions[i * 3 + 1] + 0.5
      const pz = positions[i * 3 + 2] + 0.5

      // Light colour from the shared curve (packed sky << 4 | block)
      const color = packedLightToColor(lights[i] ?? 0xF0)

      for (let f = 0; f < 6; f++) {
        if (!(pattern & (1 << f))) continue

        const verts = FACE_VERTS[f]
        const uvs = FACE_UVS[f]
        const norm = FACE_NORMALS[f]
        const baseVert = vertOffset
        // Side faces: raise the bottom edge (vertices 0 and 1, at y0 / v 0)
        // to the lower same-liquid neighbour's surface, texture kept aligned
        const clip = f >= 2 ? ((pattern >>> (LIQUID_SIDE_CLIP_SHIFT + 4 * (f - 2))) & 15) / 8 : 0

        // Emit 4 vertices for this face
        for (let v = 0; v < 4; v++) {
          const vi = vertOffset * 3
          const ui = vertOffset * 2
          const lift = v < 2 ? clip : 0

          posArr[vi] = px + verts[v][0]
          posArr[vi + 1] = py + verts[v][1] + lift
          posArr[vi + 2] = pz + verts[v][2]

          normArr[vi] = norm[0]
          normArr[vi + 1] = norm[1]
          normArr[vi + 2] = norm[2]

          uvArr[ui] = uvs[v][0]
          uvArr[ui + 1] = uvs[v][1] + lift

          colorArr[vi] = color.r
          colorArr[vi + 1] = color.g
          colorArr[vi + 2] = color.b

          if (glow && f === 0) {
            const gi = i * 12 + v * 3
            glowArr[vi] = glow[gi]
            glowArr[vi + 1] = glow[gi + 1]
            glowArr[vi + 2] = glow[gi + 2]
          }

          vertOffset++
        }

        // Emit 2 triangles (6 indices). The TOP/BOTTOM vertex lists run
        // clockwise seen from outside, so wind them reversed: with DoubleSide
        // three.js flips the shading normal on back faces, and a mis-wound top
        // would be shaded as if facing down (never sunlit).
        if (f <= 1) {
          indices.push(
            baseVert, baseVert + 2, baseVert + 1,
            baseVert, baseVert + 3, baseVert + 2
          )
        } else {
          indices.push(
            baseVert, baseVert + 1, baseVert + 2,
            baseVert, baseVert + 2, baseVert + 3
          )
        }
      }
    }

    // Create geometry (never read back on the CPU: JS copies are freed once uploaded)
    const geometry = new THREE.BufferGeometry()
    const attribute = (array: Float32Array | Uint8Array | Uint16Array | Uint32Array, itemSize: number, normalized = false) =>
      new THREE.BufferAttribute(array, itemSize, normalized).onUpload(releaseArrayAfterUpload)
    geometry.setAttribute('position', attribute(posArr, 3))
    geometry.setAttribute('normal', attribute(normArr, 3))
    geometry.setAttribute('uv', attribute(uvArr, 2))
    geometry.setAttribute('color', attribute(colorArr, 3))
    geometry.setAttribute(LIQUID_GLOW_ATTRIBUTE, attribute(glowArr, 3, true))

    // Use Uint32Array if needed
    const indexArray = vertOffset > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
    geometry.setIndex(attribute(indexArray, 1))

    // Set bounds from the known sub-chunk cube instead of a lazy per-vertex scan.
    this.setStaticChunkBounds(geometry, false)

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.matrixAutoUpdate = false

    if (mat && mat.transparent) {
      mesh.renderOrder = 1
    }

    this.meshes.push(mesh)
    this.group.add(mesh)
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
    // instanceColor carries light levels; the material turns them into light
    prepareInstancedBlockMaterial(material)
    const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
    instancedMesh.frustumCulled = true
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    instancedMesh.matrixAutoUpdate = false  // Static: per-instance transforms are baked

    // Set renderOrder for alpha-tested transparent materials
    if (mat && mat.transparent) {
      instancedMesh.renderOrder = 1
    }

    const lightLevels = new Float32Array(count * 3)
    const rotationMatrix = new THREE.Matrix4()
    const positionVector = new THREE.Vector3()

    for (let j = 0; j < count; j++) {
      const posIdx = j * 3
      const x = positions[posIdx] + 0.5
      const y = positions[posIdx + 1] + 0.5
      const z = positions[posIdx + 2] + 0.5

      // Get rotation from metadata (bits 0-2 = facing, bit 3 = uses 3D rotation)
      const blockMeta = metadata[j] ?? 0
      const facing = getMetadataFacing(blockMeta)
      const uses3D = getMetadataUses3DRotation(blockMeta)
      const flipped = getMetadataFlipped(blockMeta)
        const euler = facingToEuler(facing, uses3D, flipped)

      // Build transformation matrix: rotation then translation
      if (euler.x !== 0 || euler.y !== 0 || euler.z !== 0) {
        rotationMatrix.makeRotationFromEuler(new THREE.Euler(euler.x, euler.y, euler.z, 'XYZ'))
        positionVector.set(x, y, z)
        matrix.copy(rotationMatrix)
        matrix.setPosition(positionVector)
      } else {
        matrix.identity()
        matrix.setPosition(x, y, z)
      }

      instancedMesh.setMatrixAt(j, matrix)

      writeInstanceLight(lightLevels, j, lights[j] ?? 0xF0)
    }

    instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(lightLevels, 3)
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
    // The group opts out of the scene's per-frame updateMatrixWorld walk, so
    // force the one-time world-matrix computation now that it has a parent.
    this.group.updateMatrixWorld(true)
  }

  /**
   * Remove this chunk mesh from a scene.
   */
  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group)
  }

  /**
   * Dispose of all GPU resources. geometry.dispose() frees every attribute
   * and the index (three's WebGLGeometries), and InstancedMesh.dispose()
   * frees instanceMatrix / instanceColor (WebGLObjects).
   */
  dispose(): void {
    if (this.foliageMesh) {
      releaseFoliageMesh(this.foliageMesh)
      this.foliageMesh = null
    }
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      // Do NOT dispose mesh.material - chunk and liquid materials are shared
    }
    this.meshes.length = 0

    for (const instancedMesh of this.instancedMeshes.values()) {
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
