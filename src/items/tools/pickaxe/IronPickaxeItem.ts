import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Iron pickaxe tool item.
 */
export class IronPickaxeItem extends PickaxeItem {
  readonly id = 'iron_pickaxe'
  readonly name = 'iron_pickaxe'
  protected readonly baseDamage = 1.1
  protected readonly tier = 3
  protected readonly stoneMultiplier = 9.0

  override get displayName(): string {
    return 'Iron Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-pickaxe-icon.webp', import.meta.url).href
  }
}
