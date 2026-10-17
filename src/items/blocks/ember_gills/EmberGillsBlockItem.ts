import { BlockItem } from '../../BlockItem.ts'

export class EmberGillsBlockItem extends BlockItem {
  readonly id = 'ember_gills_block'
  readonly name = 'ember_gills_block'
  readonly blockName = 'ember_gills'

  override get displayName(): string {
    return 'Ember Gills'
  }
}
