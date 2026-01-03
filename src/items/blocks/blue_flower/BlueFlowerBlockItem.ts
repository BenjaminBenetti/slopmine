import { Item } from '../../Item.ts'

/**
 * Blue flower block item for player inventory.
 */
export class BlueFlowerBlockItem extends Item {
  readonly id = 'blue_flower_block'
  readonly name = 'blue_flower_block'

  override get displayName(): string {
    return 'Blue Flower'
  }

  override get iconUrl(): string {
    return new URL('./assets/blue-flower-icon.webp', import.meta.url).href
  }
}
