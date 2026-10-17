import { BlockItem } from '../../BlockItem.ts'

/**
 * Abyssal Bricks block item (Crystal Abyss).
 */
export class AbyssalBricksBlockItem extends BlockItem {
  readonly id = 'abyssal_bricks_block'
  readonly name = 'abyssal_bricks_block'
  readonly blockName = 'abyssal_bricks'

  override get displayName(): string {
    return 'Abyssal Bricks'
  }
}
