import { BlockItem } from '../../BlockItem.ts'

/**
 * Ice Pillar block item.
 */
export class IcePillarBlockItem extends BlockItem {
  readonly id = 'ice_pillar_block'
  readonly name = 'ice_pillar_block'
  readonly blockName = 'ice_pillar'

  override get displayName(): string {
    return 'Ice Pillar'
  }
}
