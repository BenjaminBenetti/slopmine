import { Item } from '../../Item.ts'

/**
 * Vine block item for player inventory.
 */
export class VineBlockItem extends Item {
  readonly id = 'vine_block'
  readonly name = 'vine_block'

  override get displayName(): string {
    return 'Vine Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/vine-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
