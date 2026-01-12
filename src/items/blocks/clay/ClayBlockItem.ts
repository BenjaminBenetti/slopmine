import { Item } from '../../Item.ts'

/**
 * Clay block item for player inventory.
 */
export class ClayBlockItem extends Item {
  readonly id = 'clay_block'
  readonly name = 'clay_block'

  override get displayName(): string {
    return 'Clay Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/clay-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
