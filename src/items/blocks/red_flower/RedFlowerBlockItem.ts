import { Item } from '../../Item.ts'

/**
 * Red flower block item for player inventory.
 */
export class RedFlowerBlockItem extends Item {
  readonly id = 'red_flower_block'
  readonly name = 'red_flower_block'

  override get displayName(): string {
    return 'Red Flower'
  }

  override get iconUrl(): string {
    return new URL('./assets/red-flower-icon.webp', import.meta.url).href
  }
}
