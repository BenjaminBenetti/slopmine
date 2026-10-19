import { BlockItem } from '../../BlockItem.ts'

/**
 * Ward Lantern block item: no night creature rises within 32 blocks of a
 * placed Ward Lantern.
 */
export class WardLanternBlockItem extends BlockItem {
  readonly id = 'ward_lantern_block'
  readonly name = 'ward_lantern_block'
  readonly blockName = 'ward_lantern'

  override get displayName(): string {
    return 'Ward Lantern'
  }
}
