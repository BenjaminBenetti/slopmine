import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Throne block item (Infernal Bastion).
 */
export class InfernalThroneBlockItem extends BlockItem {
  readonly id = 'infernal_throne_block'
  readonly name = 'infernal_throne_block'
  readonly blockName = 'infernal_throne'

  override get displayName(): string {
    return 'Infernal Throne'
  }
}
