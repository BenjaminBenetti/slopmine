import { HoeItem } from './HoeItem.ts'

/**
 * Diamond hoe tool item.
 */
export class DiamondHoeItem extends HoeItem {
  readonly id = 'diamond_hoe'
  readonly name = 'diamond_hoe'
  protected readonly baseDamage = 2.0
  protected readonly tier = 5

  override get displayName(): string {
    return 'Diamond Hoe'
  }

  override get iconUrl(): string {
    return new URL('./assets/diamond-hoe-icon.webp', import.meta.url).href
  }
}
