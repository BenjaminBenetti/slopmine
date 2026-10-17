import { Item } from '../../Item.ts'

/**
 * Sigil Compass - an ember-gold compass whose sigil-etched face stirs only in
 * Hell. Held in the selected toolbar slot, a HUD needle points to the nearest
 * dungeon of the Hell biome the player is in (src/dungeons/SigilCompass.ts).
 * Crafted by hand from gold, iron and corrupted essence.
 */
export class SigilCompassItem extends Item {
  readonly id = 'sigil_compass'
  readonly name = 'sigil_compass'

  override get displayName(): string {
    return 'Sigil Compass'
  }

  override get maxStackSize(): number {
    return 1
  }

  override get iconUrl(): string {
    return new URL('./assets/sigil-compass-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['magic']
  }
}
