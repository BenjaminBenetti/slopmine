import { Item } from '../../Item.ts'

/**
 * Raw beef item dropped when killing cows.
 * Can be eaten or cooked in a forge.
 */
export class RawBeefItem extends Item {
  readonly id = 'raw_beef'
  readonly name = 'raw_beef'

  override get displayName(): string {
    return 'Raw Beef'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-beef-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
