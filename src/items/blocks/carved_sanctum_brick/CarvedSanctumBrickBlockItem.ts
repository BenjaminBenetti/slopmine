import { BlockItem } from '../../BlockItem.ts'

/** Carved Sanctum Brick block item (Prism Sanctum). */
export class CarvedSanctumBrickBlockItem extends BlockItem {
  readonly id = 'carved_sanctum_brick_block'
  readonly name = 'carved_sanctum_brick_block'
  readonly blockName = 'carved_sanctum_brick'

  override get displayName(): string {
    return 'Carved Sanctum Brick'
  }
}
