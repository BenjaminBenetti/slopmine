import { Item } from '../../Item.ts'
import type { IWeaponStats } from '../../interfaces/IWeaponStats.ts'
import { weaponProfileFor, type WeaponMaterial } from '../../../combat/WeaponProfiles.ts'

/**
 * Base class for all swords.
 *
 * Swords are weapons, not mining tools: they carry no toolStats (so they mine
 * like a bare hand) and instead carry weaponStats - the hardest, fastest
 * hits of their material (see src/combat/WeaponProfiles.ts).
 */
export abstract class SwordItem extends Item {
  /** Material tier - selects damage from the combat table */
  protected abstract readonly material: WeaponMaterial

  private stats: IWeaponStats | null = null

  override get maxStackSize(): number {
    return 1
  }

  /** Melee stats read by the combat system */
  get weaponStats(): IWeaponStats {
    if (!this.stats) {
      this.stats = weaponProfileFor('sword', this.material)
    }
    return this.stats
  }
}
