import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Placeable resin tap: hang it on a living pine log and it slowly fills
 * with pine resin (collect with E).
 */
export class ResinTapBlockItem extends BlockItem {
  readonly id = 'resin_tap_block'
  readonly name = 'resin_tap_block'
  readonly blockName = 'resin_tap'

  override get displayName(): string {
    return 'Resin Tap'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
