import { Item } from '../Item.ts'
import type { IConsumable, IConsumableStats } from '../interfaces/IConsumable.ts'
import type { IPlayerHealth } from '../../player/PlayerHealth.ts'
import { playerEffects } from '../../player/effects/StatusEffects.ts'
import type { StatusEffectId } from '../../player/effects/StatusEffects.ts'

/**
 * A potion that grants a timed status effect when drunk (hold right-click).
 * What the effect does lives with the effect behaviours, not here.
 */
export abstract class EffectPotionItem extends Item implements IConsumable {
  /** Status effect granted (see StatusEffectIds). */
  abstract readonly effectId: StatusEffectId
  /** Effect duration in seconds. */
  abstract readonly durationSeconds: number
  /** Effect level (1 = I). */
  readonly effectLevel: number = 1

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0, // Potions are quick to drink
  }

  override get maxStackSize(): number {
    return 16
  }

  override get tags(): ReadonlyArray<string> {
    return ['potion', 'consumable']
  }

  onConsume(_playerHealth: IPlayerHealth): void {
    playerEffects.apply(this.effectId, this.durationSeconds, this.effectLevel)
  }
}
