import { Item } from '../../Item.ts'

/**
 * A ripe pumpkin: bake it into a pie, or cut it for seeds.
 */
export class PumpkinItem extends Item {
  readonly id = 'pumpkin'
  readonly name = 'pumpkin'

  override get displayName(): string {
    return 'Pumpkin'
  }

  override get iconUrl(): string {
    return new URL('./assets/pumpkin-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['plant', 'crop', 'ingredient']
  }
}
