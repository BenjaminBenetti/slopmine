import { Item } from '../../Item.ts'

/**
 * The Ember Sigil: dropped by the Pyre Tyrant, guardian of the Infernal
 * Bastion. Forged at the Hellforge into hellbane gear.
 */
export class EmberSigilItem extends Item {
  readonly id = 'ember_sigil'
  readonly name = 'ember_sigil'

  override get displayName(): string {
    return 'Ember Sigil'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/ember-sigil-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'sigil']
  }
}
