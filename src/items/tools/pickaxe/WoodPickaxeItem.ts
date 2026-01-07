import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Wood pickaxe tool item.
 */
export class WoodPickaxeItem extends PickaxeItem {
  readonly id = 'wood_pickaxe'
  readonly name = 'wood_pickaxe'
  protected readonly baseDamage = 0.56
  protected readonly tier = 1
  protected readonly stoneMultiplier = 7.1

  override get displayName(): string {
    return 'Wood Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-pickaxe-icon.webp', import.meta.url).href
  }
}
