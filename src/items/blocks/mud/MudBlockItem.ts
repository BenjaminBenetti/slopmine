import { BlockItem } from '../../BlockItem.ts'

/**
 * Mud block item for player inventory.
 */
export class MudBlockItem extends BlockItem {
  readonly id = 'mud_block'
  readonly name = 'mud_block'
  readonly blockName = 'mud'

  override get displayName(): string {
    return 'Mud Block'
  }
}
