import { Item } from '../../Item.ts'

/**
 * Alligator leather item dropped when killing alligators.
 * Can be used for crafting.
 */
export class AlligatorLeatherItem extends Item {
  readonly id = 'alligator_leather'
  readonly name = 'alligator_leather'

  override get displayName(): string {
    return 'Alligator Leather'
  }

  override get iconUrl(): string {
    return new URL('./assets/alligator-leather-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'leather']
  }
}
