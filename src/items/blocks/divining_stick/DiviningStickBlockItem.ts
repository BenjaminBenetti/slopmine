import { BlockItem } from '../../BlockItem.ts'

/**
 * Divining Stick block item for placing divining sticks.
 * Crafted from 2 wood pieces, forms a Y-shaped structure.
 */
export class DiviningStickBlockItem extends BlockItem {
  readonly id = 'divining_stick_block'
  readonly name = 'divining_stick'
  readonly blockName = 'divining_stick'

  override get displayName(): string {
    return 'Divining Stick'
  }
}
