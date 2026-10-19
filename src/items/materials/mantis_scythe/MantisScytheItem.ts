import { Item } from '../../Item.ts'

/**
 * Mantis Scythe - a serrated pale-pink chitin blade taken from an orchid
 * mantis, the flower-disguised ambusher of jungle and rainforest nights.
 * A night trophy.
 */
export class MantisScytheItem extends Item {
  readonly id = 'mantis_scythe'
  readonly name = 'mantis_scythe'

  override get displayName(): string {
    return 'Mantis Scythe'
  }

  override get iconUrl(): string {
    return new URL('./assets/mantis-scythe-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'night_trophy']
  }
}
