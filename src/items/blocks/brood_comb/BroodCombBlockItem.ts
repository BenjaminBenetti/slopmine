import { BlockItem } from '../../BlockItem.ts'

export class BroodCombBlockItem extends BlockItem {
  readonly id = 'brood_comb_block'
  readonly name = 'brood_comb_block'
  readonly blockName = 'brood_comb'

  override get displayName(): string {
    return 'Brood Comb'
  }
}
