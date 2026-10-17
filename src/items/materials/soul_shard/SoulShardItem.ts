import { Item } from '../../Item.ts'

/**
 * Soul shard - a sliver of crystallised soul matter mined from Ossuary soul veins.
 * Used for hellbane gear (helmet, axe), soul torches and soul lanterns.
 */
export class SoulShardItem extends Item {
  readonly id = 'soul_shard'
  readonly name = 'soul_shard'

  override get displayName(): string {
    return 'Soul Shard'
  }

  override get iconUrl(): string {
    return new URL('./assets/soul-shard-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'soul']
  }
}
