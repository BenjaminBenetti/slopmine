import { BlockItem } from '../../BlockItem.ts'

/**
 * Ember Lantern block item (Infernal Bastion).
 */
export class EmberLanternBlockItem extends BlockItem {
  readonly id = 'ember_lantern_block'
  readonly name = 'ember_lantern_block'
  readonly blockName = 'ember_lantern'

  override get displayName(): string {
    return 'Ember Lantern'
  }
}
