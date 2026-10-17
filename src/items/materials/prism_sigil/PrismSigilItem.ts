import { Item } from '../../Item.ts'

/**
 * Prism sigil - the Prism Warden's trophy, proof of conquering the Prism
 * Sanctum. Forged with prism shards into the hellbane pickaxe.
 */
export class PrismSigilItem extends Item {
  readonly id = 'prism_sigil'
  readonly name = 'prism_sigil'

  override get displayName(): string {
    return 'Prism Sigil'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/prism-sigil-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'sigil']
  }
}
