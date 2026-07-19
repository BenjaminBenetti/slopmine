import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Fence gate dimensions - shared by all wood variants.
// Geometry is centered around Y=0 (renderer adds +0.5); front faces +Z.
const POST_SIZE = 0.15         // Corner post cross-section
const POST_HEIGHT = 0.9        // Posts rise from the cell floor, slightly under a full block
const BAR_HEIGHT = 0.12        // Horizontal bar thickness (Y)
const BAR_DEPTH = 0.1          // Bar thickness perpendicular to its span
const BAR_YS = [-0.32, 0, 0.32] // Bar center heights (local, Y=0 centered)
const OPEN_BAR_X = 0.4         // Swung-open bars sit at x ~ +0.4

// Vertical offset - geometry is centered around Y=0 since renderer adds +0.5
const Y_OFFSET = -0.5

/**
 * Build the two corner posts (at x = +/- edge), shared by both variants.
 */
function buildPosts(): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = []

  for (const sign of [-1, 1]) {
    const post = new THREE.BoxGeometry(POST_SIZE, POST_HEIGHT, POST_SIZE)
    post.translate(sign * (0.5 - POST_SIZE / 2), POST_HEIGHT / 2 + Y_OFFSET, 0)
    geometries.push(post)
  }

  return geometries
}

/**
 * Closed fence gate: two corner posts + 3 horizontal bars spanning X,
 * thin in Z, centered at z=0.
 */
export const fenceGateClosedGeometry = (() => {
  const geometries = buildPosts()

  const barSpan = 1 - POST_SIZE * 2
  for (const barY of BAR_YS) {
    const bar = new THREE.BoxGeometry(barSpan, BAR_HEIGHT, BAR_DEPTH)
    bar.translate(0, barY, 0)
    geometries.push(bar)
  }

  return mergeGeometries(geometries, false)
})()

/**
 * Open fence gate: same corner posts + 3 bars swung to run along Z at x ~ +0.4.
 */
export const fenceGateOpenGeometry = (() => {
  const geometries = buildPosts()

  for (const barY of BAR_YS) {
    const bar = new THREE.BoxGeometry(BAR_DEPTH, BAR_HEIGHT, 1 - POST_SIZE)
    bar.translate(OPEN_BAR_X, barY, POST_SIZE / 2)
    geometries.push(bar)
  }

  return mergeGeometries(geometries, false)
})()
