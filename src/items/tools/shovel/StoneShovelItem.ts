import { ShovelItem } from './ShovelItem.ts'

/**
 * Stone shovel tool item.
 */
export class StoneShovelItem extends ShovelItem {
  readonly id = 'stone_shovel'
  readonly name = 'stone_shovel'
  protected readonly baseDamage = 1.5
  protected readonly tier = 2

  override get displayName(): string {
    return 'Stone Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/stone-shovel-icon.webp', import.meta.url).href
  }
}
