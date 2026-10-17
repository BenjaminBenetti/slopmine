import { BlockItem } from '../../BlockItem.ts'

/**
 * Hellforge block item for player inventory.
 * Placed to create a Hellforge, the station for infernium and hellbane gear.
 */
export class HellforgeBlockItem extends BlockItem {
  readonly id = 'hellforge_block'
  readonly name = 'hellforge_block'
  readonly blockName = 'hellforge'

  override get displayName(): string {
    return 'Hellforge'
  }
}
