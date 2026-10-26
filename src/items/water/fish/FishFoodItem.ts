import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/** A fish dish: raw from a caught fish, or cooked in the forge. */
interface FishFood {
  readonly displayName: string
  readonly heal: number
  readonly cooked: boolean
  readonly iconUrl: string
}

// Literal URLs: the bundler only finds assets named in full
const FISH_FOODS: Record<string, FishFood> = {
  raw_trout: { displayName: 'Raw Trout', heal: 2, cooked: false, iconUrl: new URL('./assets/raw-trout-icon.webp', import.meta.url).href },
  cooked_trout: { displayName: 'Cooked Trout', heal: 6, cooked: true, iconUrl: new URL('./assets/cooked-trout-icon.webp', import.meta.url).href },
  raw_salmon: { displayName: 'Raw Salmon', heal: 2, cooked: false, iconUrl: new URL('./assets/raw-salmon-icon.webp', import.meta.url).href },
  cooked_salmon: { displayName: 'Cooked Salmon', heal: 7, cooked: true, iconUrl: new URL('./assets/cooked-salmon-icon.webp', import.meta.url).href },
  raw_catfish: { displayName: 'Raw Catfish', heal: 2, cooked: false, iconUrl: new URL('./assets/raw-catfish-icon.webp', import.meta.url).href },
  cooked_catfish: { displayName: 'Cooked Catfish', heal: 6, cooked: true, iconUrl: new URL('./assets/cooked-catfish-icon.webp', import.meta.url).href },
  raw_cod: { displayName: 'Raw Cod', heal: 2, cooked: false, iconUrl: new URL('./assets/raw-cod-icon.webp', import.meta.url).href },
  cooked_cod: { displayName: 'Cooked Cod', heal: 6, cooked: true, iconUrl: new URL('./assets/cooked-cod-icon.webp', import.meta.url).href },
  raw_reef_fish: { displayName: 'Raw Reef Fish', heal: 1, cooked: false, iconUrl: new URL('./assets/raw-reef-fish-icon.webp', import.meta.url).href },
  cooked_reef_fish: { displayName: 'Cooked Reef Fish', heal: 4, cooked: true, iconUrl: new URL('./assets/cooked-reef-fish-icon.webp', import.meta.url).href },
}

/** Every fish dish's item id, raw and cooked. */
export const FISH_FOOD_IDS: readonly string[] = Object.keys(FISH_FOODS)

/** The fish that cook into each other: [raw id, cooked id]. */
export const FISH_COOKING: ReadonlyArray<readonly [string, string]> = FISH_FOOD_IDS
  .filter((id) => id.startsWith('raw_'))
  .map((id) => [id, id.replace('raw_', 'cooked_')] as const)

/**
 * Fish to eat: raw (a little health, from fish the player caught) or
 * cooked in the forge (a good meal). One class for every species' dish.
 */
export class FishFoodItem extends Item implements IConsumable {
  readonly id: string
  readonly name: string
  private readonly food: FishFood

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.6,
  }

  constructor(id: string) {
    super()
    const food = FISH_FOODS[id]
    if (!food) throw new Error(`Unknown fish dish: ${id}`)
    this.id = id
    this.name = id
    this.food = food
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(this.food.heal)
  }

  override get displayName(): string {
    return this.food.displayName
  }

  override get iconUrl(): string {
    return this.food.iconUrl
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'fish', this.food.cooked ? 'cooked' : 'raw']
  }
}
