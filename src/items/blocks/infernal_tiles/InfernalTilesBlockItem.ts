import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Tiles block item (Infernal Bastion).
 */
export class InfernalTilesBlockItem extends BlockItem {
  readonly id = 'infernal_tiles_block'
  readonly name = 'infernal_tiles_block'
  readonly blockName = 'infernal_tiles'

  override get displayName(): string {
    return 'Infernal Tiles'
  }
}
