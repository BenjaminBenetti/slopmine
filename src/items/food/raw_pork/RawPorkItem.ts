import { Item } from '../../Item.ts'

/**
 * Raw pork item dropped when killing pigs.
 * Can be eaten or cooked in a forge.
 */
export class RawPorkItem extends Item {
  readonly id = 'raw_pork'
  readonly name = 'raw_pork'

  override get displayName(): string {
    return 'Raw Pork'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-pork-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
