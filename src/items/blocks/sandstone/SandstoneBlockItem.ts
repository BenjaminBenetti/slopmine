import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Sandstone block item for player inventory.
 */
export class SandstoneBlockItem extends Item {
  readonly id = 'sandstone_block'
  readonly name = 'sandstone_block'

  override get displayName(): string {
    return 'Sandstone Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/sandstone-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
