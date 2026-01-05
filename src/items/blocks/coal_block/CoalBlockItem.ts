import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Coal block item for player inventory.
 */
export class CoalBlockItem extends Item {
  readonly id = 'coal_block'
  readonly name = 'coal_block'

  override get displayName(): string {
    return 'Coal Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/coal-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
