import { BlockItem } from '../../BlockItem.ts'

export class SporeSacBlockItem extends BlockItem {
  readonly id = 'spore_sac_block'
  readonly name = 'spore_sac_block'
  readonly blockName = 'spore_sac'

  override get displayName(): string {
    return 'Spore Sac'
  }
}
