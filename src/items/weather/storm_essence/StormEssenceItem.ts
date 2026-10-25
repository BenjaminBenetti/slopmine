import { Item } from '../../Item.ts'

/**
 * Storm Essence - a crackling scrap of thundercloud, left behind when a
 * Thunderhead is struck down in a thunderstorm. The heart of a Sky Bell.
 */
export class StormEssenceItem extends Item {
  readonly id = 'storm_essence'
  readonly name = 'storm_essence'

  override get displayName(): string {
    return 'Storm Essence'
  }

  override get iconUrl(): string {
    return new URL('./assets/storm-essence-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'magic']
  }
}
