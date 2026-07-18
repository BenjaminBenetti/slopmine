import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Pine needle tea brewed from pine needles at the apothecary workbench.
 * A mild restorative drink - cheaper than herb potions but weaker.
 */
export class PineNeedleTeaItem extends Item implements IConsumable {
  readonly id = 'pine_needle_tea'
  readonly name = 'pine_needle_tea'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.5, // Quick to drink, slower than a potion gulp
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(4)
  }

  override get displayName(): string {
    return 'Pine Needle Tea'
  }

  override get maxStackSize(): number {
    return 16
  }

  override get iconUrl(): string {
    return new URL('./assets/pine-needle-tea-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'drink', 'brewed']
  }
}
