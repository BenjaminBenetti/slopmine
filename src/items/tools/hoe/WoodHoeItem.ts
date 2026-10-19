import { HoeItem } from './HoeItem.ts'

/**
 * Wood hoe tool item.
 */
export class WoodHoeItem extends HoeItem {
  readonly id = 'wood_hoe'
  readonly name = 'wood_hoe'
  protected readonly baseDamage = 0.5
  protected readonly tier = 1

  override get displayName(): string {
    return 'Wood Hoe'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-hoe-icon.webp', import.meta.url).href
  }
}
