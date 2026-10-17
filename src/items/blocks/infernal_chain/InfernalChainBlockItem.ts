import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Chain block item (Infernal Bastion).
 */
export class InfernalChainBlockItem extends BlockItem {
  readonly id = 'infernal_chain_block'
  readonly name = 'infernal_chain_block'
  readonly blockName = 'infernal_chain'

  override get displayName(): string {
    return 'Infernal Chain'
  }
}
