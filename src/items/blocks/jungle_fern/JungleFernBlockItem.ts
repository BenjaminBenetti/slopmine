import { BlockItem } from '../../BlockItem.ts'

/**
 * Jungle fern block item for player inventory.
 */
export class JungleFernBlockItem extends BlockItem {
  readonly id = 'jungle_fern_block'
  readonly name = 'jungle_fern_block'
  readonly blockName = 'jungle_fern'

  override get displayName(): string {
    return 'Jungle Fern'
  }
}
