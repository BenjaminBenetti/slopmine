import * as THREE from 'three'
import type { IBlockProperties, IWorld, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { ForgeBlockItem } from '../../../../items/blocks/forge/ForgeBlockItem.ts'
import { ForgeBlockState } from './ForgeBlockState.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { BlockTickManager } from '../../../blockstate/BlockTickManager.ts'
import { deleteBlockStateFromPersistence } from '../../../../persistence/index.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

import forgeFrontTexUrl from './assets/forge-front.webp'
import forgeSideTexUrl from './assets/forge-side.webp'
import forgeTopTexUrl from './assets/forge-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.FORGE_FRONT, forgeFrontTexUrl)
registerTextureUrl(TextureId.FORGE_SIDE, forgeSideTexUrl)
registerTextureUrl(TextureId.FORGE_TOP, forgeTopTexUrl)

const forgeFrontTexture = loadBlockTexture(forgeFrontTexUrl)
const forgeSideTexture = loadBlockTexture(forgeSideTexUrl)
const forgeTopTexture = loadBlockTexture(forgeTopTexUrl)

const forgeFrontMaterial = new THREE.MeshLambertMaterial({ map: forgeFrontTexture })
const forgeSideMaterial = new THREE.MeshLambertMaterial({ map: forgeSideTexture })
const forgeTopMaterial = new THREE.MeshLambertMaterial({ map: forgeTopTexture })

// Reference to the block tick manager - set during initialization
let blockTickManager: BlockTickManager | null = null

/**
 * Set the block tick manager reference for forge blocks.
 * Call this during game initialization.
 */
export function setForgeBlockTickManager(manager: BlockTickManager): void {
  blockTickManager = manager
}

/**
 * Forge block for smelting ores into bars.
 *
 * Interactable: Press E to open forge UI.
 * Contains 3 ore input slots, 1 fuel slot, and 3 output slots.
 */
export class ForgeBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FORGE,
    name: 'forge',
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
    return TextureId.FORGE_FRONT
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      forgeSideMaterial,  // +X (right) - side
      forgeSideMaterial,  // -X (left) - side
      forgeTopMaterial,   // +Y (top)
      forgeTopMaterial,   // -Y (bottom)
      forgeFrontMaterial, // +Z (front) - front with fire opening
      forgeSideMaterial,  // -Z (back) - side
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
        return TextureId.FORGE_TOP
      case 3: // SOUTH (+Z) - front with fire opening
        return TextureId.FORGE_FRONT
      default:
        return TextureId.FORGE_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new ForgeBlockItem()]
  }

  /**
   * Forge blocks use instanced rendering (not greedy meshing) to support rotation.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Called when this block is placed.
   * Creates a ForgeBlockState for this position.
   */
  onPlace(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = new ForgeBlockState(position)
    BlockStateManager.getInstance().setState(position, state)

    // Register with tick manager if available
    if (blockTickManager) {
      blockTickManager.register(state)
    }
  }

  /**
   * Called when this block is loaded from persistence.
   * Creates a ForgeBlockState for this position (same as onPlace).
   */
  onLoad(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }

    // Skip if state already exists (shouldn't happen, but defensive)
    if (BlockStateManager.getInstance().hasState(position)) {
      return
    }

    const state = new ForgeBlockState(position)
    BlockStateManager.getInstance().setState(position, state)

    // Register with tick manager if available
    if (blockTickManager) {
      blockTickManager.register(state)
    }
  }

  /**
   * Called when this block is broken.
   * Removes the ForgeBlockState and drops contained items.
   */
  onBreak(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = BlockStateManager.getInstance().getState<ForgeBlockState>(position)

    if (state) {
      // Unregister from tick manager
      if (blockTickManager) {
        blockTickManager.unregister(state)
      }

      // TODO: Drop contained items
      // const items = state.getAllItems()
      // items.forEach(stack => dropItemAtPosition(world, x, y, z, stack))

      BlockStateManager.getInstance().removeState(position)
    }

    // Delete persisted block state (fire and forget)
    deleteBlockStateFromPersistence(x, y, z)
  }
}
