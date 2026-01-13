import { BlockItem } from '../../BlockItem.ts'

/**
 * Muddy grass block item for player inventory.
 */
export class MuddyGrassBlockItem extends BlockItem {
  readonly id = 'muddy_grass_block'
  readonly name = 'muddy_grass_block'
  readonly blockName = 'muddy_grass'

  override get displayName(): string {
    return 'Muddy Grass'
  }
}
