import { Item } from '../../Item.ts'

/**
 * Moth Dust - shimmering pale-blue scales shaken from a duskmoth's wings,
 * faintly glowing. A night trophy.
 */
export class MothDustItem extends Item {
  readonly id = 'moth_dust'
  readonly name = 'moth_dust'

  override get displayName(): string {
    return 'Moth Dust'
  }

  override get iconUrl(): string {
    return new URL('./assets/moth-dust-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'night_trophy']
  }
}
