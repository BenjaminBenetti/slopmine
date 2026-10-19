import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * Prickly pear seeds - plant them on farmland to grow a prickly pear cactus.
 */
export class PricklyPearSeedsItem extends Item implements IPlantable {
  readonly id = 'prickly_pear_seeds'
  readonly name = 'prickly_pear_seeds'
  readonly plantsBlock = 'prickly_pear_1'

  override get displayName(): string {
    return 'Prickly Pear Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/prickly-pear-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
