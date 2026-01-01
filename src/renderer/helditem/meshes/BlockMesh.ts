import * as THREE from 'three'
import type { IItem } from '../../../items/Item.ts'
import { BlockRegistry } from '../../../world/blocks/BlockRegistry.ts'
import { SharedGeometry } from '../../../world/blocks/Block.ts'
import { loadBlockTexture } from '../../TextureLoader.ts'

/**
 * Scale for held block items
 */
const BLOCK_SCALE = 0.25

/**
 * Creates a 3D cube mesh for block items.
 * Uses the actual block's materials for realistic rendering.
 */
export function createBlockMesh(item: IItem): THREE.Object3D {
  const group = new THREE.Group()

  // Try to get the actual block for this item
  // Item IDs follow pattern: "grass_block" -> block name "grass"
  const blockName = getBlockNameFromItemId(item.id)
  const block = blockName
    ? BlockRegistry.getInstance().getBlockByName(blockName)
    : undefined

  let mesh: THREE.Mesh

  if (block) {
    // Use the block's actual materials
    const materials = block.getInstanceMaterial()
    const geometry = SharedGeometry.cube.clone()
    mesh = new THREE.Mesh(geometry, materials)
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
 * Extract block name from item ID.
 * e.g., "grass_block" -> "grass", "oak_log_block" -> "oak_log"
 */
function getBlockNameFromItemId(itemId: string): string | null {
  if (!itemId.endsWith('_block')) {
    return null
  }
  return itemId.slice(0, -6) // Remove "_block" suffix
}

/**
 * Creates a fallback cube using the item's icon texture.
 */
function createFallbackBlockMesh(item: IItem): THREE.Mesh {
  const geometry = SharedGeometry.cube.clone()

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
