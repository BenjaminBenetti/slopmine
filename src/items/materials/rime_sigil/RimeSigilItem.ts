import { Item } from '../../Item.ts'

/**
 * Rime sigil - the seal of the Rime Sovereign, dropped when the guardian of
 * the Frozen Citadel falls. Forged into hellbane boots at the Hellforge.
 */
export class RimeSigilItem extends Item {
  readonly id = 'rime_sigil'
  readonly name = 'rime_sigil'

  override get displayName(): string {
    return 'Rime Sigil'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/rime-sigil-icon.webp', import.meta.url).href
  }
}
