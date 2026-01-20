import { Item } from '../../Item.ts'

/**
 * Ember Roach Wing item dropped by Ember Roaches when killed.
 * A chitinous wing from the Hell biome's flying cockroach creatures.
 */
export class EmberRoachWingItem extends Item {
  readonly id = 'ember_roach_wing'
  readonly name = 'ember_roach_wing'

  override get displayName(): string {
    return 'Ember Roach Wing'
  }

  override get iconUrl(): string {
    return new URL('./assets/ember-roach-wing-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'insect', 'hell']
  }
}
