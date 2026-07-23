import { BlockItem } from '../../BlockItem.ts'

/**
 * Obsidian block item for player inventory.
 */
export class ObsidianBlockItem extends BlockItem {
  readonly id = 'obsidian_block'
  readonly name = 'obsidian_block'
  readonly blockName = 'obsidian'

  override get displayName(): string {
    return 'Obsidian'
  }
}
