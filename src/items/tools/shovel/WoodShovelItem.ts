import { ShovelItem } from './ShovelItem.ts'
import type { IRecipe } from '../../IRecipe.ts'
import { OakLogBlockItem } from '../../blocks/oak_log/OakLogBlockItem.ts'

/**
 * Wood shovel tool item.
 */
export class WoodShovelItem extends ShovelItem {
  readonly id = 'wood_shovel'
  readonly name = 'wood_shovel'

  override get displayName(): string {
    return 'Wood Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-shovel-icon.webp', import.meta.url).href
  }

  override getRecipe(): IRecipe | null {
    return {
      output: this,
      ingredients: [
        [new OakLogBlockItem()],
      ],
    }
  }
}
