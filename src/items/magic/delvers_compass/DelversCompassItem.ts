import { Item } from '../../Item.ts'

/**
 * Delver's Compass - a brass compass with a rune for a needle. Held in the
 * selected toolbar slot underground, a HUD needle points to the nearest
 * point of interest you haven't discovered yet (src/pois/DelversCompass.ts).
 * Crafted from rune shards, an iron bar and a celestite shard, or found on
 * explorers who never came back.
 */
export class DelversCompassItem extends Item {
  readonly id = 'delvers_compass'
  readonly name = 'delvers_compass'

  override get displayName(): string {
    return "Delver's Compass"
  }

  override get maxStackSize(): number {
    return 1
  }

  override get iconUrl(): string {
    return new URL('./assets/delvers-compass-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['magic']
  }
}
