import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Redwood stairs block item for player inventory.
 */
export class RedwoodStairsBlockItem extends BlockItem {
  readonly id = 'redwood_stairs_block'
  readonly name = 'redwood_stairs_block'
  readonly blockName = 'redwood_stairs'

  override get displayName(): string {
    return 'Redwood Stairs'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
