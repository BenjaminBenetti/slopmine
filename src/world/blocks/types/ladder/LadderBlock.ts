import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { LadderBlockItem } from '../../../../items/blocks/ladder/LadderBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { getMetadataFacing, BlockFacing } from '../../BlockFacing.ts'
import ladderTexUrl from './assets/ladder.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.LADDER, ladderTexUrl, true)

const ladderTexture = loadBlockTexture(ladderTexUrl)

const ladderMaterial = new THREE.MeshLambertMaterial({
  map: ladderTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Single vertical plane geometry for ladders.
 * - Faces +Z (SOUTH) direction by default
 * - Positioned at Z=-0.49 (near -Z edge) so after rotation it ends up
 *   at the edge closest to the attachment block, with front facing outward
 * - Width ~0.9 to provide some visual margin
 * - Full height (1.0) for natural ladder appearance
 * Rotation is applied via metadata/facing system.
 */
const ladderPlaneGeometry = (() => {
  const geo = new THREE.PlaneGeometry(0.9, 1.0)
  // Offset toward -Z edge so after rotation the plane is at the
  // attachment side with its textured front facing the player
  geo.translate(0, 0, -0.49)
  return geo
})()

export class LadderBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LADDER,
    name: 'ladder',
    isOpaque: false,
    isSolid: false, // Players can walk through ladders
    isLiquid: false,
    hardness: 0.4,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD, BlockTags.CLIMBABLE],
  }

  protected get defaultTextureId(): number {
    return TextureId.LADDER
  }

  protected getMaterials(): THREE.Material {
    return ladderMaterial
  }

  /**
   * Ladders use flat plane geometry with rotation, not greedy meshing.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Return flat plane geometry for instanced rendering.
   * Rotation is applied based on metadata facing value.
   */
  getInstanceGeometry(): THREE.BufferGeometry {
    return ladderPlaneGeometry
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a thin box positioned at the face where the ladder is visually rendered,
   * based on the facing direction stored in metadata.
   */
  getInteractionBox(metadata: number): THREE.Box3 {
    const facing = getMetadataFacing(metadata)
    const depth = 0.1 // Thin hitbox depth
    const margin = 0.05 // Side margin matching visual plane (0.9 width = 0.05 margin each side)

    switch (facing) {
      case BlockFacing.SOUTH:
        // Default (0°): plane at z=-0.49 → north edge (z≈0), facing +Z
        return new THREE.Box3(
          new THREE.Vector3(margin, 0, 0),
          new THREE.Vector3(1 - margin, 1, depth)
        )
      case BlockFacing.NORTH:
        // Rotated 180°: plane at z=+0.49 → south edge (z≈1), facing -Z
        return new THREE.Box3(
          new THREE.Vector3(margin, 0, 1 - depth),
          new THREE.Vector3(1 - margin, 1, 1)
        )
      case BlockFacing.EAST:
        // Rotated +90° CCW: plane at x=-0.49 → west edge (x≈0), facing +X
        return new THREE.Box3(
          new THREE.Vector3(0, 0, margin),
          new THREE.Vector3(depth, 1, 1 - margin)
        )
      case BlockFacing.WEST:
        // Rotated -90° CW: plane at x=+0.49 → east edge (x≈1), facing -X
        return new THREE.Box3(
          new THREE.Vector3(1 - depth, 0, margin),
          new THREE.Vector3(1, 1, 1 - margin)
        )
      // UP/DOWN should never occur for ladders - default to SOUTH behavior
      default:
        return new THREE.Box3(
          new THREE.Vector3(margin, 0, 0),
          new THREE.Vector3(1 - margin, 1, depth)
        )
    }
  }

  getDrops(): IItem[] {
    return [new LadderBlockItem()]
  }
}
