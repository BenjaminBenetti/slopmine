import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak door block item for player inventory. Places the lower closed
 * door block, which spawns the upper half above it.
 */
export class OakDoorBlockItem extends BlockItem {
  readonly id = 'oak_door_block'
  readonly name = 'oak_door_block'
  readonly blockName = 'oak_door'

  override get displayName(): string {
    return 'Oak Door'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
