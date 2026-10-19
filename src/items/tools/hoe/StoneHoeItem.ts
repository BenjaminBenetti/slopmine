import { HoeItem } from './HoeItem.ts'

/**
 * Stone hoe tool item.
 */
export class StoneHoeItem extends HoeItem {
  readonly id = 'stone_hoe'
  readonly name = 'stone_hoe'
  protected readonly baseDamage = 0.75
  protected readonly tier = 2

  override get displayName(): string {
    return 'Stone Hoe'
  }

  override get iconUrl(): string {
    return new URL('./assets/stone-hoe-icon.webp', import.meta.url).href
  }
}
