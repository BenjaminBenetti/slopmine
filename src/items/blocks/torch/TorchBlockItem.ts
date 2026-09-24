import { BlockItem } from '../../BlockItem.ts'

/**
 * Torch block item for placing torches.
 * Torches emit light level 13; the resin torch (15) is the brighter,
 * longer-reaching upgrade.
 */
export class TorchBlockItem extends BlockItem {
  readonly id = 'torch_block'
  readonly name = 'torch'
  readonly blockName = 'torch'

  override get displayName(): string {
    return 'Torch'
  }
}
