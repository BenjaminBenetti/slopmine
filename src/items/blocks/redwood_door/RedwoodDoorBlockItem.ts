import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Redwood door block item for player inventory. Places the lower closed
 * door block, which spawns the upper half above it.
 */
export class RedwoodDoorBlockItem extends BlockItem {
  readonly id = 'redwood_door_block'
  readonly name = 'redwood_door_block'
  readonly blockName = 'redwood_door'

  override get displayName(): string {
    return 'Redwood Door'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
