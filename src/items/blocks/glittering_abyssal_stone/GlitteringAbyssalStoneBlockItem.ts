import { BlockItem } from '../../BlockItem.ts'

/**
 * Glittering Abyssal Stone block item (Crystal Abyss).
 */
export class GlitteringAbyssalStoneBlockItem extends BlockItem {
  readonly id = 'glittering_abyssal_stone_block'
  readonly name = 'glittering_abyssal_stone_block'
  readonly blockName = 'glittering_abyssal_stone'

  override get displayName(): string {
    return 'Glittering Abyssal Stone'
  }
}
