import type * as THREE from 'three'

/**
 * Block ID type - uint16 supports 0-65535 block types.
 * 0 is reserved for AIR.
 */
export type BlockId = number

export const AIR_BLOCK_ID: BlockId = 0

/**
 * Block face directions for neighbor lookups and face culling.
 */
export enum BlockFace {
  TOP = 0,
  BOTTOM = 1,
  NORTH = 2,
  SOUTH = 3,
  EAST = 4,
  WEST = 5,
}

/**
 * Block properties that define behavior.
 */
export interface IBlockProperties {
  readonly id: BlockId
  readonly name: string
  readonly isOpaque: boolean
  readonly isSolid: boolean
  readonly isLiquid: boolean
  readonly hardness: number
  readonly lightLevel: number
  readonly lightBlocking: number
}

/**
 * Core block interface - all blocks must implement this.
 */
export interface IBlock {
  readonly properties: IBlockProperties

  /**
   * Get texture coordinates/ID for a specific face.
   */
  getTextureForFace(face: BlockFace): number

  /**
   * Whether this block's face should be rendered against a neighbor.
   * Used for face culling optimization.
   */
  shouldRenderFace(face: BlockFace, neighbor: IBlock): boolean

  /**
   * Get the bounding box for collision (null for non-solid).
   */
  getCollisionBox(): THREE.Box3 | null

  /**
   * Called when this block is placed.
   */
  onPlace?(world: IWorld, x: bigint, y: bigint, z: bigint): void

  /**
   * Called when this block is broken.
   */
  onBreak?(world: IWorld, x: bigint, y: bigint, z: bigint): void

  /**
   * Called when a neighbor block changes.
   */
  onNeighborChange?(world: IWorld, x: bigint, y: bigint, z: bigint, face: BlockFace): void

  /**
   * Create a Three.js mesh for this block.
   * Returns null for blocks that shouldn't be rendered (like air).
   */
  createMesh(): THREE.Mesh | null
}

/**
 * World interface for block lifecycle callbacks.
 */
export interface IWorld {
  getBlock(x: bigint, y: bigint, z: bigint): IBlock
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId): boolean
}
