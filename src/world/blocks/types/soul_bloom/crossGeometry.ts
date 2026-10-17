import * as THREE from 'three'

/**
 * Cross-billboard plant geometry (two diagonal quads, centred in the block,
 * standing on its floor) with UVs - the morel/flower style.
 * @param height Height in blocks (0-1)
 * @param width Width factor (1 = corner to corner)
 */
export function createCrossGeometry(height: number, width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const w = width * 0.5
  const bottom = -0.5
  const top = bottom + height
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
