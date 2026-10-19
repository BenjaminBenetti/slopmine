import { Item } from '../../Item.ts'

/**
 * Angler Lure - the glowing bulb a mire angler dangles over the swamp to
 * draw prey in. Still faintly alight; a night trophy.
 */
export class AnglerLureItem extends Item {
  readonly id = 'angler_lure'
  readonly name = 'angler_lure'

  override get displayName(): string {
    return 'Angler Lure'
  }

  override get iconUrl(): string {
    return new URL('./assets/angler-lure-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'night_trophy']
  }
}
