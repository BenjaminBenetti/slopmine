import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * Tomato seeds - plant them on farmland.
 */
export class TomatoSeedsItem extends Item implements IPlantable {
  readonly id = 'tomato_seeds'
  readonly name = 'tomato_seeds'
  readonly plantsBlock = 'tomato_1'

  override get displayName(): string {
    return 'Tomato Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/tomato-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
