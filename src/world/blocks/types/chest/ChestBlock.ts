import * as THREE from 'three'
import type { IBlockProperties, IWorld, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { ChestBlockItem } from '../../../../items/blocks/chest/ChestBlockItem.ts'
import { ChestBlockState } from './ChestBlockState.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { deleteBlockStateFromPersistence } from '../../../../persistence/index.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

import chestFrontTexUrl from './assets/chest-front.webp'
import chestSideTexUrl from './assets/chest-side.webp'
import chestTopTexUrl from './assets/chest-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.CHEST_FRONT, chestFrontTexUrl)
registerTextureUrl(TextureId.CHEST_SIDE, chestSideTexUrl)
registerTextureUrl(TextureId.CHEST_TOP, chestTopTexUrl)

const chestFrontTexture = loadBlockTexture(chestFrontTexUrl)
const chestSideTexture = loadBlockTexture(chestSideTexUrl)
const chestTopTexture = loadBlockTexture(chestTopTexUrl)

const chestFrontMaterial = new THREE.MeshLambertMaterial({ map: chestFrontTexture })
const chestSideMaterial = new THREE.MeshLambertMaterial({ map: chestSideTexture })
const chestTopMaterial = new THREE.MeshLambertMaterial({ map: chestTopTexture })

/**
 * Chest block for item storage.
 *
 * Interactable: Press E to open chest UI.
 * Contains 27 storage slots (3 rows x 9 columns).
 */
export class ChestBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CHEST,
    name: 'chest',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.WOOD],
  }

  /** Mark this block as interactable */
  readonly isInteractable = true

  protected get defaultTextureId(): number {
    return TextureId.CHEST_FRONT
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      chestSideMaterial,  // +X (right) - side
      chestSideMaterial,  // -X (left) - side
      chestTopMaterial,   // +Y (top)
      chestTopMaterial,   // -Y (bottom)
      chestFrontMaterial, // +Z (front) - front with latch
      chestSideMaterial,  // -Z (back) - side
    ]
  }

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: // TOP
      case 1: // BOTTOM
        return TextureId.CHEST_TOP
      case 3: // SOUTH (+Z) - front with latch
        return TextureId.CHEST_FRONT
      default:
        return TextureId.CHEST_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new ChestBlockItem()]
  }

  /**
   * Return the chest's slot contents so they go back to the player on break.
   * These are the live state stacks - the mining code mutates their counts.
   */
  getStateDrops(x: bigint, y: bigint, z: bigint): ReadonlyArray<{ readonly item: IItem; count: number }> {
    const state = BlockStateManager.getInstance().getState<ChestBlockState>({ x, y, z })
    return state ? state.getAllItems() : []
  }

  /**
   * Remove empty (count <= 0) stacks from the chest's slots after a partial
   * content transfer.
   */
  compactStateSlots(x: bigint, y: bigint, z: bigint): void {
    const state = BlockStateManager.getInstance().getState<ChestBlockState>({ x, y, z })
    state?.compactSlots()
  }

  /**
   * Chest blocks use instanced rendering (not greedy meshing) to support rotation.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Create a block state instance for this chest.
   * Used by the persistence system for deserialization.
   */
  createState(position: IWorldCoordinate): IBlockState {
    return new ChestBlockState(position)
  }

  /**
   * Called when this block is placed.
   * Creates a ChestBlockState for this position.
   */
  onPlace(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    BlockStateManager.getInstance().setState(position, this.createState(position))
  }

  /**
   * Called when this block is loaded from persistence.
   * Creates a ChestBlockState for this position (same as onPlace).
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
   * Removes the ChestBlockState and drops contained items.
   */
  onBreak(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = BlockStateManager.getInstance().getState<ChestBlockState>(position)

    if (state) {
      // Contents are returned to the player via getStateDrops before this runs
      BlockStateManager.getInstance().removeState(position)
    }

    // Delete persisted block state (fire and forget)
    deleteBlockStateFromPersistence(x, y, z)
  }
}
