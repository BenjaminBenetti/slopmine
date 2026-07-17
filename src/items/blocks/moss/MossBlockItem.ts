import { BlockItem } from '../../BlockItem.ts'

export class MossBlockItem extends BlockItem {
  readonly id = 'moss_block'
  readonly name = 'moss_block'
  readonly blockName = 'moss'

  override get displayName(): string {
    return 'Moss'
  }
}
