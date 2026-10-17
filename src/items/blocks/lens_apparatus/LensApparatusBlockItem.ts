import { BlockItem } from '../../BlockItem.ts'

/** Lens Apparatus block item (Prism Sanctum). */
export class LensApparatusBlockItem extends BlockItem {
  readonly id = 'lens_apparatus_block'
  readonly name = 'lens_apparatus_block'
  readonly blockName = 'lens_apparatus'

  override get displayName(): string {
    return 'Lens Apparatus'
  }
}
