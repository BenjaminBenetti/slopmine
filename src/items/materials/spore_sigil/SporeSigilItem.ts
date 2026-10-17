import { Item } from '../../Item.ts'

/**
 * Spore sigil - the Sporemother's seal, dropped when the Sporeheart Hive's
 * guardian falls. Forged with glowcaps into hellbane leggings and shovel.
 */
export class SporeSigilItem extends Item {
  readonly id = 'spore_sigil'
  readonly name = 'spore_sigil'

  override get displayName(): string {
    return 'Spore Sigil'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/spore-sigil-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'sigil']
  }
}
