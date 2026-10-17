import { SwordItem } from './SwordItem.ts'

/**
 * Hellbane sword.
 */
export class HellbaneSwordItem extends SwordItem {
  readonly id = 'hellbane_sword'
  readonly name = 'hellbane_sword'
  protected readonly material = 'hellbane'

  override get displayName(): string {
    return 'Hellbane Sword'
  }

  override get iconUrl(): string {
    return new URL('./assets/hellbane-sword-icon.webp', import.meta.url).href
  }
}
