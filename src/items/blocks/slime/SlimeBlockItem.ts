import { BlockItem } from '../../BlockItem.ts'

/**
 * Slime block item (4 slime balls). Places the springy slime block.
 */
export class SlimeBlockItem extends BlockItem {
  readonly id = 'slime_block'
  readonly name = 'slime_block'
  readonly blockName = 'slime'

  override get displayName(): string {
    return 'Slime Block'
  }

  override get tags(): ReadonlyArray<string> {
    return ['slime']
  }
}
