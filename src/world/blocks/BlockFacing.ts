import { BlockFace } from '../interfaces/IBlock.ts'

/**
 * 6-direction facing for directional blocks.
 * Values match the 3 low bits of block metadata (bits 0-2).
 */
export enum BlockFacing {
  UP = 0,     // +Y direction (default, no rotation)
  DOWN = 1,   // -Y direction
  NORTH = 2,  // -Z direction
  SOUTH = 3,  // +Z direction
  EAST = 4,   // +X direction
  WEST = 5,   // -X direction
}

/**
 * Convert a hit face to block facing direction for surface-attached blocks.
 *
 * For floor/ceiling: facing points away from the attachment surface.
 * For walls: facing points into the attachment surface.
 *
 * @param hitFace The face of the block that was clicked
 * @returns The facing direction for surface-attached blocks
 */
export function hitFaceToFacing(hitFace: BlockFace): BlockFacing {
  switch (hitFace) {
    case BlockFace.TOP:
      return BlockFacing.UP
    case BlockFace.BOTTOM:
      return BlockFacing.DOWN
    case BlockFace.NORTH:
      return BlockFacing.SOUTH
    case BlockFace.SOUTH:
      return BlockFacing.NORTH
    case BlockFace.EAST:
      return BlockFacing.WEST
    case BlockFace.WEST:
      return BlockFacing.EAST
  }
}

/**
 * Convert player yaw angle to horizontal block facing direction.
 * The block faces the player, so we use the direction the player is looking.
 * Only returns horizontal directions (NORTH/SOUTH/EAST/WEST).
 *
 * @param yaw Player's yaw in radians (0 = looking at -Z, positive = counter-clockwise)
 * @returns The horizontal facing direction the block should have to face the player
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
 * Facing is stored in bits 0-2 (3 bits = 8 values, using 6).
 */
export function getMetadataFacing(metadata: number): BlockFacing {
  return (metadata & 0b111) as BlockFacing
}

/**
 * Set the facing direction in block metadata.
 * Preserves other metadata bits (bits 3+).
 */
export function setMetadataFacing(metadata: number, facing: BlockFacing): number {
  return (metadata & ~0b111) | (facing & 0b111)
}

/**
 * Check if block uses 3D rotation (surface-attached blocks).
 * Stored in bit 3 of metadata.
 */
export function getMetadataUses3DRotation(metadata: number): boolean {
  return (metadata & 0b1000) !== 0
}

/**
 * Set the 3D rotation flag in metadata.
 * Surface-attached blocks (divining stick) set this to true.
 */
export function setMetadataUses3DRotation(metadata: number, uses3D: boolean): number {
  if (uses3D) {
    return metadata | 0b1000
  } else {
    return metadata & ~0b1000
  }
}

/**
 * Check if the block is placed vertically flipped (upside down).
 * Stored in bit 4 of metadata. Set at placement time when the player clicks
 * the underside of a block or the upper half of a side face (Minecraft-style
 * placement for stairs, slabs, and trapdoors).
 */
export function getMetadataFlipped(metadata: number): boolean {
  return (metadata & 0b10000) !== 0
}

/**
 * Set the vertical-flip flag in metadata.
 * Preserves other metadata bits.
 */
export function setMetadataFlipped(metadata: number, flipped: boolean): number {
  if (flipped) {
    return metadata | 0b10000
  } else {
    return metadata & ~0b10000
  }
}

/**
 * Get Euler rotation angles for a facing direction.
 * Uses metadata bit 3 to determine rotation mode:
 * - If uses3D is true: Full 3D rotation for surface-attached blocks
 * - If uses3D is false: Y-axis rotation only for horizontal blocks
 *
 * @param facing The facing direction
 * @param uses3D Whether to use full 3D rotation (from metadata bit 3)
 * @param flipped Vertical flip (from metadata bit 4) - a local roll applied
 *   before the yaw, turning bottom-anchored geometry (slab, stair, closed
 *   trapdoor) into its ceiling-mounted variant. Only meaningful for the
 *   Y-rotation path; geometry must be symmetric across its local YZ plane.
 * @returns Euler angles {x, y, z} in radians (THREE 'XYZ' order)
 */
export function facingToEuler(facing: BlockFacing, uses3D: boolean = false, flipped: boolean = false): { x: number; y: number; z: number } {
  const roll = flipped ? Math.PI : 0
  // UP (0) is default - no rotation needed for any block type
  if (facing === BlockFacing.UP) {
    return { x: 0, y: 0, z: 0 }
  }
  // DOWN flips 180° around X
  if (facing === BlockFacing.DOWN) {
    return { x: Math.PI, y: 0, z: 0 }
  }

  // For horizontal facings, check if block uses 3D rotation
  if (uses3D) {
    // Surface-attached blocks: tilt to point horizontally
    switch (facing) {
      case BlockFacing.NORTH:
        // Tilt forward 90° to point -Z
        return { x: Math.PI / 2, y: 0, z: 0 }
      case BlockFacing.SOUTH:
        // Tilt backward 90° to point +Z
        return { x: -Math.PI / 2, y: 0, z: 0 }
      case BlockFacing.EAST:
        // Tilt right 90° to point +X
        return { x: 0, y: 0, z: -Math.PI / 2 }
      case BlockFacing.WEST:
        // Tilt left 90° to point -X
        return { x: 0, y: 0, z: Math.PI / 2 }
    }
  }

  // Horizontal blocks: Y-rotation plus optional vertical flip (local roll,
  // applied before the yaw in THREE's 'XYZ' euler order)
  switch (facing) {
    case BlockFacing.SOUTH:
      return { x: 0, y: 0, z: roll }
    case BlockFacing.WEST:
      return { x: 0, y: -Math.PI / 2, z: roll }
    case BlockFacing.NORTH:
      return { x: 0, y: Math.PI, z: roll }
    case BlockFacing.EAST:
      return { x: 0, y: Math.PI / 2, z: roll }
  }
}

/**
 * Get the Y rotation angle in radians for a horizontal facing direction.
 * Used for blocks that only rotate around the Y axis (forge, ladder, etc.).
 *
 * Note: THREE.js BoxGeometry has the "front" face at +Z (SOUTH),
 * so rotations are relative to that default orientation.
 *
 * @param facing The facing direction (should be NORTH/SOUTH/EAST/WEST)
 * @returns Y rotation in radians
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
    // For UP/DOWN, return 0 (no Y rotation) - these blocks use full 3D rotation
    case BlockFacing.UP:
    case BlockFacing.DOWN:
      return 0
  }
}

/**
 * Convert a facing direction to a unit direction vector.
 * Used for raycasting in the direction a block is facing.
 *
 * @param facing The facing direction
 * @returns Direction vector components {dx, dy, dz}
 */
export function facingToDirection(facing: BlockFacing): { dx: number; dy: number; dz: number } {
  switch (facing) {
    case BlockFacing.UP:
      return { dx: 0, dy: 1, dz: 0 }
    case BlockFacing.DOWN:
      return { dx: 0, dy: -1, dz: 0 }
    case BlockFacing.NORTH:
      return { dx: 0, dy: 0, dz: -1 }
    case BlockFacing.SOUTH:
      return { dx: 0, dy: 0, dz: 1 }
    case BlockFacing.EAST:
      return { dx: 1, dy: 0, dz: 0 }
    case BlockFacing.WEST:
      return { dx: -1, dy: 0, dz: 0 }
  }
}
