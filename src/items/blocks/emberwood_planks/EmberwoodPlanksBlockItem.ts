import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

export class EmberwoodPlanksBlockItem extends BlockItem {
  readonly id = 'emberwood_planks_block'
  readonly name = 'emberwood_planks_block'
  readonly blockName = 'emberwood_planks'

  override get displayName(): string {
    return 'Emberwood Planks'
  }

  /** Wood + plank: sticks, chests and every plank recipe accept it. */
  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.PLANK]
  }
}
