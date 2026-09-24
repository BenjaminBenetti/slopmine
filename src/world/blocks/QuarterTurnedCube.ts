import * as THREE from 'three'
import { BlockFace } from '../interfaces/IBlock.ts'

/** BoxGeometry's face groups (px, nx, py, ny, pz, nz) as block faces. */
const BOX_GROUP_FACES: readonly BlockFace[] = [
  BlockFace.EAST, BlockFace.WEST, BlockFace.TOP, BlockFace.BOTTOM, BlockFace.SOUTH, BlockFace.NORTH,
]

/**
 * A unit cube like SharedGeometry.cube whose listed faces have their texture
 * turned a quarter, (u, v) → (v, 1 − u) - the same turn the greedy mesher
 * applies to QUARTER_TURN_FACES - so held, dropped and icon displays of the
 * block show its texture the way the world does (e.g. bark grain along a
 * fallen log). Shared geometry: create once per block type at module load.
 */
export function createQuarterTurnedCube(faces: readonly BlockFace[]): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  const verticesPerFace = uv.count / BOX_GROUP_FACES.length
  for (let group = 0; group < BOX_GROUP_FACES.length; group++) {
    if (!faces.includes(BOX_GROUP_FACES[group])) continue
    for (let k = 0; k < verticesPerFace; k++) {
      const i = group * verticesPerFace + k
      const u = uv.getX(i)
      uv.setXY(i, uv.getY(i), 1 - u)
    }
  }
  return geometry
}
