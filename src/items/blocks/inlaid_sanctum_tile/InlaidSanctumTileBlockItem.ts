import { BlockItem } from '../../BlockItem.ts'

/** Inlaid Sanctum Tile block item (Prism Sanctum). */
export class InlaidSanctumTileBlockItem extends BlockItem {
  readonly id = 'inlaid_sanctum_tile_block'
  readonly name = 'inlaid_sanctum_tile_block'
  readonly blockName = 'inlaid_sanctum_tile'

  override get displayName(): string {
    return 'Inlaid Sanctum Tile'
  }
}
