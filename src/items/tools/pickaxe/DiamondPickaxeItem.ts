import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Diamond pickaxe tool item.
 */
export class DiamondPickaxeItem extends PickaxeItem {
  readonly id = 'diamond_pickaxe'
  readonly name = 'diamond_pickaxe'
  protected readonly baseDamage = 6.5
  protected readonly tier = 5
  protected readonly rockMultiplier = 12.0

  override get displayName(): string {
    return 'Diamond Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/diamond-pickaxe-icon.webp', import.meta.url).href
  }
}
