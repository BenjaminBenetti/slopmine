import { BlockItem } from '../../BlockItem.ts'

/**
 * Torch block item for placing torches.
 * Torches emit light level 14 and can be placed on any solid surface.
 */
export class TorchBlockItem extends BlockItem {
  readonly id = 'torch_block'
  readonly name = 'torch'
  readonly blockName = 'torch'

  override get displayName(): string {
    return 'Torch'
  }
}
