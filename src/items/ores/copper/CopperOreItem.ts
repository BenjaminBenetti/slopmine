import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Raw copper ore item dropped when mining copper blocks.
 * Can be smelted into copper ingots.
 */
export class CopperOreItem extends Item {
  readonly id = 'copper_ore'
  readonly name = 'copper_ore'

  override get displayName(): string {
    return 'Copper Ore'
  }

  override get iconUrl(): string {
    return new URL('./assets/copper-ore-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.ORE]
  }
}
