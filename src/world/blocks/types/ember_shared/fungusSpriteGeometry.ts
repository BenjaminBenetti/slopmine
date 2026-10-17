import * as THREE from 'three'

/**
 * Cross-billboard geometry (two diagonal planes) standing on the cell floor,
 * shared by the Ember Grove's ground sprites (glowcaps, crimson sprouts).
 * Block-local space: Y -0.5 (floor) .. -0.5 + height.
 * @param height Plane height (0-1)
 * @param width Plane width factor (1 = corner to corner)
 */
export function createGroundCrossGeometry(height: number, width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const w = width * 0.5
  const bottom = -0.5
  const top = bottom + height
  const vertices = new Float32Array([
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])
  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 0,  1, 1,  0, 1,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()
  return geo
}

/**
 * Hanging cross (two axis-aligned planes) anchored at the cell ceiling,
 * spanning the full cell height (spore strands chain into long threads).
 */
export function createHangingCrossGeometry(width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const w = width / 2
  const top = 0.5
  const bottom = -0.5
  const vertices = new Float32Array([
    -w, bottom, 0,  w, bottom, 0,  w, top, 0,
    -w, bottom, 0,  w, top, 0,  -w, top, 0,
    0, bottom, -w,  0, bottom, w,  0, top, w,
    0, bottom, -w,  0, top, w,  0, top, -w,
  ])
  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 0,  1, 1,  0, 1,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()
  return geo
}
