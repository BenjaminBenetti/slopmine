import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Steel pickaxe tool item.
 */
export class SteelPickaxeItem extends PickaxeItem {
  readonly id = 'steel_pickaxe'
  readonly name = 'steel_pickaxe'
  protected readonly baseDamage = 3
  protected readonly tier = 4

  override get displayName(): string {
    return 'Steel Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/steel-pickaxe-icon.webp', import.meta.url).href
  }
}
