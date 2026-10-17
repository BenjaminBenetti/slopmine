import { BlockItem } from '../../BlockItem.ts'

/**
 * Ash Snow block item.
 */
export class AshSnowBlockItem extends BlockItem {
  readonly id = 'ash_snow_block'
  readonly name = 'ash_snow_block'
  readonly blockName = 'ash_snow'

  override get displayName(): string {
    return 'Ash Snow'
  }
}
