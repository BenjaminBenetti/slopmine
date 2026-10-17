import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Frostbound Planks block item.
 */
export class FrostboundPlanksBlockItem extends BlockItem {
  readonly id = 'frostbound_planks_block'
  readonly name = 'frostbound_planks_block'
  readonly blockName = 'frostbound_planks'

  override get displayName(): string {
    return 'Frostbound Planks'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.PLANK]
  }
}
