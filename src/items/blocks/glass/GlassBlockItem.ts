import { BlockItem } from '../../BlockItem.ts'

/**
 * Glass block item for player inventory.
 * Can be smelted from sand.
 */
export class GlassBlockItem extends BlockItem {
  readonly id = 'glass_block'
  readonly name = 'glass_block'
  readonly blockName = 'glass'

  override get displayName(): string {
    return 'Glass'
  }
}
