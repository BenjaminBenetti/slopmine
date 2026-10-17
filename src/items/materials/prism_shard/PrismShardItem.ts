import { Item } from '../../Item.ts'

/**
 * Prism shard - a glowing violet crystal shard from the Crystal Abyss (prism
 * crystal, prism clusters, shardlings, prism wisps). Strength potions,
 * crystal lamps and the hellbane pickaxe are made from it.
 */
export class PrismShardItem extends Item {
  readonly id = 'prism_shard'
  readonly name = 'prism_shard'

  override get displayName(): string {
    return 'Prism Shard'
  }

  override get iconUrl(): string {
    return new URL('./assets/prism-shard-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'crystal']
  }
}
