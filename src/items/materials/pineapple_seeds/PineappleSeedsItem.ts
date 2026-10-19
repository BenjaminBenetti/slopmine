import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * A pineapple crown - plant it on farmland to grow a pineapple plant.
 */
export class PineappleSeedsItem extends Item implements IPlantable {
  readonly id = 'pineapple_seeds'
  readonly name = 'pineapple_seeds'
  readonly plantsBlock = 'pineapple_plant_1'

  override get displayName(): string {
    return 'Pineapple Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/pineapple-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
