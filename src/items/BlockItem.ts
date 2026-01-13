import { Item } from './Item.ts'
import { BlockIconGenerator } from '../renderer/BlockIconGenerator.ts'

/**
 * Base class for all block items.
 * Automatically generates isometric icons from block textures.
 */
export abstract class BlockItem extends Item {
  /**
   * The name of the block this item represents (e.g., "grass", "stone").
   * Used to look up the block in the registry for icon generation.
   */
  abstract readonly blockName: string

  /**
   * Get the icon URL for this block item.
   * Returns a generated isometric icon from the block's textures.
   */
  override get iconUrl(): string | undefined {
    return BlockIconGenerator.getInstance().getIcon(this.blockName)
  }
}
