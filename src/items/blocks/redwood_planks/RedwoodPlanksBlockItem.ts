import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Redwood planks block item for player inventory.
 */
export class RedwoodPlanksBlockItem extends BlockItem {
  readonly id = 'redwood_planks_block'
  readonly name = 'redwood_planks_block'
  readonly blockName = 'redwood_planks'

  override get displayName(): string {
    return 'Redwood Planks'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.PLANK]
  }
}
