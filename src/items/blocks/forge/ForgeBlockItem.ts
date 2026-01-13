import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Forge block item for player inventory.
 * Can be placed to create a forge for smelting ores.
 */
export class ForgeBlockItem extends BlockItem {
  readonly id = 'forge_block'
  readonly name = 'forge_block'
  readonly blockName = 'forge'

  override get displayName(): string {
    return 'Forge'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
