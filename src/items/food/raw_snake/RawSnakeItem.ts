import { Item } from '../../Item.ts'

/**
 * Raw snake meat item dropped when killing snakes.
 * Can be eaten or cooked in a forge.
 */
export class RawSnakeItem extends Item {
  readonly id = 'raw_snake'
  readonly name = 'raw_snake'

  override get displayName(): string {
    return 'Raw Snake'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-snake-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
