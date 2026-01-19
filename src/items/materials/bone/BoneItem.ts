import { Item } from '../../Item.ts'

/**
 * Bone item dropped by skeletons when killed.
 * A remnant of the undead, useful for crafting.
 */
export class BoneItem extends Item {
  readonly id = 'bone'
  readonly name = 'bone'

  override get displayName(): string {
    return 'Bone'
  }

  override get iconUrl(): string {
    return new URL('./assets/bone-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'bone']
  }
}
