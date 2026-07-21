import { BlockItem } from '../../BlockItem.ts'

/**
 * Cattail block item for player inventory.
 */
export class CattailBlockItem extends BlockItem {
  readonly id = 'cattail_block'
  readonly name = 'cattail_block'
  readonly blockName = 'cattail'

  override get displayName(): string {
    return 'Cattail'
  }
}
