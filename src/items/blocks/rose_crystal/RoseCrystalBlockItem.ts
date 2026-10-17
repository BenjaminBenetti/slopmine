import { BlockItem } from '../../BlockItem.ts'

/**
 * Rose Crystal block item (Crystal Abyss).
 */
export class RoseCrystalBlockItem extends BlockItem {
  readonly id = 'rose_crystal_block'
  readonly name = 'rose_crystal_block'
  readonly blockName = 'rose_crystal'

  override get displayName(): string {
    return 'Rose Crystal'
  }
}
