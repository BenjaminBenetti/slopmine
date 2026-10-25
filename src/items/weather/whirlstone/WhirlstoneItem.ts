import { Item } from '../../Item.ts'

/**
 * Whirlstone - the polished spiral stone at the heart of a Dune Dervish,
 * still restless in the hand. Brewed with a herb into a Swiftness Potion.
 */
export class WhirlstoneItem extends Item {
  readonly id = 'whirlstone'
  readonly name = 'whirlstone'

  override get displayName(): string {
    return 'Whirlstone'
  }

  override get iconUrl(): string {
    return new URL('./assets/whirlstone-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'magic']
  }
}
