import { Item } from '../../Item.ts'

/**
 * Witchstraw - a bundle of dark, faintly glowing straw pulled from a slain
 * Stillwatcher, still tied with its twine. A night trophy.
 */
export class WitchstrawItem extends Item {
  readonly id = 'witchstraw'
  readonly name = 'witchstraw'

  override get displayName(): string {
    return 'Witchstraw'
  }

  override get iconUrl(): string {
    return new URL('./assets/witchstraw-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'night_trophy']
  }
}
