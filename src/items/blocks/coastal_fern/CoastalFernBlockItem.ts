import { BlockItem } from '../../BlockItem.ts'

export class CoastalFernBlockItem extends BlockItem {
  readonly id = 'coastal_fern_block'
  readonly name = 'coastal_fern_block'
  readonly blockName = 'coastal_fern'

  override get displayName(): string {
    return 'Coastal Fern'
  }
}
