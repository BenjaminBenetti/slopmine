import { Item } from '../../Item.ts'

/**
 * Wolf pelt dropped by wolves when killed.
 * A thick grey fur, useful for crafting.
 */
export class WolfPeltItem extends Item {
  readonly id = 'wolf_pelt'
  readonly name = 'wolf_pelt'

  override get displayName(): string {
    return 'Wolf Pelt'
  }

  override get iconUrl(): string {
    return new URL('./assets/wolf-pelt-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'pelt']
  }
}
