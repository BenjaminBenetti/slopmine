import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

export class EmberwoodStemBlockItem extends BlockItem {
  readonly id = 'emberwood_stem_block'
  readonly name = 'emberwood_stem_block'
  readonly blockName = 'emberwood_stem'

  override get displayName(): string {
    return 'Emberwood Stem'
  }

  /** Wood + log: sticks, torches, wood tools, charcoal and the plank recipes all accept it. */
  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.LOG]
  }
}
