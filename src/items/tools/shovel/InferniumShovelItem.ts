import { ShovelItem } from './ShovelItem.ts'

/**
 * Infernium shovel tool item (tier 6, forged at the Hellforge).
 */
export class InferniumShovelItem extends ShovelItem {
  readonly id = 'infernium_shovel'
  readonly name = 'infernium_shovel'
  protected readonly baseDamage = 2.8
  protected readonly tier = 6
  protected readonly soilMultiplier = 8.0

  override get displayName(): string {
    return 'Infernium Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/infernium-shovel-icon.webp', import.meta.url).href
  }
}
