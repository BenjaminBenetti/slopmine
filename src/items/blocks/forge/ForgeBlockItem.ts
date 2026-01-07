import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Forge block item for player inventory.
 * Can be placed to create a forge for smelting ores.
 */
export class ForgeBlockItem extends Item {
  readonly id = 'forge_block'
  readonly name = 'forge_block'

  override get displayName(): string {
    return 'Forge'
  }

  override get iconUrl(): string {
    return new URL('./assets/forge-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
