import { AxeItem } from './AxeItem.ts'

/**
 * Wood axe tool item.
 */
export class WoodAxeItem extends AxeItem {
  readonly id = 'wood_axe'
  readonly name = 'wood_axe'

  override get displayName(): string {
    return 'Wood Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-axe-icon.webp', import.meta.url).href
  }
}
