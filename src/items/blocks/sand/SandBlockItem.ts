import { Item } from '../../Item.ts'

/**
 * Sand block item for player inventory.
 */
export class SandBlockItem extends Item {
  readonly id = 'sand_block'
  readonly name = 'sand_block'

  override get displayName(): string {
    return 'Sand Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/sand-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
