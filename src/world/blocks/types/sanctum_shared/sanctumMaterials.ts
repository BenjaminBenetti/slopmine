import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Shared materials and geometry helpers of the Prism Sanctum decor models
 * (pedestal, lantern, lens apparatus). Block materials are shared singletons
 * (instanced rendering, icons, held items) - never mutate them.
 */

/** Brass/gold fittings. */
export const sanctumGoldMaterial = new THREE.MeshLambertMaterial({ color: 0xc9a043 })
/** Dark polished abyssal stone (untextured, for small model parts). */
export const sanctumStoneMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2436 })
/** Glowing prism crystal (self-lit through its emissive term). */
export const sanctumCrystalMaterial = new THREE.MeshLambertMaterial({
  color: 0x9d6be0,
  emissive: new THREE.Color(0x7a44c8),
  emissiveIntensity: 0.9,
})
/** Unlit crystal heart (always full bright). */
export const sanctumCrystalCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xead6ff })

/**
 * The geometry as non-indexed (polyhedra already are; calling toNonIndexed on
 * them makes three.js warn - once per block per worker at startup).
 */
export function nonIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.index ? geometry.toNonIndexed() : geometry
}

/** A box (width, height, depth) centred at (x, y, z), as non-indexed geometry. */
export function part(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed()
}

/**
 * Merge geometry parts per material into one geometry with one group per
 * material (group i -> materials[i]). Every part must be non-indexed with
 * position/normal/uv.
 */
export function mergeByMaterial(partsPerMaterial: THREE.BufferGeometry[][]): THREE.BufferGeometry {
  const merged = partsPerMaterial.map((parts) => {
    const geo = mergeGeometries(parts, false)
    if (!geo) throw new Error('sanctum model: merge failed')
    return geo
  })
  const all = mergeGeometries(merged, true)
  if (!all) throw new Error('sanctum model: merge failed')
  return all
}
