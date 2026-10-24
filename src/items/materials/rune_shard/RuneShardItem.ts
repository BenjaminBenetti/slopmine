import { Item } from '../../Item.ts'

/**
 * Rune shard - a sliver of runestone that still glows, chipped from the
 * standing stones and vaults of the lost civilisation under the overworld.
 * Crafts the Delver's Compass, runestone blocks and rune lamps.
 */
export class RuneShardItem extends Item {
  readonly id = 'rune_shard'
  readonly name = 'rune_shard'

  override get displayName(): string {
    return 'Rune Shard'
  }

  override get iconUrl(): string {
    return new URL('./assets/rune-shard-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'magic']
  }
}
