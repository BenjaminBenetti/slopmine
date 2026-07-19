import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Redwood fence gate block item for player inventory.
 * Places the closed gate block; both closed and open variants drop this item.
 */
export class RedwoodFenceGateBlockItem extends BlockItem {
  readonly id = 'redwood_fence_gate_block'
  readonly name = 'redwood_fence_gate_block'
  readonly blockName = 'redwood_fence_gate'

  override get displayName(): string {
    return 'Redwood Fence Gate'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
