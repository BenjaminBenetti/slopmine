import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Abyssal Stone block item (Crystal Abyss).
 */
export class AbyssalStoneBlockItem extends BlockItem {
  readonly id = 'abyssal_stone_block'
  readonly name = 'abyssal_stone_block'
  readonly blockName = 'abyssal_stone'

  override get displayName(): string {
    return 'Abyssal Stone'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
