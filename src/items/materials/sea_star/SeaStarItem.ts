import { Item } from '../../Item.ts'

/**
 * A dried sea star collected from the sandy shores of the coastal rain forest.
 * Sea stars can regrow lost arms, and apothecaries prize that lingering
 * vitality: one star can stand in for rarer fungi when brewing stronger
 * healing potions.
 */
export class SeaStarItem extends Item {
  readonly id = 'sea_star'
  readonly name = 'sea_star'

  override get displayName(): string {
    return 'Sea Star'
  }

  override get iconUrl(): string {
    return new URL('./assets/sea-star-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'ingredient', 'brewing']
  }
}
