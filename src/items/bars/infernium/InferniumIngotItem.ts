import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Infernium ingot: forge-smelted raw infernium. The tier 6 metal - infernium
 * gear and the Hellforge are made from it.
 */
export class InferniumIngotItem extends Item {
  readonly id = 'infernium_ingot'
  readonly name = 'infernium_ingot'

  override get displayName(): string {
    return 'Infernium Ingot'
  }

  override get iconUrl(): string {
    return new URL('./assets/infernium-ingot-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL, ItemTags.BAR]
  }
}
