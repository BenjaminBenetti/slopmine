import * as THREE from 'three'
import type { IItem } from '../../../items/Item.ts'
import { getBlockForItem, createBlockDisplayMesh } from '../../itemdisplay/index.ts'
import { loadBlockTexture } from '../../TextureLoader.ts'

/**
 * Scale for held block items
 */
const BLOCK_SCALE = 0.25

/**
 * Creates a miniature 3D mesh for block items held in the hand.
 *
 * Uses the shared item-display factory, so blocks with custom geometry
 * (torches, flowers, slabs, doors, ...) render as that geometry - the same
 * one the world renderer uses - not as a generic cube.
 */
export function createBlockMesh(item: IItem): THREE.Object3D {
  const group = new THREE.Group()

  const block = getBlockForItem(item)

  let mesh: THREE.Mesh

  if (block) {
    // The block's real shape and materials (shared - never disposed)
    mesh = createBlockDisplayMesh(block)
  } else {
    // Fallback: use item icon as texture on all faces
    mesh = createFallbackBlockMesh(item)
  }

  // Scale down for hand view
  mesh.scale.setScalar(BLOCK_SCALE)

  // Rotate for nice isometric-ish view
  mesh.rotation.x = -Math.PI / 6 // Tilt forward
  mesh.rotation.y = Math.PI / 4 // 45 degree rotation

  group.add(mesh)

  return group
}

/**
 * Creates a fallback cube using the item's icon texture.
 */
function createFallbackBlockMesh(item: IItem): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1)

  let material: THREE.Material

  if (item.iconUrl) {
    const texture = loadBlockTexture(item.iconUrl)
    material = new THREE.MeshLambertMaterial({ map: texture })
  } else {
    // Ultimate fallback: gray cube
    material = new THREE.MeshLambertMaterial({ color: 0x888888 })
  }

  return new THREE.Mesh(geometry, material)
}
