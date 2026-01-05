import { ShovelItem } from './ShovelItem.ts'

/**
 * Iron shovel tool item.
 */
export class IronShovelItem extends ShovelItem {
  readonly id = 'iron_shovel'
  readonly name = 'iron_shovel'
  protected readonly baseDamage = 2
  protected readonly tier = 2

  override get displayName(): string {
    return 'Iron Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-shovel-icon.webp', import.meta.url).href
  }
}
