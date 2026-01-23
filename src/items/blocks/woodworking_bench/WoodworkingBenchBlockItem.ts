import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Woodworking bench block item for player inventory.
 * Can be placed to create a woodworking bench for processing wood.
 */
export class WoodworkingBenchBlockItem extends BlockItem {
  readonly id = 'woodworking_bench_block'
  readonly name = 'woodworking_bench_block'
  readonly blockName = 'woodworking_bench'

  override get displayName(): string {
    return 'Woodworking Bench'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
