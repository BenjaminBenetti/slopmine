import { Item } from '../../Item.ts'

/**
 * Fulgurite - a branching tube of sand fused to glass where lightning struck
 * a beach or a dune (the fulgurite block drops it). Rings a Sky Bell into
 * being, and melts back into glass in a forge.
 */
export class FulguriteItem extends Item {
  readonly id = 'fulgurite'
  readonly name = 'fulgurite'

  override get displayName(): string {
    return 'Fulgurite'
  }

  override get iconUrl(): string {
    return new URL('./assets/fulgurite-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material']
  }
}
