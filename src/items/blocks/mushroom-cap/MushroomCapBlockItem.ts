import { Item } from '../../Item.ts'

/**
 * Mushroom cap block item for player inventory.
 */
export class MushroomCapBlockItem extends Item {
  readonly id = 'mushroom_cap_block'
  readonly name = 'mushroom_cap_block'

  override get displayName(): string {
    return 'Mushroom Cap'
  }

  override get iconUrl(): string {
    return new URL('./assets/mushroom-cap-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
