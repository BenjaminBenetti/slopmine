import { BlockItem } from '../../BlockItem.ts'

/**
 * Sand block item for player inventory.
 */
export class SandBlockItem extends BlockItem {
  readonly id = 'sand_block'
  readonly name = 'sand_block'
  readonly blockName = 'sand'

  override get displayName(): string {
    return 'Sand Block'
  }
}
