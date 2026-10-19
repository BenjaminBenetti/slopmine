import { HoeItem } from './HoeItem.ts'

/**
 * Iron hoe tool item.
 */
export class IronHoeItem extends HoeItem {
  readonly id = 'iron_hoe'
  readonly name = 'iron_hoe'
  protected readonly baseDamage = 1.25
  protected readonly tier = 3

  override get displayName(): string {
    return 'Iron Hoe'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-hoe-icon.webp', import.meta.url).href
  }
}
