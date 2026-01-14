/**
 * Horizontal facing directions for directional blocks.
 * Values match the 2 low bits of block metadata.
 */
export enum BlockFacing {
  NORTH = 0, // -Z direction
  EAST = 1,  // +X direction
  SOUTH = 2, // +Z direction
  WEST = 3,  // -X direction
}

/**
 * Convert player yaw angle to block facing direction.
 * The block faces the player, so we use the direction the player is looking.
 *
 * @param yaw Player's yaw in radians (0 = looking at -Z, positive = counter-clockwise)
 * @returns The facing direction the block should have to face the player
 */
export function yawToFacing(yaw: number): BlockFacing {
  // Normalize yaw to 0-2π range
  let normalized = yaw % (2 * Math.PI)
  if (normalized < 0) normalized += 2 * Math.PI

  // Convert to degrees for easier reasoning (0-360)
  const degrees = (normalized * 180) / Math.PI

  // Determine facing based on which 90-degree sector the player is looking at
  // Player looking at -Z (north) = 0°, block should face SOUTH to face the player
  // Player looking at +X (east) = 270° (or -90°), block should face WEST
  // Player looking at +Z (south) = 180°, block should face NORTH
  // Player looking at -X (west) = 90°, block should face EAST
  if (degrees >= 315 || degrees < 45) {
    return BlockFacing.SOUTH // Player looking north, block faces south
  } else if (degrees >= 45 && degrees < 135) {
    return BlockFacing.EAST // Player looking west, block faces east
  } else if (degrees >= 135 && degrees < 225) {
    return BlockFacing.NORTH // Player looking south, block faces north
  } else {
    return BlockFacing.WEST // Player looking east, block faces west
  }
}

/**
 * Get the facing direction from block metadata.
 * Facing is stored in bits 0-1.
 */
export function getMetadataFacing(metadata: number): BlockFacing {
  return (metadata & 0b11) as BlockFacing
}

/**
 * Set the facing direction in block metadata.
 * Preserves other metadata bits.
 */
export function setMetadataFacing(metadata: number, facing: BlockFacing): number {
  return (metadata & ~0b11) | (facing & 0b11)
}

/**
 * Get the Y rotation angle in radians for a facing direction.
 * Used for rotating block geometry/instances.
 *
 * Note: THREE.js BoxGeometry has the "front" face at +Z (SOUTH),
 * so rotations are relative to that default orientation.
 */
export function facingToRotationY(facing: BlockFacing): number {
  switch (facing) {
    case BlockFacing.SOUTH:
      return 0 // Default orientation, front at +Z
    case BlockFacing.WEST:
      return -Math.PI / 2 // 90° clockwise, front at -X
    case BlockFacing.NORTH:
      return Math.PI // 180°, front at -Z
    case BlockFacing.EAST:
      return Math.PI / 2 // 90° counter-clockwise, front at +X
  }
}
