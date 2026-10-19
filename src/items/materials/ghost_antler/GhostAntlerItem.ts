import { Item } from '../../Item.ts'

/**
 * Ghost Antler - a pale antler tine from a Hollow Stag, still glowing faintly
 * blue at its tip. A night trophy.
 */
export class GhostAntlerItem extends Item {
  readonly id = 'ghost_antler'
  readonly name = 'ghost_antler'

  override get displayName(): string {
    return 'Ghost Antler'
  }

  override get iconUrl(): string {
    return new URL('./assets/ghost-antler-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'night_trophy']
  }
}
