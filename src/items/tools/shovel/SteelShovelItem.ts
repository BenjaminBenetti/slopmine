import { ShovelItem } from './ShovelItem.ts'

/**
 * Steel shovel tool item.
 */
export class SteelShovelItem extends ShovelItem {
  readonly id = 'steel_shovel'
  readonly name = 'steel_shovel'
  protected readonly baseDamage = 3
  protected readonly tier = 3

  override get displayName(): string {
    return 'Steel Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/steel-shovel-icon.webp', import.meta.url).href
  }
}
