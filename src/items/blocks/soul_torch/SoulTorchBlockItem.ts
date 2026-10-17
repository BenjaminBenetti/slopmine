import { BlockItem } from '../../BlockItem.ts'

/**
 * Soul torch block item - a bone torch with a pale-green flame.
 */
export class SoulTorchBlockItem extends BlockItem {
  readonly id = 'soul_torch_block'
  readonly name = 'soul_torch_block'
  readonly blockName = 'soul_torch'

  override get displayName(): string {
    return 'Soul Torch'
  }
}
