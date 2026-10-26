import { Item } from '../../Item.ts'

/**
 * Canoe - a cedar canoe and its paddle. Right-click water to put it in, E to
 * board it (setupBoats). Paddled: quick to make, all wood.
 */
export class CanoeItem extends Item {
  readonly id = 'canoe'
  readonly name = 'canoe'

  override get displayName(): string {
    return 'Canoe'
  }

  override get maxStackSize(): number {
    return 1
  }

  override get iconUrl(): string {
    return new URL('./assets/canoe-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['vehicle', 'wood']
  }
}
