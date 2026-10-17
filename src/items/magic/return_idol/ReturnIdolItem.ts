import { Item } from '../../Item.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import { activateReturnIdol, canUseReturnIdol, RETURN_IDOL_CHANNEL_SECONDS } from './ReturnIdolHooks.ts'

/**
 * Return Idol - an obsidian idol bound to the player's spawn (bed, or world
 * spawn). Hold right-click to channel it for 3 s, then it carries the player
 * home. Reusable (never consumed), 2 minute cooldown; taking damage breaks
 * the channel. Crafted by hand from gold, corrupted essence and obsidian, so
 * it becomes available after a first trip into Hell.
 */
export class ReturnIdolItem extends Item implements IConsumable {
  readonly id = 'return_idol'
  readonly name = 'return_idol'
  readonly consumedOnUse = false

  readonly consumableStats: IConsumableStats = {
    consumeTime: RETURN_IDOL_CHANNEL_SECONDS,
  }

  override get displayName(): string {
    return 'Return Idol'
  }

  override get maxStackSize(): number {
    return 1
  }

  override get iconUrl(): string {
    return new URL('./assets/return-idol-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['magic']
  }

  canContinueUse(): boolean {
    return canUseReturnIdol()
  }

  onConsume(_playerHealth: IPlayerHealth): void {
    activateReturnIdol()
  }
}
