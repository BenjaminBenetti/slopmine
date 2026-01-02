import { PickaxeItem } from './PickaxeItem.ts'
import type { IRecipe } from '../../IRecipe.ts'
import { StoneBlockItem } from '../../blocks/stone/StoneBlockItem.ts'

/**
 * Iron pickaxe tool item.
 */
export class IronPickaxeItem extends PickaxeItem {
  readonly id = 'iron_pickaxe'
  readonly name = 'iron_pickaxe'

  override get displayName(): string {
    return 'Iron Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-pickaxe-icon.webp', import.meta.url).href
  }

  override getRecipe(): IRecipe | null {
    return {
      output: this,
      ingredients: [
        [new StoneBlockItem()],
        [new StoneBlockItem()],
        [new StoneBlockItem()],
      ],
    }
  }
}
