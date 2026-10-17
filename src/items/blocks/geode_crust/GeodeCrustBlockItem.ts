import { BlockItem } from '../../BlockItem.ts'

/**
 * Geode Crust block item (Crystal Abyss).
 */
export class GeodeCrustBlockItem extends BlockItem {
  readonly id = 'geode_crust_block'
  readonly name = 'geode_crust_block'
  readonly blockName = 'geode_crust'

  override get displayName(): string {
    return 'Geode Crust'
  }
}
