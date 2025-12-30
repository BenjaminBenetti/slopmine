import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Iron pickaxe tool item.
 */
export class IronPickaxeItem extends PickaxeItem {
  readonly id = 'iron_pickaxe'
  readonly name = 'iron_pickaxe'

  override get displayName(): string {
    return 'Iron Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-pickaxe-icon.webp', import.meta.url).href
  }
}
