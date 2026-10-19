import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * Strawberry seeds - plant them on farmland.
 */
export class StrawberrySeedsItem extends Item implements IPlantable {
  readonly id = 'strawberry_seeds'
  readonly name = 'strawberry_seeds'
  readonly plantsBlock = 'strawberry_1'

  override get displayName(): string {
    return 'Strawberry Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/strawberry-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
