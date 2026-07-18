import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Dried moss obtained by drying moss blocks in a forge.
 * Serves as tinder - an alternative to coal for crafting torches
 * and a weak furnace fuel.
 */
export class DriedMossItem extends Item {
  readonly id = 'dried_moss'
  readonly name = 'dried_moss'

  override get displayName(): string {
    return 'Dried Moss'
  }

  override get iconUrl(): string {
    return new URL('./assets/dried-moss-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.COAL, ItemTags.FUEL]
  }
}
