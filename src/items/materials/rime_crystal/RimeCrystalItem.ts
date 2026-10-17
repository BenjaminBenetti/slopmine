import { Item } from '../../Item.ts'

/**
 * Rime crystal - mined from rime crystal ore in Cocytus (diamond pickaxe).
 * Iceskin potions, hellbane boots and frost lanterns.
 */
export class RimeCrystalItem extends Item {
  readonly id = 'rime_crystal'
  readonly name = 'rime_crystal'

  override get displayName(): string {
    return 'Rime Crystal'
  }

  override get iconUrl(): string {
    return new URL('./assets/rime-crystal-icon.webp', import.meta.url).href
  }
}
