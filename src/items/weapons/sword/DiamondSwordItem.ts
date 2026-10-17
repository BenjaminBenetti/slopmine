import { SwordItem } from './SwordItem.ts'

/**
 * Diamond sword.
 */
export class DiamondSwordItem extends SwordItem {
  readonly id = 'diamond_sword'
  readonly name = 'diamond_sword'
  protected readonly material = 'diamond'

  override get displayName(): string {
    return 'Diamond Sword'
  }

  override get iconUrl(): string {
    return new URL('./assets/diamond-sword-icon.webp', import.meta.url).href
  }
}
