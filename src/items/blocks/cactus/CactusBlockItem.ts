import { Item } from '../../Item.ts'

/**
 * Cactus block item for player inventory.
 */
export class CactusBlockItem extends Item {
  readonly id = 'cactus_block'
  readonly name = 'cactus_block'

  override get displayName(): string {
    return 'Cactus Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/cactus-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
