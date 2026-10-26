import { Item } from '../../Item.ts'

/**
 * Sailboat - a small sailing dinghy, folded into the inventory. Right-click
 * water to put it in, E to board it (setupBoats). It sails on the wind.
 */
export class SailboatItem extends Item {
  readonly id = 'sailboat'
  readonly name = 'sailboat'

  override get displayName(): string {
    return 'Sailboat'
  }

  override get maxStackSize(): number {
    return 1
  }

  override get iconUrl(): string {
    return new URL('./assets/sailboat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['vehicle', 'wood']
  }
}
