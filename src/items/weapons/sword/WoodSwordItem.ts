import { SwordItem } from './SwordItem.ts'

/**
 * Wood sword.
 */
export class WoodSwordItem extends SwordItem {
  readonly id = 'wood_sword'
  readonly name = 'wood_sword'
  protected readonly material = 'wood'

  override get displayName(): string {
    return 'Wood Sword'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-sword-icon.webp', import.meta.url).href
  }
}
