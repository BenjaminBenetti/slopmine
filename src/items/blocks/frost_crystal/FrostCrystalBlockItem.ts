import { BlockItem } from '../../BlockItem.ts'

/**
 * Frost crystal block item (a glowing decorative light from Cocytus).
 */
export class FrostCrystalBlockItem extends BlockItem {
  readonly id = 'frost_crystal_block'
  readonly name = 'frost_crystal_block'
  readonly blockName = 'frost_crystal'

  override get displayName(): string {
    return 'Frost Crystal'
  }
}
