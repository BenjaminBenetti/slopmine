import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Cinder Core - the still-glowing heart of a slain Ashwalker: a lump of
 * black ash crust around a hot orange core. A night trophy; burns long as
 * forge fuel and brews fire resistance.
 */
export class CinderCoreItem extends Item {
  readonly id = 'cinder_core'
  readonly name = 'cinder_core'

  override get displayName(): string {
    return 'Cinder Core'
  }

  override get iconUrl(): string {
    return new URL('./assets/cinder-core-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'night_trophy', ItemTags.FUEL]
  }
}
