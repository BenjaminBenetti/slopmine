import * as THREE from 'three'
import type { IItem } from '../../items/Item.ts'
import type { IBlock } from '../../world/interfaces/IBlock.ts'
import { BlockRegistry } from '../../world/blocks/BlockRegistry.ts'

/**
 * THE single source of truth for miniature block visuals shown outside the
 * voxel grid: the held item in first person, dropped item entities on the
 * ground, and any future display surface.
 *
 * It reuses the SAME geometry and materials the world's instanced renderer
 * (ChunkMesh) and BlockIconGenerator use: `block.getInstanceGeometry()` /
 * `block.getInstanceMaterial()`. A block with custom geometry (torch, flower
 * cross, slab, ladder, door, ...) therefore automatically renders with that
 * geometry everywhere, with zero per-surface work.
 *
 * If a mini version of a block looks wrong in the hand or on the ground, fix
 * the block's `getInstanceGeometry()` / `getInstanceMaterial()` overrides -
 * do NOT special-case an individual display surface, and do NOT build meshes
 * from `SharedGeometry.cube` directly (that is exactly the bug this module
 * exists to prevent).
 */

/**
 * Item IDs ending in '_block' that should render as a flat extruded icon
 * instead of their block geometry - a deliberate visual preference for
 * wand/stick-like items, not a workaround for broken geometry.
 */
const BLOCK_ITEM_ICON_OVERRIDES: ReadonlySet<string> = new Set(['divining_stick_block'])

/**
 * Whether this item should be displayed as a miniature block
 * (as opposed to an extruded icon).
 */
export function isBlockShapedItem(item: IItem): boolean {
  return item.id.endsWith('_block') && !BLOCK_ITEM_ICON_OVERRIDES.has(item.id)
}

/**
 * Resolve the block an item represents, following the item-id convention
 * `<block_name>_block` (e.g. "grass_block" -> registry block "grass").
 * Returns undefined for non-block items, icon-override items, and ids with
 * no matching registry entry.
 */
export function getBlockForItem(item: IItem): IBlock | undefined {
  if (!isBlockShapedItem(item)) {
    return undefined
  }
  return BlockRegistry.getInstance().getBlockByName(item.id.slice(0, -'_block'.length))
}

/**
 * Create a display mesh for a block in its own centered unit block space
 * ([-0.5, 0.5] per axis, same convention as world rendering). Callers scale,
 * position, and rotate the mesh for their surface.
 *
 * SHARED RESOURCES: the geometry and materials are the block registry's
 * singletons, shared with world rendering. The mesh is marked with
 * `markSharedDisplayResources` so `disposeItemDisplayObject` skips it -
 * always dispose display meshes through that helper, never by disposing
 * geometry/materials directly.
 */
export function createBlockDisplayMesh(block: IBlock): THREE.Mesh {
  const mesh = new THREE.Mesh(block.getInstanceGeometry(), block.getInstanceMaterial())
  markSharedDisplayResources(mesh)
  return mesh
}

/**
 * Mark a mesh as referencing SHARED geometry/materials (registry singletons,
 * cached icon geometry, shared material instances). `disposeItemDisplayObject`
 * will not dispose a flagged mesh's resources.
 */
export function markSharedDisplayResources(mesh: THREE.Mesh): void {
  mesh.userData.sharedDisplayResources = true
}

/**
 * Dispose an item-display object tree, skipping meshes whose resources are
 * shared (flagged via `markSharedDisplayResources`). This is the ONLY correct
 * way to clean up held-item / dropped-item / preview meshes: naive recursive
 * geometry/material disposal destroys resources the world renderer and every
 * other display surface are still using.
 */
export function disposeItemDisplayObject(object: THREE.Object3D): void {
  if (object instanceof THREE.Mesh && !object.userData.sharedDisplayResources) {
    object.geometry?.dispose()
    if (Array.isArray(object.material)) {
      object.material.forEach((m) => m.dispose())
    } else if (object.material) {
      object.material.dispose()
    }
  }
  object.children.forEach((child) => disposeItemDisplayObject(child))
}
