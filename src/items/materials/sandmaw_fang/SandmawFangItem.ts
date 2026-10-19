import { Item } from '../../Item.ts'

/**
 * Sandmaw Fang - a curved amber-white fang from a sandmaw's ringed maw, taken
 * from the desert at night. A night trophy.
 */
export class SandmawFangItem extends Item {
  readonly id = 'sandmaw_fang'
  readonly name = 'sandmaw_fang'

  override get displayName(): string {
    return 'Sandmaw Fang'
  }

  override get iconUrl(): string {
    return new URL('./assets/sandmaw-fang-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'night_trophy']
  }
}
