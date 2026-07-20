import { BlockItem } from '../../BlockItem.ts'

/**
 * Morel mushroom block item: a foraged morel that can be replanted on soil.
 * Not edible raw - cook it in a forge for CookedMorelItem
 * (id ends in "_block" so BlockPlacement resolves the block by name).
 */
export class MorelMushroomBlockItem extends BlockItem {
  readonly id = 'morel_mushroom_block'
  readonly name = 'morel_mushroom_block'
  readonly blockName = 'morel_mushroom'

  override get displayName(): string {
    return 'Morel Mushroom'
  }
}
