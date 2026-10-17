import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Raw infernium, dropped by infernium ore in the Molten Wastes (Hell).
 * Smelted in a forge into infernium ingots - the tier 6 metal.
 */
export class RawInferniumItem extends Item {
  readonly id = 'raw_infernium'
  readonly name = 'raw_infernium'

  override get displayName(): string {
    return 'Raw Infernium'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-infernium-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.ORE]
  }
}
