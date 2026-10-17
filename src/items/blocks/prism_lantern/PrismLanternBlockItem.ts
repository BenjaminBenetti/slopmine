import { BlockItem } from '../../BlockItem.ts'

/** Prism Lantern block item (Prism Sanctum). */
export class PrismLanternBlockItem extends BlockItem {
  readonly id = 'prism_lantern_block'
  readonly name = 'prism_lantern_block'
  readonly blockName = 'prism_lantern'

  override get displayName(): string {
    return 'Prism Lantern'
  }
}
