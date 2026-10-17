import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Hellbane pickaxe tool item (tier 7, the endgame set).
 */
export class HellbanePickaxeItem extends PickaxeItem {
  readonly id = 'hellbane_pickaxe'
  readonly name = 'hellbane_pickaxe'
  protected readonly baseDamage = 15.0
  protected readonly tier = 7
  protected readonly rockMultiplier = 14.0

  override get displayName(): string {
    return 'Hellbane Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/hellbane-pickaxe-icon.webp', import.meta.url).href
  }
}
