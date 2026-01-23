import { Item } from '../../Item.ts'

/**
 * Rope item crafted from hemp fiber.
 * A versatile crafting material.
 */
export class RopeItem extends Item {
  readonly id = 'rope'
  readonly name = 'rope'

  override get displayName(): string {
    return 'Rope'
  }

  override get iconUrl(): string {
    return new URL('./assets/rope-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'rope']
  }
}
