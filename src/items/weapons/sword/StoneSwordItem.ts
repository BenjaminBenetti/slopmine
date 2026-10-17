import { SwordItem } from './SwordItem.ts'

/**
 * Stone sword.
 */
export class StoneSwordItem extends SwordItem {
  readonly id = 'stone_sword'
  readonly name = 'stone_sword'
  protected readonly material = 'stone'

  override get displayName(): string {
    return 'Stone Sword'
  }

  override get iconUrl(): string {
    return new URL('./assets/stone-sword-icon.webp', import.meta.url).href
  }
}
