import { Item } from '../../Item.ts'

/**
 * Torch block item for placing torches.
 * Torches emit light level 14 and can be placed on any solid surface.
 */
export class TorchBlockItem extends Item {
  readonly id = 'torch_block'
  readonly name = 'torch'

  override get displayName(): string {
    return 'Torch'
  }

  override get iconUrl(): string {
    return new URL('./assets/torch-icon.webp', import.meta.url).href
  }
}
