import { Item } from '../../Item.ts'

/**
 * Komodo dragon scales item dropped when killing komodo dragons.
 * Can be used for crafting.
 */
export class KomodoScalesItem extends Item {
  readonly id = 'komodo_scales'
  readonly name = 'komodo_scales'

  override get displayName(): string {
    return 'Komodo Scales'
  }

  override get iconUrl(): string {
    return new URL('./assets/komodo-scales-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'scales']
  }
}
