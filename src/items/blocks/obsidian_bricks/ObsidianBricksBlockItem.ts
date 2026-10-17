import { BlockItem } from '../../BlockItem.ts'

/**
 * Obsidian Bricks block item (Infernal Bastion).
 */
export class ObsidianBricksBlockItem extends BlockItem {
  readonly id = 'obsidian_bricks_block'
  readonly name = 'obsidian_bricks_block'
  readonly blockName = 'obsidian_bricks'

  override get displayName(): string {
    return 'Obsidian Bricks'
  }
}
