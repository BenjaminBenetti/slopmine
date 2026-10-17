import { ShovelItem } from './ShovelItem.ts'

/**
 * Hellbane shovel tool item (tier 7, the endgame set).
 */
export class HellbaneShovelItem extends ShovelItem {
  readonly id = 'hellbane_shovel'
  readonly name = 'hellbane_shovel'
  protected readonly baseDamage = 3.8
  protected readonly tier = 7
  protected readonly soilMultiplier = 8.0

  override get displayName(): string {
    return 'Hellbane Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/hellbane-shovel-icon.webp', import.meta.url).href
  }
}
