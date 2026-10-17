import { Item } from '../../Item.ts'

/**
 * Bone Sigil - dropped by the Bone King, guardian of the Catacombs. Forges
 * hellbane gear at the Hellforge.
 */
export class BoneSigilItem extends Item {
  readonly id = 'bone_sigil'
  readonly name = 'bone_sigil'

  override get displayName(): string {
    return 'Bone Sigil'
  }

  override get iconUrl(): string {
    return new URL('./assets/bone-sigil-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'sigil']
  }

  override get maxStackSize(): number {
    return 16
  }
}
