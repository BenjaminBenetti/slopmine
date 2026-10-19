import { BlockItem } from '../../BlockItem.ts'

export class LumenFernBlockItem extends BlockItem {
  readonly id = 'lumen_fern_block'
  readonly name = 'lumen_fern_block'
  readonly blockName = 'lumen_fern'

  override get displayName(): string {
    return 'Lumen Fern'
  }
}
