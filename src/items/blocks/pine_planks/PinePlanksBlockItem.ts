import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Pine planks block item for player inventory.
 */
export class PinePlanksBlockItem extends BlockItem {
  readonly id = 'pine_planks_block'
  readonly name = 'pine_planks_block'
  readonly blockName = 'pine_planks'

  override get displayName(): string {
    return 'Pine Planks'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.PLANK]
  }
}
