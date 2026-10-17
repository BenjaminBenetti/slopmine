import { BlockItem } from '../../BlockItem.ts'

export class ChitinPlateBlockItem extends BlockItem {
  readonly id = 'chitin_plate_block'
  readonly name = 'chitin_plate_block'
  readonly blockName = 'chitin_plate'

  override get displayName(): string {
    return 'Chitin Plate'
  }
}
