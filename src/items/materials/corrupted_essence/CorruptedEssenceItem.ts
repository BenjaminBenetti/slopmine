import { Item } from '../../Item.ts'

/**
 * Corrupted essence item extracted from corrupted hell rock.
 * A dark, swirling essence imbued with otherworldly corruption.
 */
export class CorruptedEssenceItem extends Item {
  readonly id = 'corrupted_essence'
  readonly name = 'corrupted_essence'

  override get displayName(): string {
    return 'Corrupted Essence'
  }

  override get iconUrl(): string {
    return new URL('./assets/corrupted-essence-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'corruption']
  }
}
