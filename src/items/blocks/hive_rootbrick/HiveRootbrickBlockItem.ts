import { BlockItem } from '../../BlockItem.ts'

export class HiveRootbrickBlockItem extends BlockItem {
  readonly id = 'hive_rootbrick_block'
  readonly name = 'hive_rootbrick_block'
  readonly blockName = 'hive_rootbrick'

  override get displayName(): string {
    return 'Hive Rootbrick'
  }
}
