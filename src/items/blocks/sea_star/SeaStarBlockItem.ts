import { BlockItem } from '../../BlockItem.ts'

export class SeaStarBlockItem extends BlockItem {
  readonly id = 'sea_star_block'
  readonly name = 'sea_star_block'
  readonly blockName = 'sea_star'

  override get displayName(): string {
    return 'Sea Star'
  }

  // Keep the hand-drawn icon rather than the auto-rendered block preview
  override get iconUrl(): string {
    return new URL('./assets/sea-star-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'ingredient', 'brewing']
  }
}
