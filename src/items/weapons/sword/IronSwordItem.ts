import { SwordItem } from './SwordItem.ts'

/**
 * Iron sword.
 */
export class IronSwordItem extends SwordItem {
  readonly id = 'iron_sword'
  readonly name = 'iron_sword'
  protected readonly material = 'iron'

  override get displayName(): string {
    return 'Iron Sword'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-sword-icon.webp', import.meta.url).href
  }
}
