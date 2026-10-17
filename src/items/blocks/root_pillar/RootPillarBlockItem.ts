import { BlockItem } from '../../BlockItem.ts'

export class RootPillarBlockItem extends BlockItem {
  readonly id = 'root_pillar_block'
  readonly name = 'root_pillar_block'
  readonly blockName = 'root_pillar'

  override get displayName(): string {
    return 'Root Pillar'
  }
}
