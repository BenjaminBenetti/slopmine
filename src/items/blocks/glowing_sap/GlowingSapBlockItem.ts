import { BlockItem } from '../../BlockItem.ts'

export class GlowingSapBlockItem extends BlockItem {
  readonly id = 'glowing_sap_block'
  readonly name = 'glowing_sap_block'
  readonly blockName = 'glowing_sap'

  override get displayName(): string {
    return 'Glowing Sap'
  }
}
