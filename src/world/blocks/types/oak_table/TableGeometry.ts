import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Table dimensions - shared by all wood variants
const TOP_THICKNESS = 0.12 // Top board: y 0.38..0.5
const LEG_SIZE = 0.1 // Leg post thickness (0.1 x 0.1)
const LEG_HEIGHT = 0.88 // Legs: y -0.5..0.38
const LEG_INSET = 0.5 - LEG_SIZE / 2 // Corner leg center offset from block center

/**
 * Build the table geometry: a full-width top board with 4 corner legs.
 * Geometry is centered around Y=0 (renderer adds +0.5); front faces +Z.
 */
function buildTableGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = []

  // Top board (y 0.38..0.5, full X/Z)
  const top = new THREE.BoxGeometry(1, TOP_THICKNESS, 1)
  top.translate(0, 0.5 - TOP_THICKNESS / 2, 0)
  geometries.push(top)

  // 4 corner legs (0.1 square, y -0.5..0.38)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
      leg.translate(sx * LEG_INSET, -0.5 + LEG_HEIGHT / 2, sz * LEG_INSET)
      geometries.push(leg)
    }
  }

  return mergeGeometries(geometries, false)
}

/**
 * Shared table geometry singleton used by all wood table variants.
 */
export const tableGeometry = buildTableGeometry()
