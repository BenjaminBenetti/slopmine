import { BlockItem } from '../../BlockItem.ts'

/**
 * Soul lantern block item - a bone cage of green soul fire.
 */
export class SoulLanternBlockItem extends BlockItem {
  readonly id = 'soul_lantern_block'
  readonly name = 'soul_lantern_block'
  readonly blockName = 'soul_lantern'

  override get displayName(): string {
    return 'Soul Lantern'
  }
}
