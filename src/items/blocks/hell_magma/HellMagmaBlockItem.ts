import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Hell Magma block item for player inventory.
 */
export class HellMagmaBlockItem extends BlockItem {
  readonly id = 'hell_magma_block'
  readonly name = 'hell_magma_block'
  readonly blockName = 'hell_magma'

  override get displayName(): string {
    return 'Hell Magma'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
