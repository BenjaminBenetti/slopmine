import { AxeItem } from './AxeItem.ts'

/**
 * Iron axe tool item.
 */
export class IronAxeItem extends AxeItem {
  readonly id = 'iron_axe'
  readonly name = 'iron_axe'
  protected readonly baseDamage = 2
  protected readonly tier = 2

  override get displayName(): string {
    return 'Iron Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-axe-icon.webp', import.meta.url).href
  }
}
