import { ShovelItem } from './ShovelItem.ts'

/**
 * Wood shovel tool item.
 */
export class WoodShovelItem extends ShovelItem {
  readonly id = 'wood_shovel'
  readonly name = 'wood_shovel'
  protected readonly baseDamage = 0.5
  protected readonly tier = 1
  protected readonly dirtMultiplier = 8.0

  override get displayName(): string {
    return 'Wood Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-shovel-icon.webp', import.meta.url).href
  }
}
