import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RopeLadderBlockItem } from '../../../../items/blocks/rope_ladder/RopeLadderBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { getMetadataFacing, BlockFacing } from '../../BlockFacing.ts'
import ropeLadderTexUrl from './assets/rope_ladder.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.ROPE_LADDER, ropeLadderTexUrl, true)

const ropeLadderTexture = loadBlockTexture(ropeLadderTexUrl)

const ropeLadderMaterial = new THREE.MeshLambertMaterial({
  map: ropeLadderTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Single vertical plane geometry for rope ladders.
 * - Faces +Z (SOUTH) direction by default
 * - Positioned at Z=-0.49 (near -Z edge) so after rotation it ends up
 *   at the edge closest to the attachment block, with front facing outward
 * - Width ~0.9 to provide some visual margin
 * - Full height (1.0) for natural ladder appearance
 * Rotation is applied via metadata/facing system.
 */
const ropeLadderPlaneGeometry = (() => {
  const geo = new THREE.PlaneGeometry(0.9, 1.0)
  // Offset toward -Z edge so after rotation the plane is at the
  // attachment side with its textured front facing the player
  geo.translate(0, 0, -0.49)
  return geo
})()

/**
 * Rope ladder block - a climbable ladder made from rope and wood.
 * 
 * Special behavior: When placed directly ABOVE or IN FRONT OF another
 * rope ladder, it will "drop" down through the chain and fill the first
 * air block below the chain. This makes it easy to extend rope ladders
 * downward. If no air blocks are available, it stays at the original
 * placement position.
 */
export class RopeLadderBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ROPE_LADDER,
    name: 'rope_ladder',
    isOpaque: false,
    isSolid: false, // Players can walk through rope ladders
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD, BlockTags.CLIMBABLE],
  }

  protected get defaultTextureId(): number {
    return TextureId.ROPE_LADDER
  }

  protected getMaterials(): THREE.Material {
    return ropeLadderMaterial
  }

  /**
   * Rope ladders use flat plane geometry with rotation, not greedy meshing.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Return flat plane geometry for instanced rendering.
   * Rotation is applied based on metadata facing value.
   */
  getInstanceGeometry(): THREE.BufferGeometry {
    return ropeLadderPlaneGeometry
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
        // Default (0deg): plane at z=-0.49 -> north edge (z~0), facing +Z
        return new THREE.Box3(
          new THREE.Vector3(margin, 0, 0),
          new THREE.Vector3(1 - margin, 1, depth)
        )
      case BlockFacing.NORTH:
        // Rotated 180deg: plane at z=+0.49 -> south edge (z~1), facing -Z
        return new THREE.Box3(
          new THREE.Vector3(margin, 0, 1 - depth),
          new THREE.Vector3(1 - margin, 1, 1)
        )
      case BlockFacing.EAST:
        // Rotated +90deg CCW: plane at x=-0.49 -> west edge (x~0), facing +X
        return new THREE.Box3(
          new THREE.Vector3(0, 0, margin),
          new THREE.Vector3(depth, 1, 1 - margin)
        )
      case BlockFacing.WEST:
        // Rotated -90deg CW: plane at x=+0.49 -> east edge (x~1), facing -X
        return new THREE.Box3(
          new THREE.Vector3(1 - depth, 0, margin),
          new THREE.Vector3(1, 1, 1 - margin)
        )
      // UP/DOWN should never occur for rope ladders - default to SOUTH behavior
      default:
        return new THREE.Box3(
          new THREE.Vector3(margin, 0, 0),
          new THREE.Vector3(1 - margin, 1, depth)
        )
    }
  }

  /**
   * Called when this rope ladder is placed.
   * 
   * Drop behavior triggers when:
   * 1. Placed directly ABOVE another rope ladder, OR
   * 2. Placed IN FRONT of (horizontally adjacent to) another rope ladder
   * 
   * When triggered, the block will "drop" down through the chain of rope
   * ladders and fill the first air block below the chain. If no air blocks
   * are available below the chain, the rope ladder stays at its original
   * placement position.
   */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    // Check if we're placing above a rope ladder
    const blockBelow = world.getBlock(x, y - 1n, z)
    const isAboveRopeLadder = blockBelow.properties.id === BlockIds.ROPE_LADDER

    // Check if we're placing in front of (horizontally adjacent to) a rope ladder
    const adjacentOffsets: Array<{ dx: bigint; dz: bigint }> = [
      { dx: 1n, dz: 0n },   // East
      { dx: -1n, dz: 0n },  // West
      { dx: 0n, dz: 1n },   // South
      { dx: 0n, dz: -1n },  // North
    ]

    let adjacentRopeLadderPos: { x: bigint; z: bigint } | null = null
    for (const offset of adjacentOffsets) {
      const adjX = x + offset.dx
      const adjZ = z + offset.dz
      const adjBlock = world.getBlock(adjX, y, adjZ)
      if (adjBlock.properties.id === BlockIds.ROPE_LADDER) {
        adjacentRopeLadderPos = { x: adjX, z: adjZ }
        break
      }
    }

    // If not above or adjacent to a rope ladder, normal placement
    if (!isAboveRopeLadder && !adjacentRopeLadderPos) {
      return
    }

    // Determine which column to scan for the drop
    // If above a rope ladder, use current position
    // If adjacent, use the adjacent rope ladder's column
    const scanX = isAboveRopeLadder ? x : adjacentRopeLadderPos!.x
    const scanZ = isAboveRopeLadder ? z : adjacentRopeLadderPos!.z

    // Find the top of the rope ladder chain in the target column
    let scanY = isAboveRopeLadder ? y - 1n : y
    
    // For adjacent placement, first verify there's actually a rope ladder at scanY
    // and scan up to find the top of the chain
    if (!isAboveRopeLadder) {
      // Scan up to find the top of the chain
      while (world.getBlock(scanX, scanY + 1n, scanZ).properties.id === BlockIds.ROPE_LADDER) {
        scanY += 1n
      }
    }

    // Now scan down through the chain of rope ladders to find the bottom
    while (world.getBlock(scanX, scanY, scanZ).properties.id === BlockIds.ROPE_LADDER) {
      scanY -= 1n
    }

    // Check if the position at the bottom of the chain is air
    const bottomBlock = world.getBlock(scanX, scanY, scanZ)
    if (bottomBlock.properties.id !== BlockIds.AIR) {
      // No air block below the chain - don't drop, stay at original position
      return
    }

    // Move the rope ladder from current position to the air block at the bottom
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    world.setBlock(x, y, z, BlockIds.AIR) // Remove from original position
    world.setBlock(scanX, scanY, scanZ, BlockIds.ROPE_LADDER, metadata) // Place at bottom of chain
  }

  getDrops(): IItem[] {
    return [new RopeLadderBlockItem()]
  }
}
