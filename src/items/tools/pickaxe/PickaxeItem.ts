import { ToolItem } from '../ToolItem.ts'

/**
 * Pickaxe tool item for player inventory.
 */
export class PickaxeItem extends ToolItem {
  readonly id = 'pickaxe'
  readonly name = 'pickaxe'

  override get displayName(): string {
    return 'Pickaxe'
  }

  override get iconUrl(): string {
    return new URL('./assets/pickaxe-icon.webp', import.meta.url).href
  }
}
