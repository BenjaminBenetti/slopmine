import { SwordItem } from './SwordItem.ts'

/**
 * Infernium sword.
 */
export class InferniumSwordItem extends SwordItem {
  readonly id = 'infernium_sword'
  readonly name = 'infernium_sword'
  protected readonly material = 'infernium'

  override get displayName(): string {
    return 'Infernium Sword'
  }

  override get iconUrl(): string {
    return new URL('./assets/infernium-sword-icon.webp', import.meta.url).href
  }
}
