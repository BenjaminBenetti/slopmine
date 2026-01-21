import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Apothecary Workbench block item for player inventory.
 * Can be placed to create an apothecary workbench for brewing potions.
 */
export class ApothecaryWorkbenchBlockItem extends BlockItem {
  readonly id = 'apothecary_workbench_block'
  readonly name = 'apothecary_workbench_block'
  readonly blockName = 'apothecary_workbench'

  override get displayName(): string {
    return 'Apothecary Workbench'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
