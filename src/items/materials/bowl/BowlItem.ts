import { Item } from '../../Item.ts'

/**
 * A wooden bowl for stews.
 */
export class BowlItem extends Item {
  readonly id = 'bowl'
  readonly name = 'bowl'

  override get displayName(): string {
    return 'Bowl'
  }

  override get iconUrl(): string {
    return new URL('./assets/bowl-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'container']
  }
}
