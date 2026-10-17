import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Emberwood stairs block item for player inventory.
 */
export class EmberwoodStairsBlockItem extends BlockItem {
  readonly id = 'emberwood_stairs_block'
  readonly name = 'emberwood_stairs_block'
  readonly blockName = 'emberwood_stairs'

  override get displayName(): string {
    return 'Emberwood Stairs'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
