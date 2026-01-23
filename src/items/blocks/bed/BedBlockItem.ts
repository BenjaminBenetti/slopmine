import { BlockItem } from '../../BlockItem.ts'

/**
 * Bed block item for the player inventory.
 * Places a BED_HEAD block, which automatically places the BED_FOOT.
 */
export class BedBlockItem extends BlockItem {
  readonly id = 'bed_head_block'
  readonly name = 'bed_head_block'
  readonly blockName = 'bed_head'

  override get displayName(): string {
    return 'Bed'
  }

  override get iconUrl(): string {
    return new URL('./assets/bed-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['block', 'furniture']
  }
}
