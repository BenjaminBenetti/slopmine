import { BlockItem } from '../../BlockItem.ts'

export class MycelialCarpetBlockItem extends BlockItem {
  readonly id = 'mycelial_carpet_block'
  readonly name = 'mycelial_carpet_block'
  readonly blockName = 'mycelial_carpet'

  override get displayName(): string {
    return 'Mycelial Carpet'
  }
}
