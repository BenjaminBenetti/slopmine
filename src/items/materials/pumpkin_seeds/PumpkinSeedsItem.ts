import { Item } from '../../Item.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * Pumpkin seeds - plant them on farmland.
 */
export class PumpkinSeedsItem extends Item implements IPlantable {
  readonly id = 'pumpkin_seeds'
  readonly name = 'pumpkin_seeds'
  readonly plantsBlock = 'pumpkin_1'

  override get displayName(): string {
    return 'Pumpkin Seeds'
  }

  override get iconUrl(): string {
    return new URL('./assets/pumpkin-seeds-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['seeds', 'plant']
  }
}
