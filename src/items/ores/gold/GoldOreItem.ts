import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Raw gold ore item dropped when mining gold blocks.
 * Can be smelted into gold ingots.
 */
export class GoldOreItem extends Item {
  readonly id = 'gold_ore'
  readonly name = 'gold_ore'

  override get displayName(): string {
    return 'Gold Ore'
  }

  override get iconUrl(): string {
    return new URL('./assets/gold-ore-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.ORE]
  }
}
