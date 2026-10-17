import { BlockItem } from '../../BlockItem.ts'

/**
 * Soul bloom block item - a glowing ghost flower, replantable on bone ash.
 */
export class SoulBloomBlockItem extends BlockItem {
  readonly id = 'soul_bloom_block'
  readonly name = 'soul_bloom_block'
  readonly blockName = 'soul_bloom'

  override get displayName(): string {
    return 'Soul Bloom'
  }
}
