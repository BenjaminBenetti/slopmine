import { Item } from '../../Item.ts'

/**
 * Mushroom block item for player inventory.
 */
export class MushroomBlockItem extends Item {
  readonly id = 'mushroom_block'
  readonly name = 'mushroom_block'

  override get displayName(): string {
    return 'Mushroom Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/mushroom-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
