import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak fence gate block item for player inventory.
 * Places the closed gate block; both closed and open variants drop this item.
 */
export class OakFenceGateBlockItem extends BlockItem {
  readonly id = 'oak_fence_gate_block'
  readonly name = 'oak_fence_gate_block'
  readonly blockName = 'oak_fence_gate'

  override get displayName(): string {
    return 'Oak Fence Gate'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
