/**
 * Biome-border blending for cave parameters.
 *
 * Pure module (no worker APIs) so it can be exercised headlessly. The worker
 * imports the shared boundary math from here for terrain-height blending too,
 * keeping caves and terrain on identical blend geometry.
 *
 * Blending mirrors getBlendedHeightAt: within BLEND_DISTANCE of a biome
 * region border, parameters blend toward the neighboring region's biome with
 * a smoothstep ramp (50/50 exactly on the border), bilinearly at corners.
 *
 * The boundary math here is anchored to the REQUESTING CHUNK's region:
 * cave lattice sampling reaches one column past the chunk (worldX+32), and
 * for chunks on a region edge that position lies at offset 0 of the NEXT
 * region. Position-derived boundary math would misread it as "near my west
 * boundary" and blend the biome a full region to the west; anchored math
 * yields distance 0 to the shared east boundary, blending the east neighbor
 * 50/50 — exactly what the adjacent chunk computes for the same position,
 * so the cave field is seam-free across region borders.
 */
import {
  resolveCaveParams,
  mixCaveParams,
  cloneCaveParams,
  type CaveConfig,
  type CaveParams,
  type CaveParamsComponent,
  type CaveSample,
  type CaveSampleGetter,
} from './CaveConfig.ts'

/** Size of a biome region in blocks (16 chunks x 32 blocks). */
export const BIOME_REGION_SIZE_BLOCKS = 16 * 32

/** Width of the blend zone on each side of a region boundary, in blocks. */
export const BLEND_DISTANCE = 96

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export interface BoundaryInfo {
  distance: number
  neighborDirection: -1 | 1
}

/**
 * Distance to the nearest region boundary for a coordinate, measured within
 * the region that starts at `regionStart` (the requesting chunk's region).
 * Positions past the region's far edge (offset >= region size) report
 * distance to that shared boundary with direction +1.
 */
export function getDistanceToBoundaryAnchored(worldCoord: number, regionStart: number): BoundaryInfo {
  const pos = worldCoord - regionStart
  const distToLow = pos
  const distToHigh = BIOME_REGION_SIZE_BLOCKS - pos
  if (distToLow < distToHigh) {
    return { distance: distToLow, neighborDirection: -1 }
  }
  return { distance: Math.max(0, distToHigh), neighborDirection: 1 }
}

/** Start (in blocks) of the region containing the coordinate. */
export function getRegionStart(worldCoord: number): number {
  return Math.floor(worldCoord / BIOME_REGION_SIZE_BLOCKS) * BIOME_REGION_SIZE_BLOCKS
}

/** Minimal view of a biome config the cave blend needs. */
export interface CaveBiomeSource {
  caves?: CaveConfig
}

/** The 3x3 biome neighborhood around a chunk's region (missing = same as primary). */
export interface CaveBlendNeighborhood<T extends CaveBiomeSource = CaveBiomeSource> {
  primary: T
  north?: T
  south?: T
  east?: T
  west?: T
  northeast?: T
  northwest?: T
  southeast?: T
  southwest?: T
}

/**
 * Create a per-column cave sample getter for a chunk.
 *
 * The returned sample's `params` mixes scale-free scalars by blend weight;
 * `components` carries each contributing biome's resolved params + weight so
 * the carver can evaluate noise fields at per-biome constant frequencies and
 * blend the field VALUES (never the frequencies — see CaveParamsComponent).
 *
 * The returned object and its arrays are scratch, valid until the next call.
 */
