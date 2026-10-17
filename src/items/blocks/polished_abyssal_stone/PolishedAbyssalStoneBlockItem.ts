import { BlockItem } from '../../BlockItem.ts'

/**
 * Polished Abyssal Stone block item (Crystal Abyss).
 */
export class PolishedAbyssalStoneBlockItem extends BlockItem {
  readonly id = 'polished_abyssal_stone_block'
  readonly name = 'polished_abyssal_stone_block'
  readonly blockName = 'polished_abyssal_stone'

  override get displayName(): string {
    return 'Polished Abyssal Stone'
  }
}
