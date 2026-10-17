import { BlockItem } from '../../BlockItem.ts'

/** Prism Roof Tile block item (Prism Sanctum). */
export class PrismRoofTileBlockItem extends BlockItem {
  readonly id = 'prism_roof_tile_block'
  readonly name = 'prism_roof_tile_block'
  readonly blockName = 'prism_roof_tile'

  override get displayName(): string {
    return 'Prism Roof Tile'
  }
}
