import { Item } from '../../Item.ts'

/**
 * Hemp fiber item harvested from mature hemp plants.
 * Can be used for crafting rope.
 */
export class HempFiberItem extends Item {
  readonly id = 'hemp_fiber'
  readonly name = 'hemp_fiber'

  override get displayName(): string {
    return 'Hemp Fiber'
  }

  override get iconUrl(): string {
    return new URL('./assets/hemp-fiber-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'fiber']
  }
}
