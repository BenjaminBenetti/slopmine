import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Diamond block item for player inventory.
 */
export class DiamondBlockItem extends Item {
  readonly id = 'diamond_block'
  readonly name = 'diamond_block'

  override get displayName(): string {
    return 'Diamond Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/diamond-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
