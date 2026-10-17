import { PickaxeItem } from './PickaxeItem.ts'

/**
 * Infernium pickaxe tool item (tier 6, forged at the Hellforge).
 */
export class InferniumPickaxeItem extends PickaxeItem {
  readonly id = 'infernium_pickaxe'
  readonly name = 'infernium_pickaxe'
  protected readonly baseDamage = 10.0
  protected readonly tier = 6
  protected readonly rockMultiplier = 13.0

  override get displayName(): string {
    return 'Infernium Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/infernium-pickaxe-icon.webp', import.meta.url).href
  }
}
