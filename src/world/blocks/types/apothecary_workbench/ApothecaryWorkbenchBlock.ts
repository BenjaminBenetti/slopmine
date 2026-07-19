import * as THREE from 'three'
import type { IBlockProperties, IWorld, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { ApothecaryWorkbenchBlockItem } from '../../../../items/blocks/apothecary_workbench/ApothecaryWorkbenchBlockItem.ts'
import { ApothecaryWorkbenchState } from './ApothecaryWorkbenchState.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { BlockTickManager } from '../../../blockstate/BlockTickManager.ts'
import { deleteBlockStateFromPersistence } from '../../../../persistence/index.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

import apothecaryFrontTexUrl from './assets/apothecary-front.webp'
import apothecarySideTexUrl from './assets/apothecary-side.webp'
import apothecaryTopTexUrl from './assets/apothecary-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.APOTHECARY_FRONT, apothecaryFrontTexUrl)
registerTextureUrl(TextureId.APOTHECARY_SIDE, apothecarySideTexUrl)
registerTextureUrl(TextureId.APOTHECARY_TOP, apothecaryTopTexUrl)

const apothecaryFrontTexture = loadBlockTexture(apothecaryFrontTexUrl)
const apothecarySideTexture = loadBlockTexture(apothecarySideTexUrl)
const apothecaryTopTexture = loadBlockTexture(apothecaryTopTexUrl)

const apothecaryFrontMaterial = new THREE.MeshLambertMaterial({ map: apothecaryFrontTexture })
const apothecarySideMaterial = new THREE.MeshLambertMaterial({ map: apothecarySideTexture })
const apothecaryTopMaterial = new THREE.MeshLambertMaterial({ map: apothecaryTopTexture })

// Reference to the block tick manager - set during initialization
let blockTickManager: BlockTickManager | null = null

/**
 * Set the block tick manager reference for apothecary workbench blocks.
 * Call this during game initialization.
 */
export function setApothecaryWorkbenchBlockTickManager(manager: BlockTickManager): void {
  blockTickManager = manager
}

/**
 * Apothecary Workbench block for brewing potions.
 *
 * Interactable: Press E to open brewing UI.
 * Contains 4 ingredient slots (2x2), 1 fuel slot, and 1 output slot.
 */
export class ApothecaryWorkbenchBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.APOTHECARY_WORKBENCH,
    name: 'apothecary_workbench',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  /** Mark this block as interactable */
  readonly isInteractable = true

  protected get defaultTextureId(): number {
    return TextureId.APOTHECARY_FRONT
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      apothecarySideMaterial,  // +X (right) - side
      apothecarySideMaterial,  // -X (left) - side
      apothecaryTopMaterial,   // +Y (top)
      apothecaryTopMaterial,   // -Y (bottom)
      apothecaryFrontMaterial, // +Z (front) - front with brewing equipment
      apothecarySideMaterial,  // -Z (back) - side
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
        return TextureId.APOTHECARY_TOP
      case 3: // SOUTH (+Z) - front with brewing equipment
        return TextureId.APOTHECARY_FRONT
      default:
        return TextureId.APOTHECARY_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new ApothecaryWorkbenchBlockItem()]
  }

  /**
   * Return the workbench's slot contents so they go back to the player on break.
   * These are the live state stacks - the mining code mutates their counts.
   */
  getStateDrops(x: bigint, y: bigint, z: bigint): ReadonlyArray<{ readonly item: IItem; count: number }> {
    const state = BlockStateManager.getInstance().getState<ApothecaryWorkbenchState>({ x, y, z })
    return state ? state.getAllItems() : []
  }

  /**
   * Remove empty (count <= 0) stacks from the workbench's slots after a
   * partial content transfer.
   */
  compactStateSlots(x: bigint, y: bigint, z: bigint): void {
    const state = BlockStateManager.getInstance().getState<ApothecaryWorkbenchState>({ x, y, z })
    state?.compactSlots()
  }

  /**
   * Apothecary workbench blocks use instanced rendering (not greedy meshing) to support rotation.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Create a block state instance for this apothecary workbench.
   * Used by the persistence system for deserialization.
   */
  createState(position: IWorldCoordinate): IBlockState {
    return new ApothecaryWorkbenchState(position)
  }

  /**
   * Called when this block is placed.
   * Creates an ApothecaryWorkbenchState for this position.
   */
  onPlace(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = this.createState(position) as ApothecaryWorkbenchState
    BlockStateManager.getInstance().setState(position, state)

    // Register with tick manager if available
    if (blockTickManager) {
      blockTickManager.register(state)
    }
  }

  /**
   * Called when this block is loaded from persistence.
   * Creates an ApothecaryWorkbenchState for this position (same as onPlace).
   */
  onLoad(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }

    // Skip if state already exists (shouldn't happen, but defensive)
    if (BlockStateManager.getInstance().hasState(position)) {
      return
    }

    const state = this.createState(position) as ApothecaryWorkbenchState
    BlockStateManager.getInstance().setState(position, state)

    // Register with tick manager if available
    if (blockTickManager) {
      blockTickManager.register(state)
    }
  }

  /**
   * Called when this block is broken.
   * Removes the ApothecaryWorkbenchState and drops contained items.
   */
  onBreak(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = BlockStateManager.getInstance().getState<ApothecaryWorkbenchState>(position)

    if (state) {
      // Unregister from tick manager
      if (blockTickManager) {
        blockTickManager.unregister(state)
      }

      // Contents are returned to the player via getStateDrops before this runs
      BlockStateManager.getInstance().removeState(position)
    }

    // Delete persisted block state (fire and forget)
    deleteBlockStateFromPersistence(x, y, z)
  }
}
