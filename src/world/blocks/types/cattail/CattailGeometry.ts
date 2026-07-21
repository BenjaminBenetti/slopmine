import * as THREE from 'three'

/**
 * Create cross geometry shared by both cattail halves.
 * Two diagonal planes intersecting in the center, forming an X when viewed
 * from above. Uses single-sided faces with DoubleSide material to avoid
 * z-fighting.
 * @param height Height of the plane in blocks
 * @param width Width of the plane in blocks (corner to corner diagonal)
 */
function createCattailCrossGeometry(height: number, width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5 // Half-width from center
  const bottom = -0.5
  const top = bottom + height

  // Two intersecting diagonal planes (single face each, material handles double-sided)
  const vertices = new Float32Array([
    // First plane (diagonal from -X,-Z to +X,+Z)
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    // Second plane (diagonal from -X,+Z to +X,-Z)
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])

  // UV coordinates for texture mapping
  const uvs = new Float32Array([
    // First plane
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
    // Second plane
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
  ])

  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()

  return geo
}

// Full block height per half; the two stacked halves form one 2-block plant
export const cattailCrossGeometry = createCattailCrossGeometry(1.0, 0.85)
