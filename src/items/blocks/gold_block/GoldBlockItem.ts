import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Gold block item for player inventory.
 */
export class GoldBlockItem extends Item {
  readonly id = 'gold_block'
  readonly name = 'gold_block'

  override get displayName(): string {
    return 'Gold Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/gold-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
