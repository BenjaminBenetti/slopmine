import { Item } from '../../Item.ts'

export class GroundWheatItem extends Item {
  readonly id = 'ground_wheat'
  readonly name = 'ground_wheat'

  override get displayName(): string {
    return 'Ground Wheat'
  }

  override get iconUrl(): string {
    return new URL('./assets/ground-wheat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'grain', 'ingredient']
  }
}
