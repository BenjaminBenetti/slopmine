import { Item } from '../../Item.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'

/**
 * Healing Potion II - the medium tier of health potion.
 * Restores 20 health when consumed (half max HP).
 */
export class HealthPotion2Item extends Item implements IConsumable {
  readonly id = 'health_potion_2'
  readonly name = 'health_potion_2'
  readonly potionTier = 2
  readonly healAmount = 20

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0, // Potions are quick to drink
  }

  override get displayName(): string {
    return 'Healing Potion II'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/health-potion-2-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['potion', 'consumable']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(this.healAmount)
  }
}
