import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Stone pickaxe tool item.
 */
export class StonePickaxeItem extends PickaxeItem {
  readonly id = 'stone_pickaxe'
  readonly name = 'stone_pickaxe'
  protected readonly baseDamage = 1.5
  protected readonly tier = 2

  override get displayName(): string {
    return 'Stone Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/stone-pickaxe-icon.webp', import.meta.url).href
  }
}
