import { Item } from '../../Item.ts'

/**
 * Wisp Light - a cold green flame caught from a Marsh Wisp in the swamp's
 * glowing mist. Brewed with a herb, it sharpens the eyes in the dark (ember
 * sight).
 */
export class WispLightItem extends Item {
  readonly id = 'wisp_light'
  readonly name = 'wisp_light'

  override get displayName(): string {
    return 'Wisp Light'
  }

  override get iconUrl(): string {
    return new URL('./assets/wisp-light-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'magic']
  }
}
