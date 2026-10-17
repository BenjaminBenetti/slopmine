import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Brazier block item.
 */
export class InfernalBrazierBlockItem extends BlockItem {
  readonly id = 'infernal_brazier_block'
  readonly name = 'infernal_brazier_block'
  readonly blockName = 'infernal_brazier'

  override get displayName(): string {
    return 'Infernal Brazier'
  }
}
