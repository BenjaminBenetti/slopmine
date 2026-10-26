import { Item } from '../../Item.ts'

/**
 * Glow Jelly - the soft glowing heart of a jellyfish. Brewed with a herb it
 * makes a Water Breathing potion; it is also compostable.
 */
export class GlowJellyItem extends Item {
  readonly id = 'glow_jelly'
  readonly name = 'glow_jelly'

  override get displayName(): string {
    return 'Glow Jelly'
  }

  override get iconUrl(): string {
    return new URL('./assets/glow-jelly-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'magic', 'compostable']
  }
}
