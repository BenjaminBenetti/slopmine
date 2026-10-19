import type * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Merge box-model parts whose groups are tagged with a material index
 * (`cellBox`, `withMaterialIndex`) into one geometry with one group per
 * material: group i draws with materials[i]. `mergeGeometries(parts, true)`
 * numbers the groups by PART instead, so every part past the material count
 * drew nothing (lanterns without cages, braziers without flames). Every
 * material index from 0 to the highest used must have at least one part.
 */
export function mergeTaggedParts(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const byMaterial: THREE.BufferGeometry[][] = []
  for (const part of parts) {
    const index = part.groups[0]?.materialIndex ?? 0
    ;(byMaterial[index] ??= []).push(part)
  }
  const merged: THREE.BufferGeometry[] = []
  for (let i = 0; i < byMaterial.length; i++) {
    const list = byMaterial[i]
    if (!list || list.length === 0) throw new Error(`mergeTaggedParts: no part uses material ${i}`)
    const geometry = mergeGeometries(list, false)
    if (!geometry) throw new Error('mergeTaggedParts: incompatible parts')
    merged.push(geometry)
  }
  const result = mergeGeometries(merged, true)
  if (!result) throw new Error('mergeTaggedParts: merge failed')
  return result
}
