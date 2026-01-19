import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Corrupted Hell Rock block item for player inventory.
 */
export class CorruptedHellRockBlockItem extends BlockItem {
  readonly id = 'corrupted_hell_rock_block'
  readonly name = 'corrupted_hell_rock_block'
  readonly blockName = 'corrupted_hell_rock'

  override get displayName(): string {
    return 'Corrupted Hell Rock'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
