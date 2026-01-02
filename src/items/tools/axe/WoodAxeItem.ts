import { AxeItem } from './AxeItem.ts'
import type { IRecipe } from '../../IRecipe.ts'
import { OakLogBlockItem } from '../../blocks/oak_log/OakLogBlockItem.ts'

/**
 * Wood axe tool item.
 */
export class WoodAxeItem extends AxeItem {
  readonly id = 'wood_axe'
  readonly name = 'wood_axe'

  override get displayName(): string {
    return 'Wood Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-axe-icon.webp', import.meta.url).href
  }

  override getRecipe(): IRecipe | null {
    return {
      output: this,
      ingredients: [
        [new OakLogBlockItem()],
        [new OakLogBlockItem()],
      ],
    }
  }
}
