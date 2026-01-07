import { AxeItem } from './AxeItem.ts'

/**
 * Steel axe tool item.
 */
export class SteelAxeItem extends AxeItem {
  readonly id = 'steel_axe'
  readonly name = 'steel_axe'
  protected readonly baseDamage = 1.5
  protected readonly tier = 4
  protected readonly woodMultiplier = 8.0

  override get displayName(): string {
    return 'Steel Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/steel-axe-icon.webp', import.meta.url).href
  }
}
