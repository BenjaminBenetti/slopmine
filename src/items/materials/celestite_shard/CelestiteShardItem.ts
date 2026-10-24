import { Item } from '../../Item.ts'

/**
 * Celestite shard - a sky-blue crystal from the crystal geodes (clusters,
 * geode crawlers). Crafts celestite lamps and blocks.
 */
export class CelestiteShardItem extends Item {
  readonly id = 'celestite_shard'
  readonly name = 'celestite_shard'

  override get displayName(): string {
    return 'Celestite Shard'
  }

  override get iconUrl(): string {
    return new URL('./assets/celestite-shard-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'crystal']
  }
}
