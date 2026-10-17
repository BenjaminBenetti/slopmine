import * as THREE from 'three'

/**
 * Cross-billboard geometry (two diagonal planes, an X seen from above) for
 * sprite blocks in a centered unit cell (-0.5..0.5). The sprite spans
 * [bottom, top] vertically; `width` is the plane extent along its diagonal
 * as a fraction of the cell (1 = corner to corner). Pair with a DoubleSide,
 * alpha-tested material.
 */
export function createCrossSpriteGeometry(bottom: number, top: number, width: number): THREE.BufferGeometry {
  const w = width * 0.5
  const geo = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    -w, bottom, -w, w, bottom, w, w, top, w,
    -w, bottom, -w, w, top, w, -w, top, -w,
    -w, bottom, w, w, bottom, -w, w, top, -w,
    -w, bottom, w, w, top, -w, -w, top, w,
  ])
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()
  return geo
}

/** Tag every group of a box geometry with one material index (torch pattern). */
export function withMaterialIndex(geo: THREE.BufferGeometry, materialIndex: number): THREE.BufferGeometry {
  for (const group of geo.groups) group.materialIndex = materialIndex
  return geo
}

/** An axis-aligned box in the centered unit cell, given by its min corner (cell 0..1 space) and size. */
export function cellBox(x: number, y: number, z: number, sx: number, sy: number, sz: number, materialIndex: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(sx, sy, sz)
  geo.translate(x + sx / 2 - 0.5, y + sy / 2 - 0.5, z + sz / 2 - 0.5)
  return withMaterialIndex(geo, materialIndex)
}
