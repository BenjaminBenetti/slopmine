import { Item } from '../../Item.ts'

/**
 * Yellow flower block item for player inventory.
 */
export class YellowFlowerBlockItem extends Item {
  readonly id = 'yellow_flower_block'
  readonly name = 'yellow_flower_block'

  override get displayName(): string {
    return 'Yellow Flower'
  }

  override get iconUrl(): string {
    return new URL('./assets/yellow-flower-icon.webp', import.meta.url).href
  }
}
