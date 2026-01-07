import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Stone pickaxe tool item.
 */
export class StonePickaxeItem extends PickaxeItem {
  readonly id = 'stone_pickaxe'
  readonly name = 'stone_pickaxe'
  protected readonly baseDamage = 0.8
  protected readonly tier = 2
  protected readonly stoneMultiplier = 8.0

  override get displayName(): string {
    return 'Stone Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/stone-pickaxe-icon.webp', import.meta.url).href
  }
}
