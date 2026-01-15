import { Item } from '../../Item.ts'

/**
 * Raw fox meat item dropped when killing foxes.
 * Can be eaten or cooked in a forge.
 */
export class RawFoxMeatItem extends Item {
  readonly id = 'raw_fox_meat'
  readonly name = 'raw_fox_meat'

  override get displayName(): string {
    return 'Raw Fox Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-fox-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
