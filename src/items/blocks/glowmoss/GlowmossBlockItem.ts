import { BlockItem } from '../../BlockItem.ts'

export class GlowmossBlockItem extends BlockItem {
  readonly id = 'glowmoss_block'
  readonly name = 'glowmoss_block'
  readonly blockName = 'glowmoss'

  override get displayName(): string {
    return 'Glowmoss'
  }
}
