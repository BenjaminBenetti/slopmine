import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * Blueberry seeds - plant them on farmland to grow a blueberry bush.
 */
export class BlueberrySeedsItem extends Item implements IPlantable {
  readonly id = 'blueberry_seeds'
  readonly name = 'blueberry_seeds'
  readonly plantsBlock = 'blueberry_bush_1'

  override get displayName(): string {
    return 'Blueberry Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/blueberry-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
