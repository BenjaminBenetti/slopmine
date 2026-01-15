import { Item } from '../../Item.ts'

/**
 * Raw rabbit item dropped when killing rabbits.
 * Can be eaten or cooked in a forge.
 */
export class RawRabbitItem extends Item {
  readonly id = 'raw_rabbit'
  readonly name = 'raw_rabbit'

  override get displayName(): string {
    return 'Raw Rabbit'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-rabbit-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
