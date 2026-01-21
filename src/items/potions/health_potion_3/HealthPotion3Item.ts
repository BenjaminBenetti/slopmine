import { Item } from '../../Item.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'

/**
 * Healing Potion III - the strongest tier of health potion.
 * Restores 40 health when consumed (full HP).
 */
export class HealthPotion3Item extends Item implements IConsumable {
  readonly id = 'health_potion_3'
  readonly name = 'health_potion_3'
  readonly potionTier = 3
  readonly healAmount = 40

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0, // Potions are quick to drink
  }

  override get displayName(): string {
    return 'Healing Potion III'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/health-potion-3-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['potion', 'consumable']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(this.healAmount)
  }
}
