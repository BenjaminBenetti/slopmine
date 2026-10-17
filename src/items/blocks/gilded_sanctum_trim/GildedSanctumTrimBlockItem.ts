import { BlockItem } from '../../BlockItem.ts'

/** Gilded Sanctum Trim block item (Prism Sanctum). */
export class GildedSanctumTrimBlockItem extends BlockItem {
  readonly id = 'gilded_sanctum_trim_block'
  readonly name = 'gilded_sanctum_trim_block'
  readonly blockName = 'gilded_sanctum_trim'

  override get displayName(): string {
    return 'Gilded Sanctum Trim'
  }
}
