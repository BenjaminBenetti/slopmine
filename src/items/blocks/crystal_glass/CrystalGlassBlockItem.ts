import { BlockItem } from '../../BlockItem.ts'

/** Crystal Glass block item (Prism Sanctum). */
export class CrystalGlassBlockItem extends BlockItem {
  readonly id = 'crystal_glass_block'
  readonly name = 'crystal_glass_block'
  readonly blockName = 'crystal_glass'

  override get displayName(): string {
    return 'Crystal Glass'
  }
}
