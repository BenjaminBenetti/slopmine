import { Item } from '../../Item.ts'

/**
 * Storm Glass - a sealed glass of camphor-clouded liquid whose crystals change
 * with the weather. Held in the selected toolbar slot, a HUD plaque reads the
 * weather where you stand and what is coming in the next few minutes
 * (weather/ui/StormGlassHud.ts). Crafted from glass, a copper bar and a herb.
 */
export class StormGlassItem extends Item {
  readonly id = 'storm_glass'
  readonly name = 'storm_glass'

  override get displayName(): string {
    return 'Storm Glass'
  }

  override get maxStackSize(): number {
    return 1
  }

  override get iconUrl(): string {
    return new URL('./assets/storm-glass-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['tool', 'magic']
  }
}
