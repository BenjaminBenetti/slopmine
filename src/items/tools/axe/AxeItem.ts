import { ToolItem } from '../ToolItem.ts'

/**
 * Axe tool item for player inventory.
 */
export class AxeItem extends ToolItem {
  readonly id = 'axe'
  readonly name = 'axe'

  override get displayName(): string {
    return 'Axe'
  }

  override get iconUrl(): string {
    return new URL('./assets/axe-icon.webp', import.meta.url).href
  }
}
