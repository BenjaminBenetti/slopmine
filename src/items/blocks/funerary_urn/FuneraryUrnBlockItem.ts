import { BlockItem } from '../../BlockItem.ts'

/**
 * Funerary Urn block item (Catacombs).
 */
export class FuneraryUrnBlockItem extends BlockItem {
  readonly id = 'funerary_urn_block'
  readonly name = 'funerary_urn_block'
  readonly blockName = 'funerary_urn'

  override get displayName(): string {
    return 'Funerary Urn'
  }
}
