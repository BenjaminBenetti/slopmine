import { Item } from '../../Item.ts'

/**
 * Raw alligator meat item dropped when killing alligators.
 * Can be cooked in a forge.
 */
export class RawAlligatorMeatItem extends Item {
  readonly id = 'raw_alligator_meat'
  readonly name = 'raw_alligator_meat'

  override get displayName(): string {
    return 'Raw Alligator Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-alligator-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
