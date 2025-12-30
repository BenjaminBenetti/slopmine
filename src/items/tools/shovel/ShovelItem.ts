import { ToolItem } from '../ToolItem.ts'

/**
 * Shovel tool item for player inventory.
 */
export class ShovelItem extends ToolItem {
  readonly id = 'shovel'
  readonly name = 'shovel'

  override get displayName(): string {
    return 'Shovel'
  }

  override get iconUrl(): string {
    return new URL('./assets/shovel-icon.webp', import.meta.url).href
  }
}
