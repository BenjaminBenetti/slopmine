import { HoeItem } from './HoeItem.ts'

/**
 * Hellbane hoe tool item (forged at the Hellforge).
 */
export class HellbaneHoeItem extends HoeItem {
  readonly id = 'hellbane_hoe'
  readonly name = 'hellbane_hoe'
  protected readonly baseDamage = 3.4
  protected readonly tier = 7

  override get displayName(): string {
    return 'Hellbane Hoe'
  }

  override get iconUrl(): string {
    return new URL('./assets/hellbane-hoe-icon.webp', import.meta.url).href
  }
}
