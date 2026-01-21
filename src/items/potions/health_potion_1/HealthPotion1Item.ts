import { Item } from '../../Item.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'

/**
 * Healing Potion I - the weakest tier of health potion.
 * Restores 10 health when consumed.
 */
export class HealthPotion1Item extends Item implements IConsumable {
  readonly id = 'health_potion_1'
  readonly name = 'health_potion_1'
  readonly potionTier = 1
  readonly healAmount = 10

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0, // Potions are quick to drink
  }

  override get displayName(): string {
    return 'Healing Potion I'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/health-potion-1-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['potion', 'consumable']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(this.healAmount)
  }
}
