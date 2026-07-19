import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Pine door block item for player inventory. Places the lower closed
 * door block, which spawns the upper half above it.
 */
export class PineDoorBlockItem extends BlockItem {
  readonly id = 'pine_door_block'
  readonly name = 'pine_door_block'
  readonly blockName = 'pine_door'

  override get displayName(): string {
    return 'Pine Door'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
