import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * Berry seeds - plant them on farmland to grow a berry bush.
 */
export class BerrySeedsItem extends Item implements IPlantable {
  readonly id = 'berry_seeds'
  readonly name = 'berry_seeds'
  readonly plantsBlock = 'berry_bush_1'

  override get displayName(): string {
    return 'Berry Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/berry-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
