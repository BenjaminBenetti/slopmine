import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Pine fence gate block item for player inventory.
 * Places the closed gate block; both closed and open variants drop this item.
 */
export class PineFenceGateBlockItem extends BlockItem {
  readonly id = 'pine_fence_gate_block'
  readonly name = 'pine_fence_gate_block'
  readonly blockName = 'pine_fence_gate'

  override get displayName(): string {
    return 'Pine Fence Gate'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
