import { BlockItem } from '../../BlockItem.ts'

export class OvergrownRootbrickBlockItem extends BlockItem {
  readonly id = 'overgrown_rootbrick_block'
  readonly name = 'overgrown_rootbrick_block'
  readonly blockName = 'overgrown_rootbrick'

  override get displayName(): string {
    return 'Overgrown Rootbrick'
  }
}
