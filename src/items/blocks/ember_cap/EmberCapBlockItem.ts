import { BlockItem } from '../../BlockItem.ts'

export class EmberCapBlockItem extends BlockItem {
  readonly id = 'ember_cap_block'
  readonly name = 'ember_cap_block'
  readonly blockName = 'ember_cap'

  override get displayName(): string {
    return 'Ember Cap'
  }
}