export function createCaveSampleGetter(
  biomeData: CaveBlendNeighborhood,
  chunkWorldX: number,
  chunkWorldZ: number
): CaveSampleGetter {
  const resolved = new Map<CaveBiomeSource, CaveParams>()
  const resolve = (config: CaveBiomeSource): CaveParams => {
    let params = resolved.get(config)
    if (!params) {
      params = resolveCaveParams(config.caves)
      resolved.set(config, params)
    }
    return params
  }

  const primary = resolve(biomeData.primary)
  const regionStartX = getRegionStart(chunkWorldX)
  const regionStartZ = getRegionStart(chunkWorldZ)

  const mixed = cloneCaveParams(primary)
  // Pooled component objects (comp0..comp3) are reassigned per call; the
  // component ARRAYS may be re-sorted, so slots must never be used to reach
  // the pooled objects — always assign through comp0..comp3 directly.
  const comp0: CaveParamsComponent = { params: primary, weight: 1 }
  const comp1: CaveParamsComponent = { params: primary, weight: 0 }
  const comp2: CaveParamsComponent = { params: primary, weight: 0 }
  const comp3: CaveParamsComponent = { params: primary, weight: 0 }
  const sample: { params: CaveParams; components: CaveParamsComponent[] } = {
    params: primary,
    components: [comp0],
  }
  const oneComponent = [comp0]
  const twoComponents = [comp0, comp1]
  const fourComponents = [comp0, comp1, comp2, comp3]

  // Order components canonically (by params, not by neighborhood role) so
  // both chunks bordering a seam sum fields and params in the same order —
  // floating-point addition isn't associative, and frame-dependent ordering
  // would let carve decisions differ across the seam by one ulp.
  const canonicalOrder = (a: CaveParamsComponent, b: CaveParamsComponent): number =>
    a.params.cheeseScale - b.params.cheeseScale ||
    a.params.spaghettiScale - b.params.spaghettiScale ||
    a.params.ravineScale - b.params.ravineScale ||
    a.params.entranceScale - b.params.entranceScale ||
    a.params.minY - b.params.minY ||
    a.params.maxY - b.params.maxY ||
    a.params.cheeseThreshold - b.params.cheeseThreshold ||
    a.params.spaghettiThickness - b.params.spaghettiThickness ||
    a.weight - b.weight

  return (worldX: number, worldZ: number): CaveSample => {
    const xBoundary = getDistanceToBoundaryAnchored(worldX, regionStartX)
    const zBoundary = getDistanceToBoundaryAnchored(worldZ, regionStartZ)
    const xInBlend = xBoundary.distance < BLEND_DISTANCE
    const zInBlend = zBoundary.distance < BLEND_DISTANCE

    if (!xInBlend && !zInBlend) {
      comp0.params = primary
      comp0.weight = 1
      sample.params = primary
      sample.components = oneComponent
      return sample
    }

    if (xInBlend && zInBlend) {
      // Corner: bilinear mix of the four corner biomes.
      const xNeighbor = xBoundary.neighborDirection === -1
        ? (biomeData.west ?? biomeData.primary)
        : (biomeData.east ?? biomeData.primary)
      const zNeighbor = zBoundary.neighborDirection === -1
        ? (biomeData.north ?? biomeData.primary)
        : (biomeData.south ?? biomeData.primary)
      let corner: CaveBiomeSource
      if (xBoundary.neighborDirection === 1 && zBoundary.neighborDirection === -1) {
        corner = biomeData.northeast ?? biomeData.primary
      } else if (xBoundary.neighborDirection === -1 && zBoundary.neighborDirection === -1) {
        corner = biomeData.northwest ?? biomeData.primary
      } else if (xBoundary.neighborDirection === 1 && zBoundary.neighborDirection === 1) {
        corner = biomeData.southeast ?? biomeData.primary
      } else {
        corner = biomeData.southwest ?? biomeData.primary
      }

      const u = 0.5 * (1 - smoothstep(xBoundary.distance / BLEND_DISTANCE))
      const v = 0.5 * (1 - smoothstep(zBoundary.distance / BLEND_DISTANCE))
      comp0.params = primary
      comp0.weight = (1 - u) * (1 - v)
      comp1.params = resolve(xNeighbor)
      comp1.weight = u * (1 - v)
      comp2.params = resolve(zNeighbor)
      comp2.weight = (1 - u) * v
      comp3.params = resolve(corner)
      comp3.weight = u * v
      fourComponents.sort(canonicalOrder)
      sample.params = mixCaveParams(fourComponents, mixed)
      sample.components = fourComponents
      return sample
    }

    // Single-axis blend.
    const boundary = xInBlend ? xBoundary : zBoundary
    const neighbor = xInBlend
      ? boundary.neighborDirection === -1
        ? (biomeData.west ?? biomeData.primary)
        : (biomeData.east ?? biomeData.primary)
      : boundary.neighborDirection === -1
        ? (biomeData.north ?? biomeData.primary)
        : (biomeData.south ?? biomeData.primary)

    const neighborWeight = 0.5 * (1 - smoothstep(boundary.distance / BLEND_DISTANCE))
    comp0.params = primary
    comp0.weight = 1 - neighborWeight
    comp1.params = resolve(neighbor)
    comp1.weight = neighborWeight
    twoComponents.sort(canonicalOrder)
    sample.params = mixCaveParams(twoComponents, mixed)
    sample.components = twoComponents
    return sample
  }
}