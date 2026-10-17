import { BlockItem } from '../../BlockItem.ts'

/**
 * Cinder Ash block item.
 */
export class HellAshBlockItem extends BlockItem {
  readonly id = 'hell_ash_block'
  readonly name = 'hell_ash_block'
  readonly blockName = 'hell_ash'

  override get displayName(): string {
    return 'Cinder Ash'
  }
}
