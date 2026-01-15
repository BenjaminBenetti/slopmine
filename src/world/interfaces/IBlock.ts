import type * as THREE from 'three'
import type { IItem } from '../../items/Item.ts'
import type { BlockFacing } from '../blocks/BlockFacing.ts'
import type { IBlockEntity } from '../../entities/interfaces/IBlockEntity.ts'
import type { IWorldCoordinate } from './ICoordinates.ts'

/**
 * Block ID type - uint16 supports 0-65535 block types.
 * 0 is reserved for AIR.
 */
export type BlockId = number

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
  /** Minimum demolition force required to mine this block (0 = hand-minable) */
  readonly demolitionForceRequired: number
  /** Tags for tool effectiveness matching (e.g., 'stone', 'wood', 'dirt') */
  readonly tags: ReadonlyArray<string>
  /** For liquid blocks: the fill level (1-8, where 8 is full source) */
  readonly liquidLevel?: number
  /** For liquid blocks: the liquid family (e.g., 'water', 'lava') */
  readonly liquidFamily?: string
}

/**
 * Core block interface - all blocks must implement this.
 */
export interface IBlock {
  readonly properties: IBlockProperties

  /**
   * Get texture ID for a specific face (used for greedy mesh grouping).
   * Faces with the same texture ID can be merged together.
   */
  getTextureForFace(face: BlockFace): number

  /**
   * Whether this block's face should be rendered against a neighbor.
   * Used for face culling optimization.
   */
  shouldRenderFace(face: BlockFace, neighbor: IBlock): boolean

  /**
   * Whether this block can be greedy-meshed (merged with adjacent same-type faces).
   * Returns false for blocks with custom geometry (torch, cross-shaped plants, etc.)
   */
  isGreedyMeshable(): boolean

  /**
   * Get the bounding box for collision (null for non-solid).
   */
  getCollisionBox(): THREE.Box3 | null

  /**
   * Called when this block is placed.
   * @param facing The direction the block should face (for directional blocks)
   */
  onPlace?(world: IWorld, x: bigint, y: bigint, z: bigint, facing?: BlockFacing): void

  /**
   * Called when this block is broken.
   */
  onBreak?(world: IWorld, x: bigint, y: bigint, z: bigint): void

  /**
   * Called when this block is loaded from persistence.
   * Used to restore runtime state (e.g., ForgeBlockState) that isn't persisted in block data.
   */
  onLoad?(world: IWorld, x: bigint, y: bigint, z: bigint): void

  /**
   * Called when a neighbor block changes.
   */
  onNeighborChange?(world: IWorld, x: bigint, y: bigint, z: bigint, face: BlockFace): void

  /**
   * Get items dropped when this block is broken.
   * Block handles any random drop logic internally.
   */
  getDrops?(): IItem[]

  /**
   * Create a block entity for this block when placed or loaded.
   * Block entities receive per-frame updates and despawn when their chunk unloads.
   * Returns null for blocks that don't need entity behavior.
   * @param position The world position of the block
   * @param world The world interface for block operations (e.g., replacing self with another block)
   */
  createBlockEntity?(position: IWorldCoordinate, world: IWorld): IBlockEntity | null

  /**
   * Create a Three.js mesh for this block.
   * Returns null for blocks that shouldn't be rendered (like air).
   */
  createMesh(): THREE.Mesh | null

  /**
   * Get the material(s) for instanced rendering.
   * Returns shared material(s) that can be reused across all instances.
   */
  getInstanceMaterial(): THREE.Material | THREE.Material[]

  /**
   * Get the geometry for this block type.
   * Returns shared geometry that can be reused across all instances.
   */
  getInstanceGeometry(): THREE.BufferGeometry
}

/**
 * World interface for block lifecycle callbacks.
 */
export interface IWorld {
  getBlock(x: bigint, y: bigint, z: bigint): IBlock
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId): boolean
}
