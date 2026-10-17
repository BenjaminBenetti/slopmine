import { BlockItem } from '../../BlockItem.ts'

/**
 * Charred Planks block item (Infernal Bastion).
 */
export class CharredPlanksBlockItem extends BlockItem {
  readonly id = 'charred_planks_block'
  readonly name = 'charred_planks_block'
  readonly blockName = 'charred_planks'

  override get displayName(): string {
    return 'Charred Planks'
  }
}
