import { ShovelItem } from './ShovelItem.ts'

/**
 * Diamond shovel tool item.
 */
export class DiamondShovelItem extends ShovelItem {
  readonly id = 'diamond_shovel'
  readonly name = 'diamond_shovel'
  protected readonly baseDamage = 2.0
  protected readonly tier = 5
  protected readonly dirtMultiplier = 8.0

  override get displayName(): string {
    return 'Diamond Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/diamond-shovel-icon.webp', import.meta.url).href
  }
}
