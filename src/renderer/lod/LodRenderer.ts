import * as THREE from 'three'
import type { ILodRegionRenderer } from '../../world/lod/interfaces/ILodRegionRenderer.ts'
import {
  LOD_POSITION_SCALE,
  LOD_REGION_BLOCKS,
  LOD_REGION_CHUNKS,
  lodPackKey,
  type LodMeshRegionResult,
} from '../../world/lod/LodTypes.ts'
import { LodTerrainMaterial } from './LodMaterial.ts'

/** Open-sky light level (0-15) of a chunk: its biome's skylight cap. */
export type LodSkyLightProvider = (chunkX: number, chunkZ: number) => number

/** Region side in stored position units (half blocks). */
const REGION_UNITS = LOD_REGION_BLOCKS / LOD_POSITION_SCALE

interface RegionMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, LodTerrainMaterial>
  /** Chunk slots with geometry: bits 0-31 / 32-63. */
  geometryLo: number
  geometryHi: number
  triangles: number
  /** Some chunk slot with geometry isn't hidden (the region has something to draw). */
  hasShownSlots: boolean
}

export interface LodRenderStats {
  readonly regions: number
  /** Regions with at least one chunk slot not handed off to full detail. */
  readonly drawnRegions: number
  /** Triangles in drawn regions (before frustum culling and slot masking). */
  readonly triangles: number
}

/**
 * Far-terrain display: one Mesh (one draw call) per 8x8-chunk LOD region,
 * each with its own LodTerrainMaterial so its hidden-slot mask can change
 * instantly without touching geometry. All materials share one program.
 *
 * GPU uploads: three.js uploads a geometry only when it renders a mesh that
 * is visible and inside the view frustum, so region meshes applied while LOD
 * is hidden (camera underground) or behind the camera would pile up and all
 * upload in the one frame they come into view (7-21 MB measured on turning
 * around or surfacing). Instead, hiding never takes a mesh out of the scene
 * traversal - it clears the region material's `visible` flag, which three.js
 * checks only after uploading - and a freshly applied mesh skips frustum
 * culling until its geometry is uploaded. Each region therefore uploads in
 * the frame LodManager applies it (at most one per frame).
 */
