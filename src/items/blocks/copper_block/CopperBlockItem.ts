import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Copper block item for player inventory.
 */
export class CopperBlockItem extends Item {
  readonly id = 'copper_block'
  readonly name = 'copper_block'

  override get displayName(): string {
    return 'Copper Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/copper-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
