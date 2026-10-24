import * as THREE from 'three'
import { mergeTaggedParts } from '../model_shared/mergeTaggedParts.ts'

/**
 * Box-built custom geometry for the Infernal Bastion's decor blocks (bars,
 * chains, lanterns, anvils, racks, thrones, hoards). Cell space is
 * [-0.5, 0.5] on every axis (the instanced renderer adds +0.5); canonical
 * models face +Z (SOUTH) and are turned by the metadata facing.
 */
export interface DecorBox {
  /** Size. */
  readonly w: number
  readonly h: number
  readonly d: number
  /** Centre x / z and BOTTOM y (cell space). */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Material group index. */
  readonly m: number
  /** Optional rotation around Y (radians). */
  readonly ry?: number
}

/**
 * Merge boxes into one geometry with one group per material index (group i
 * draws with materials[i]; every index up to the highest used needs a box).
 */
export function buildDecorGeometry(boxes: readonly DecorBox[]): THREE.BufferGeometry {
  const parts = boxes.map((b) => {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d)
    if (b.ry) geo.rotateY(b.ry)
    geo.translate(b.x, b.y + b.h / 2, b.z)
    geo.groups.forEach((g) => {
      g.materialIndex = b.m
    })
    return geo
  })
  return mergeTaggedParts(parts)
}

/** Bottom of the cell. */
export const FLOOR = -0.5
/** Top of the cell. */
export const CEILING = 0.5
