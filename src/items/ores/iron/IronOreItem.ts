import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Raw iron ore item dropped when mining iron blocks.
 * Can be smelted into iron ingots.
 */
export class IronOreItem extends Item {
  readonly id = 'iron_ore'
  readonly name = 'iron_ore'

  override get displayName(): string {
    return 'Iron Ore'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-ore-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.ORE]
  }
}
