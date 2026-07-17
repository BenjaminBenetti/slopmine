import { BlockItem } from '../../BlockItem.ts'

export class PodzolBlockItem extends BlockItem {
  readonly id = 'podzol_block'
  readonly name = 'podzol_block'
  readonly blockName = 'podzol'

  override get displayName(): string {
    return 'Podzol'
  }
}
