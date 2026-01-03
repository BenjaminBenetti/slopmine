import { Item } from '../../Item.ts'

/**
 * Pink flower block item for player inventory.
 */
export class PinkFlowerBlockItem extends Item {
  readonly id = 'pink_flower_block'
  readonly name = 'pink_flower_block'

  override get displayName(): string {
    return 'Pink Flower'
  }

  override get iconUrl(): string {
    return new URL('./assets/pink-flower-icon.webp', import.meta.url).href
  }
}
