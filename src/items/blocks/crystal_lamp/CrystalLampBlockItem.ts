import { BlockItem } from '../../BlockItem.ts'

/**
 * Crystal Lamp block item (Crystal Abyss).
 */
export class CrystalLampBlockItem extends BlockItem {
  readonly id = 'crystal_lamp_block'
  readonly name = 'crystal_lamp_block'
  readonly blockName = 'crystal_lamp'

  override get displayName(): string {
    return 'Crystal Lamp'
  }
}
