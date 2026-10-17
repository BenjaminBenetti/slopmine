import { Item } from '../../Item.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import { showPlayerNotice } from '../../../ui/PlayerNotice.ts'

/** Max health each Infernal Heart adds (2 hearts). */
export const INFERNAL_HEART_BONUS = 4
/** Most max health Infernal Hearts can add (5 hearts eaten = 10 extra hearts). */
export const INFERNAL_HEART_BONUS_CAP = 20

/**
 * Infernal Heart - dropped by Hell guardians. Eating one permanently raises
 * max health by 4 (2 hearts), up to +20, and heals the added amount. Refused
 * (not consumed) once the bonus is capped.
 */
export class InfernalHeartItem extends Item implements IConsumable {
  readonly id = 'infernal_heart'
  readonly name = 'infernal_heart'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.6,
  }

  override get displayName(): string {
    return 'Infernal Heart'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/infernal-heart-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['consumable', 'relic']
  }

  canConsume(playerHealth: IPlayerHealth): boolean {
    if (playerHealth.maxHealthBonus >= INFERNAL_HEART_BONUS_CAP) {
      showPlayerNotice('Your heart can hold no more infernal fire')
      return false
    }
    return true
  }

  onConsume(playerHealth: IPlayerHealth): void {
    const bonus = playerHealth.maxHealthBonus
    const added = Math.min(INFERNAL_HEART_BONUS, INFERNAL_HEART_BONUS_CAP - bonus)
    if (added <= 0) return
    playerHealth.setMaxHealthBonus(bonus + added)
    playerHealth.heal(added)
    showPlayerNotice(`Max health +${added / 2} hearts`)
  }
}
