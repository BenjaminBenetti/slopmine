import { SwordItem } from './SwordItem.ts'

/**
 * Steel sword.
 */
export class SteelSwordItem extends SwordItem {
  readonly id = 'steel_sword'
  readonly name = 'steel_sword'
  protected readonly material = 'steel'

  override get displayName(): string {
    return 'Steel Sword'
  }

  override get iconUrl(): string {
    return new URL('./assets/steel-sword-icon.webp', import.meta.url).href
  }
}
