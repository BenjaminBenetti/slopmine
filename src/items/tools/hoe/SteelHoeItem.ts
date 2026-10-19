import { HoeItem } from './HoeItem.ts'

/**
 * Steel hoe tool item.
 */
export class SteelHoeItem extends HoeItem {
  readonly id = 'steel_hoe'
  readonly name = 'steel_hoe'
  protected readonly baseDamage = 1.5
  protected readonly tier = 4

  override get displayName(): string {
    return 'Steel Hoe'
  }

  override get iconUrl(): string {
    return new URL('./assets/steel-hoe-icon.webp', import.meta.url).href
  }
}