export class LodRenderer implements ILodRegionRenderer {
  readonly group = new THREE.Group()
  private readonly regions = new Map<number, RegionMesh>()
  private skyLightProvider: LodSkyLightProvider | null = null
  /** LOD terrain is shown (setVisible); regions draw only while this is set. */
  private visible = false

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'lod-far-terrain'
    scene.add(this.group)
  }

  /**
   * Where each chunk's open-sky light level comes from (full detail caps sky
   * light at a biome's skylightValue, 15 unless the biome sets one). Without
   * a provider every chunk is lit at full sky (15). Set before regions are
   * created.
   */
  setSkyLightProvider(provider: LodSkyLightProvider | null): void {
    this.skyLightProvider = provider
  }

  setRegionMesh(result: LodMeshRegionResult): void {
    const key = lodPackKey(result.regionX, result.regionZ)
    const geometry = createRegionGeometry(result)
    let region = this.regions.get(key)
    if (region) {
      region.mesh.geometry.dispose()
      region.mesh.geometry = geometry
    } else {
      const mesh = new THREE.Mesh(geometry, this.createRegionMaterial(result.regionX, result.regionZ))
      mesh.name = `lod-region ${result.regionX},${result.regionZ}`
      // Positions are region-local in half blocks: place and scale once
      mesh.position.set(result.regionX * LOD_REGION_BLOCKS, 0, result.regionZ * LOD_REGION_BLOCKS)
      mesh.scale.setScalar(LOD_POSITION_SCALE)
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      region = { mesh, geometryLo: 0, geometryHi: 0, triangles: 0, hasShownSlots: false }
      this.regions.set(key, region)
      this.group.add(mesh)
    }
    uploadOnNextRender(region.mesh)
    region.geometryLo = result.chunkMaskLo
    region.geometryHi = result.chunkMaskHi
    region.triangles = result.indices.length / 3
    this.updateRegionVisibility(region)
  }

  /** A region's material, with every chunk slot's open-sky light level. */
  private createRegionMaterial(regionX: number, regionZ: number): LodTerrainMaterial {
    const material = new LodTerrainMaterial()
    const provider = this.skyLightProvider
    if (provider) {
      for (let slot = 0; slot < LOD_REGION_CHUNKS * LOD_REGION_CHUNKS; slot++) {
        const chunkX = regionX * LOD_REGION_CHUNKS + (slot % LOD_REGION_CHUNKS)
        const chunkZ = regionZ * LOD_REGION_CHUNKS + Math.floor(slot / LOD_REGION_CHUNKS)
        material.setSlotSkyLight(slot, provider(chunkX, chunkZ))
      }
    }
    return material
  }

  removeRegion(regionX: number, regionZ: number): void {
    const key = lodPackKey(regionX, regionZ)
    const region = this.regions.get(key)
    if (!region) return
    this.regions.delete(key)
    this.group.remove(region.mesh)
    region.mesh.geometry.dispose()
    region.mesh.material.dispose()
  }

  setRegionHiddenMask(regionX: number, regionZ: number, maskLo: number, maskHi: number): void {
    const region = this.regions.get(lodPackKey(regionX, regionZ))
    if (!region) return
    const mask = region.mesh.material.hiddenMask
    mask[0] = maskLo
    mask[1] = maskHi
    this.updateRegionVisibility(region)
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    for (const region of this.regions.values()) this.updateRegionVisibility(region)
  }

  getStats(): LodRenderStats {
    let drawnRegions = 0
    let triangles = 0
    for (const region of this.regions.values()) {
      if (!region.mesh.material.visible) continue
      drawnRegions++
      triangles += region.triangles
    }
    return { regions: this.regions.size, drawnRegions, triangles }
  }

  /**
   * A region draws only while LOD is shown and some chunk slot with geometry
   * isn't hidden - through its material's `visible` flag, never the mesh's,
   * so hidden regions still upload (see the class comment).
   */
  private updateRegionVisibility(region: RegionMesh): void {
    const mask = region.mesh.material.hiddenMask
    region.hasShownSlots = ((region.geometryLo & ~mask[0]) | (region.geometryHi & ~mask[1])) !== 0
    region.mesh.material.visible = this.visible && region.hasShownSlots
  }

  dispose(): void {
    for (const region of this.regions.values()) {
      region.mesh.geometry.dispose()
      region.mesh.material.dispose()
    }
    this.regions.clear()
    this.group.clear()
    this.scene.remove(this.group)
  }
}

/**
 * Make three.js upload a mesh's new geometry the next time it renders, even
 * outside the view frustum: frustum culling is off until the position
 * buffer's upload, whose callback (after releasing its array) turns it back on.
 */
function uploadOnNextRender(mesh: THREE.Mesh): void {
  mesh.frustumCulled = false
  ;(mesh.geometry.getAttribute('position') as THREE.BufferAttribute).onUpload(function (this: THREE.BufferAttribute) {
    releaseArray.call(this)
    mesh.frustumCulled = true
  })
}

/**
 * Wrap a worker mesh result (transferred buffers, no copies) as geometry with
 * exact static bounds, so three never scans the vertices for them.
 */
function createRegionGeometry(result: LodMeshRegionResult): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3).onUpload(releaseArray))
  geometry.setAttribute('lodColor', new THREE.BufferAttribute(result.colors, 4, true).onUpload(releaseArray))
  geometry.setIndex(new THREE.BufferAttribute(result.indices, 1).onUpload(releaseArray))

  const minY = result.minY / LOD_POSITION_SCALE
  const maxY = result.maxY / LOD_POSITION_SCALE
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(0, minY, 0), new THREE.Vector3(REGION_UNITS, maxY, REGION_UNITS))
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere())
  return geometry
}

/**
 * Drop an attribute's JS array once it is on the GPU: LOD geometry is never
 * read back or updated, and three only needs the (kept) count afterwards.
 */
function releaseArray(this: THREE.BufferAttribute): void {
  ;(this as unknown as { array: ArrayLike<number> | null }).array = null
}
