import { Item } from '../../Item.ts'

/**
 * Magma block item for player inventory.
 */
export class MagmaBlockItem extends Item {
  readonly id = 'magma_block'
  readonly name = 'magma_block'

  override get displayName(): string {
    return 'Magma Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/magma-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
