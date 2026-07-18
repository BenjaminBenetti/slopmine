import { BlockItem } from '../../BlockItem.ts'

/**
 * Resin torch block item - the upgraded torch (blocklight 15 vs 14).
 */
export class ResinTorchBlockItem extends BlockItem {
  readonly id = 'resin_torch_block'
  readonly name = 'resin_torch'
  readonly blockName = 'resin_torch'

  override get displayName(): string {
    return 'Resin Torch'
  }
}
