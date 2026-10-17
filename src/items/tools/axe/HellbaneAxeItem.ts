import { AxeItem } from './AxeItem.ts'

/**
 * Hellbane axe tool item (tier 7, the endgame set).
 */
export class HellbaneAxeItem extends AxeItem {
  readonly id = 'hellbane_axe'
  readonly name = 'hellbane_axe'
  protected readonly baseDamage = 3.8
  protected readonly tier = 7
  protected readonly woodMultiplier = 8.0

  override get displayName(): string {
    return 'Hellbane Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/hellbane-axe-icon.webp', import.meta.url).href
  }
}
