import { Item } from '../../Item.ts'

/**
 * Hell Bug Wing item dropped by Hell Bugs when killed.
 * A chitinous wing from the Hell biome's flying cockroach creatures.
 */
export class HellBugWingItem extends Item {
  readonly id = 'hell_bug_wing'
  readonly name = 'hell_bug_wing'

  override get displayName(): string {
    return 'Hell Bug Wing'
  }

  override get iconUrl(): string {
    return new URL('./assets/hell-bug-wing-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'insect', 'hell']
  }
}
