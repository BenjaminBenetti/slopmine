import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Anvil block item (Infernal Bastion).
 */
export class InfernalAnvilBlockItem extends BlockItem {
  readonly id = 'infernal_anvil_block'
  readonly name = 'infernal_anvil_block'
  readonly blockName = 'infernal_anvil'

  override get displayName(): string {
    return 'Infernal Anvil'
  }
}
