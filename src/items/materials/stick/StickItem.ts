import { Item } from '../../Item.ts'

/**
 * Stick crafted from planks at the woodworking bench.
 * Basic carpentry material (deliberately not tagged as wood).
 */
export class StickItem extends Item {
  readonly id = 'stick'
  readonly name = 'stick'

  override get displayName(): string {
    return 'Stick'
  }

  override get iconUrl(): string {
    return new URL('./assets/stick-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material']
  }
}
