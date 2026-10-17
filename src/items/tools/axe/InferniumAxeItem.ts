import { AxeItem } from './AxeItem.ts'

/**
 * Infernium axe tool item (tier 6, forged at the Hellforge).
 */
export class InferniumAxeItem extends AxeItem {
  readonly id = 'infernium_axe'
  readonly name = 'infernium_axe'
  protected readonly baseDamage = 2.8
  protected readonly tier = 6
  protected readonly woodMultiplier = 8.0

  override get displayName(): string {
    return 'Infernium Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/infernium-axe-icon.webp', import.meta.url).href
  }
}
