import { BlockItem } from '../../BlockItem.ts'

/**
 * Cactus block item for player inventory.
 */
export class CactusBlockItem extends BlockItem {
  readonly id = 'cactus_block'
  readonly name = 'cactus_block'
  readonly blockName = 'cactus'

  override get displayName(): string {
    return 'Cactus Block'
  }
}
