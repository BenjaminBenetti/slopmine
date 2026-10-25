import { Item } from '../../Item.ts'

/**
 * Stardust - glittering powder knocked from a fallen star (meteor showers drop
 * star fragments where they land). Four of it, glass and an iron bar make a
 * Star Lantern.
 */
export class StardustItem extends Item {
  readonly id = 'stardust'
  readonly name = 'stardust'

  override get displayName(): string {
    return 'Stardust'
  }

  override get iconUrl(): string {
    return new URL('./assets/stardust-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'magic']
  }
}
