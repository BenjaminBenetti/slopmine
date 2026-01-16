import { Item } from '../../Item.ts'

/**
 * Raw komodo dragon meat item dropped when killing komodo dragons.
 * Can be eaten or cooked in a forge.
 */
export class RawKomodoMeatItem extends Item {
  readonly id = 'raw_komodo_meat'
  readonly name = 'raw_komodo_meat'

  override get displayName(): string {
    return 'Raw Komodo Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-komodo-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
