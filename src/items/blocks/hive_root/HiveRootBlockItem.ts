import { BlockItem } from '../../BlockItem.ts'

export class HiveRootBlockItem extends BlockItem {
  readonly id = 'hive_root_block'
  readonly name = 'hive_root_block'
  readonly blockName = 'hive_root'

  override get displayName(): string {
    return 'Hive Root'
  }
}
