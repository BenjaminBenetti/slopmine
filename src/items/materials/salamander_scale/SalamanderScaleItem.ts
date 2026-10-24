import { Item } from '../../Item.ts'

/**
 * Salamander scale - a glossy black scale still glowing at its edges, shed
 * by the ember salamanders of the magma chambers.
 */
export class SalamanderScaleItem extends Item {
  readonly id = 'salamander_scale'
  readonly name = 'salamander_scale'

  override get displayName(): string {
    return 'Salamander Scale'
  }

  override get iconUrl(): string {
    return new URL('./assets/salamander-scale-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'fire']
  }
}
