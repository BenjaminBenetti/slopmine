import { BlockItem } from '../../BlockItem.ts'

export class GlimmercapBlockItem extends BlockItem {
  readonly id = 'glimmercap_block'
  readonly name = 'glimmercap_block'
  readonly blockName = 'glimmercap'

  override get displayName(): string {
    return 'Glimmercap'
  }
}
