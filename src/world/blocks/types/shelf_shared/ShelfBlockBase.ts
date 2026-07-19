import * as THREE from 'three'
import type { IWorld } from '../../../interfaces/IBlock.ts'
import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockFacing, facingToDirection, getMetadataFacing } from '../../BlockFacing.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { deleteBlockStateFromPersistence } from '../../../../persistence/index.ts'
import { ShelfBlockState } from './ShelfBlockState.ts'
import { ShelfBlockEntity } from './ShelfBlockEntity.ts'
import { shelfGeometry } from './ShelfGeometry.ts'

/**
 * Shared implementation for wall-mounted shelf blocks (all wood variants).
 *
 * Shelves are non-solid decorative storage: a board + brackets hugging the
 * wall behind them (-Z in local space, rotated by yaw facing). They hold
 * 3 display slots (ShelfBlockState) whose contents are rendered in-world
 * by a ShelfBlockEntity.
 *
 * Interactable: Press E to open the 3-slot shelf UI.
 *
 * Subclasses provide: properties, defaultTextureId, getMaterials (the wood's
 * shared planks material), and createShelfItem (the drop item).
 */
export abstract class ShelfBlockBase extends TransparentBlock {
  /** Mark this block as interactable */
  readonly isInteractable = true

  /**
   * The item this shelf drops when broken (the wood-specific shelf item).
   */
  protected abstract createShelfItem(): IItem

  protected getGeometry(): THREE.BufferGeometry {
    return shelfGeometry
  }

  /**
   * Shelves use custom board+bracket geometry with rotation, not greedy meshing.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Returns the upper part of the cell from the wall side (the -Z local
   * edge), positioned by the facing direction stored in metadata.
   */
  getInteractionBox(metadata: number): THREE.Box3 {
    const facing = getMetadataFacing(metadata)
    // Covers the brackets up to the board; maxY is flush with the cell top
    // so right-clicking the top face places a block in the cell above -
    // sitting on the shelf
    const minY = 0.5
    const maxY = 1.0
    const depth = 0.9

    switch (facing) {
      case BlockFacing.SOUTH:
        // Default (0 deg): board hugs -Z -> north edge (z about 0)
        return new THREE.Box3(
          new THREE.Vector3(0, minY, 0),
          new THREE.Vector3(1, maxY, depth)
        )
      case BlockFacing.NORTH:
        // Rotated 180 deg: board at south edge (z about 1)
        return new THREE.Box3(
          new THREE.Vector3(0, minY, 1 - depth),
          new THREE.Vector3(1, maxY, 1)
        )
      case BlockFacing.EAST:
        // Rotated +90 deg CCW: board at west edge (x about 0)
        return new THREE.Box3(
          new THREE.Vector3(0, minY, 0),
          new THREE.Vector3(depth, maxY, 1)
        )
      case BlockFacing.WEST:
        // Rotated -90 deg CW: board at east edge (x about 1)
        return new THREE.Box3(
          new THREE.Vector3(1 - depth, minY, 0),
          new THREE.Vector3(1, maxY, 1)
        )
      // UP/DOWN should never occur for shelves - default to SOUTH behavior
      default:
        return new THREE.Box3(
          new THREE.Vector3(0, minY, 0),
          new THREE.Vector3(1, maxY, depth)
        )
    }
  }

  /**
   * Shelves must be mounted on a wall: the cell behind the shelf's back
   * (opposite of facing - the -Z local edge the board hugs) must be solid.
   */
  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint, facing?: BlockFacing): boolean {
    let horizontal = facing ?? BlockFacing.SOUTH
    if (horizontal === BlockFacing.UP || horizontal === BlockFacing.DOWN) {
      horizontal = BlockFacing.SOUTH
    }

    // The wall is behind the shelf: opposite of the facing (front) direction
    const front = facingToDirection(horizontal)
    const wallX = x - BigInt(front.dx)
    const wallZ = z - BigInt(front.dz)

    return world.getBlock(wallX, y, wallZ).properties.isSolid
  }

  getDrops(): IItem[] {
    return [this.createShelfItem()]
  }

  /**
   * Return the shelf's slot contents so they go back to the player on break.
   * These are the live state stacks - the mining code mutates their counts.
   */
  getStateDrops(x: bigint, y: bigint, z: bigint): ReadonlyArray<{ readonly item: IItem; count: number }> {
    const state = BlockStateManager.getInstance().getState<ShelfBlockState>({ x, y, z })
    return state ? state.getAllItems() : []
  }

  /**
   * Remove empty (count <= 0) stacks from the shelf's slots after a partial
   * content transfer.
   */
  compactStateSlots(x: bigint, y: bigint, z: bigint): void {
    const state = BlockStateManager.getInstance().getState<ShelfBlockState>({ x, y, z })
    state?.compactSlots()
  }

  /**
   * Create a block state instance for this shelf.
   * Used by the persistence system for deserialization.
   */
  createState(position: IWorldCoordinate): IBlockState {
    return new ShelfBlockState(position)
  }

  /**
   * Create the block entity that renders slot contents in-world.
   */
  createBlockEntity(position: IWorldCoordinate, world: IWorld): IBlockEntity {
    return new ShelfBlockEntity(position, world)
  }

  /**
   * Called when this block is placed.
   * Creates a ShelfBlockState for this position.
   */
  onPlace(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    BlockStateManager.getInstance().setState(position, this.createState(position))
  }

  /**
   * Called when this block is loaded from persistence.
   * Creates a ShelfBlockState for this position (same as onPlace).
   */
  onLoad(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }

    // Skip if state already exists (shouldn't happen, but defensive)
    if (BlockStateManager.getInstance().hasState(position)) {
      return
    }

    BlockStateManager.getInstance().setState(position, this.createState(position))
  }

  /**
   * Called when this block is broken.
   * Removes the ShelfBlockState and cleans up persistence.
   */
  onBreak(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = BlockStateManager.getInstance().getState<ShelfBlockState>(position)

    if (state) {
      // Contents are returned to the player via getStateDrops before this runs
      BlockStateManager.getInstance().removeState(position)
    }

    // Delete persisted block state (fire and forget)
    deleteBlockStateFromPersistence(x, y, z)
  }
}
