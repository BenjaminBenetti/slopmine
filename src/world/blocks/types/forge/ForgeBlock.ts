import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { ForgeBlockItem } from '../../../../items/blocks/forge/ForgeBlockItem.ts'
import { ForgeBlockState } from './ForgeBlockState.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { BlockTickManager } from '../../../blockstate/BlockTickManager.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'

import forgeTexUrl from './assets/forge.webp'

const forgeTexture = loadBlockTexture(forgeTexUrl)
const forgeMaterial = new THREE.MeshLambertMaterial({ map: forgeTexture })

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
    tags: [BlockTags.STONE],
  }

  /** Mark this block as interactable */
  readonly isInteractable = true

  protected getMaterials(): THREE.Material {
    return forgeMaterial
  }

  getDrops(): IItem[] {
    return [new ForgeBlockItem()]
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
  }
}
