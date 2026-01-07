import { AxeItem } from './AxeItem.ts'

/**
 * Stone axe tool item.
 */
export class StoneAxeItem extends AxeItem {
  readonly id = 'stone_axe'
  readonly name = 'stone_axe'
  protected readonly baseDamage = 0.75
  protected readonly tier = 2
  protected readonly woodMultiplier = 8.0

  override get displayName(): string {
    return 'Stone Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/stone-axe-icon.webp', import.meta.url).href
  }
}
