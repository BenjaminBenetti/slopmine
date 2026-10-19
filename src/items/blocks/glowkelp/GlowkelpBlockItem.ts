import { BlockItem } from '../../BlockItem.ts'

export class GlowkelpBlockItem extends BlockItem {
  readonly id = 'glowkelp_block'
  readonly name = 'glowkelp_block'
  readonly blockName = 'glowkelp'

  override get displayName(): string {
    return 'Glowkelp'
  }
}
