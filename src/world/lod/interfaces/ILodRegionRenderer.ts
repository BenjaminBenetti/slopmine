import type { LodMeshRegionResult } from '../LodTypes.ts'

/**
 * Display side of the LOD far terrain (implemented by renderer/lod/LodRenderer).
 * LodManager decides what is shown; the renderer owns the GPU resources.
 */
export interface ILodRegionRenderer {
  /**
   * Show a freshly meshed region, replacing (and disposing) its previous
   * mesh. Takes ownership of the result's buffers.
   */
  setRegionMesh(result: LodMeshRegionResult): void

  /** Remove a region and free its GPU resources. */
  removeRegion(regionX: number, regionZ: number): void

  /**
   * Chunk slots of a region whose LOD geometry must not draw because full
   * detail shows there instead: bits for slots 0-31 / 32-63.
   */
  setRegionHiddenMask(regionX: number, regionZ: number, maskLo: number, maskHi: number): void

  /** Show or hide all LOD terrain. */
  setVisible(visible: boolean): void
}
