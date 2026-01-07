import { AxeItem } from './AxeItem.ts'

/**
 * Diamond axe tool item.
 */
export class DiamondAxeItem extends AxeItem {
  readonly id = 'diamond_axe'
  readonly name = 'diamond_axe'
  protected readonly baseDamage = 2.0
  protected readonly tier = 5
  protected readonly woodMultiplier = 8.0

  override get displayName(): string {
    return 'Diamond Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/diamond-axe-icon.webp', import.meta.url).href
  }
}
