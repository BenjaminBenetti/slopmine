import { PickaxeItem } from './PickaxeItem.ts'
import type { IRecipe } from '../../IRecipe.ts'
import { OakLogBlockItem } from '../../blocks/oak_log/OakLogBlockItem.ts'

/**
 * Wood pickaxe tool item.
 */
export class WoodPickaxeItem extends PickaxeItem {
  readonly id = 'wood_pickaxe'
  readonly name = 'wood_pickaxe'

  override get displayName(): string {
    return 'Wood Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/wood-pickaxe-icon.webp', import.meta.url).href
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
