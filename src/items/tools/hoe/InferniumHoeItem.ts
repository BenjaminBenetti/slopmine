import { HoeItem } from './HoeItem.ts'

/**
 * Infernium hoe tool item (forged at the Hellforge).
 */
export class InferniumHoeItem extends HoeItem {
  readonly id = 'infernium_hoe'
  readonly name = 'infernium_hoe'
  protected readonly baseDamage = 2.6
  protected readonly tier = 6

  override get displayName(): string {
    return 'Infernium Hoe'
  }

  override get iconUrl(): string {
    return new URL('./assets/infernium-hoe-icon.webp', import.meta.url).href
  }
}
