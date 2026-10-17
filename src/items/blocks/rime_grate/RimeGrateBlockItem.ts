import { BlockItem } from '../../BlockItem.ts'

/**
 * Rime Grate block item.
 */
export class RimeGrateBlockItem extends BlockItem {
  readonly id = 'rime_grate_block'
  readonly name = 'rime_grate_block'
  readonly blockName = 'rime_grate'

  override get displayName(): string {
    return 'Rime Grate'
  }
}
