/**
 * Which optional stages the generation worker runs for a sub-chunk.
 *
 * Full-detail chunks run everything. LOD far-terrain tiles only need the final
 * top surface, so they skip the stages that never change it (or only change
 * it underground) - the terrain fill, water and every surface feature still
 * run, so LOD tiles show the same world as full detail.
 */
export interface SubChunkGenerationOptions {
  /**
   * Carve caves, ravines and entrance ramps. The surface-open probe features
   * use to avoid cave mouths stays available either way, so structure
   * placement is identical with carving off.
   */
  readonly caves: boolean
  /** Place ore veins. */
  readonly ores: boolean
  /** Cave wall lining (mineral sprinkles next to cave air and lava). */
  readonly lining: boolean
  /** Local light pass (sky + block light within the sub-chunk; see SubChunkLight.ts). */
  readonly skylight: boolean
  /** Full-opacity scan for occlusion culling. */
  readonly opacity: boolean
}

/** Every stage - the normal full-detail pipeline. */
export const FULL_GENERATION: SubChunkGenerationOptions = {
  caves: true,
  ores: true,
  lining: true,
  skylight: true,
  opacity: true,
}

/** Surface-only pipeline used for LOD tiles. */
export const SURFACE_ONLY_GENERATION: SubChunkGenerationOptions = {
  caves: false,
  ores: false,
  lining: false,
  skylight: false,
  opacity: false,
}
