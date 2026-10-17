import { Item } from '../../Item.ts'

/**
 * Ectoplasm - glowing residue left by slain wraiths. Brewing ingredient
 * (regeneration potion).
 */
export class EctoplasmItem extends Item {
  readonly id = 'ectoplasm'
  readonly name = 'ectoplasm'

  override get displayName(): string {
    return 'Ectoplasm'
  }

  override get iconUrl(): string {
    return new URL('./assets/ectoplasm-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'soul']
  }
}
