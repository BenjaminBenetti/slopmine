import { BlockItem } from '../../BlockItem.ts'

export class GlowBulbBlockItem extends BlockItem {
  readonly id = 'glow_bulb_block'
  readonly name = 'glow_bulb_block'
  readonly blockName = 'glow_bulb'

  override get displayName(): string {
    return 'Glow Bulb'
  }
}
