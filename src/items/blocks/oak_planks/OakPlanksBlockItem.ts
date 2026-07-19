import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak planks block item for player inventory.
 */
export class OakPlanksBlockItem extends BlockItem {
  readonly id = 'oak_planks_block'
  readonly name = 'oak_planks_block'
  readonly blockName = 'oak_planks'

  override get displayName(): string {
    return 'Oak Planks'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.PLANK]
  }
}
