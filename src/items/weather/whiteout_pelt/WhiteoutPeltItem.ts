import { Item } from '../../Item.ts'

/**
 * Whiteout Pelt - the thick white fur of a Whiteout Stalker, the blizzard's
 * hunter. A hide: tanned into leather armor like any other pelt.
 */
export class WhiteoutPeltItem extends Item {
  readonly id = 'whiteout_pelt'
  readonly name = 'whiteout_pelt'

  override get displayName(): string {
    return 'Whiteout Pelt'
  }

  override get iconUrl(): string {
    return new URL('./assets/whiteout-pelt-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'pelt', 'hide']
  }
}
