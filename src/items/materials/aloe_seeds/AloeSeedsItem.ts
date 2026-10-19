import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * An aloe pup - plant it on farmland to grow an aloe.
 */
export class AloeSeedsItem extends Item implements IPlantable {
  readonly id = 'aloe_seeds'
  readonly name = 'aloe_seeds'
  readonly plantsBlock = 'aloe_1'

  override get displayName(): string {
    return 'Aloe Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/aloe-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
