import { Item } from '../../Item.ts'

/**
 * Bear pelt dropped by bears when killed.
 * A heavy brown fur, prized for crafting.
 */
export class BearPeltItem extends Item {
  readonly id = 'bear_pelt'
  readonly name = 'bear_pelt'

  override get displayName(): string {
    return 'Bear Pelt'
  }

  override get iconUrl(): string {
    return new URL('./assets/bear-pelt-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'pelt']
  }
}
