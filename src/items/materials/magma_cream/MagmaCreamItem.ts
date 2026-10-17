import { Item } from '../../Item.ts'

/**
 * Magma cream: the molten core of a magma slime. Brewed into fire resistance
 * potions and worked into hellbane gear.
 */
export class MagmaCreamItem extends Item {
  readonly id = 'magma_cream'
  readonly name = 'magma_cream'

  override get displayName(): string {
    return 'Magma Cream'
  }

  override get iconUrl(): string {
    return new URL('./assets/magma-cream-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material']
  }
}
