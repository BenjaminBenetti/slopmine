import { Item } from '../../Item.ts'

/**
 * Mud block item for player inventory.
 */
export class MudBlockItem extends Item {
  readonly id = 'mud_block'
  readonly name = 'mud_block'

  override get displayName(): string {
    return 'Mud Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/mud-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
