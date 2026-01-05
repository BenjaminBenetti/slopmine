import { AxeItem } from './AxeItem.ts'

/**
 * Steel axe tool item.
 */
export class SteelAxeItem extends AxeItem {
  readonly id = 'steel_axe'
  readonly name = 'steel_axe'
  protected readonly baseDamage = 3
  protected readonly tier = 3

  override get displayName(): string {
    return 'Steel Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/steel-axe-icon.webp', import.meta.url).href
  }
}
