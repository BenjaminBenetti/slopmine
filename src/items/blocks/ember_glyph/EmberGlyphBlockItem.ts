import { BlockItem } from '../../BlockItem.ts'

/**
 * Ember Glyph block item.
 */
export class EmberGlyphBlockItem extends BlockItem {
  readonly id = 'ember_glyph_block'
  readonly name = 'ember_glyph_block'
  readonly blockName = 'ember_glyph'

  override get displayName(): string {
    return 'Ember Glyph'
  }
}
