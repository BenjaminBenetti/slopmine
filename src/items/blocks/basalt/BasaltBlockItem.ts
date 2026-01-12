import { Item } from '../../Item.ts'

/**
 * Basalt block item for player inventory.
 */
export class BasaltBlockItem extends Item {
  readonly id = 'basalt_block'
  readonly name = 'basalt_block'

  override get displayName(): string {
    return 'Basalt Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/basalt-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
