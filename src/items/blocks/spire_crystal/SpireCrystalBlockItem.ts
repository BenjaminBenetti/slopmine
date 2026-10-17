import { BlockItem } from '../../BlockItem.ts'

/**
 * Spire Crystal block item (Crystal Abyss).
 */
export class SpireCrystalBlockItem extends BlockItem {
  readonly id = 'spire_crystal_block'
  readonly name = 'spire_crystal_block'
  readonly blockName = 'spire_crystal'

  override get displayName(): string {
    return 'Spire Crystal'
  }
}
