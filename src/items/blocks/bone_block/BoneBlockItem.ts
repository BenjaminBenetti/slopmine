import { BlockItem } from '../../BlockItem.ts'

/**
 * Bone block item: 4 bones packed into a building block (and back).
 */
export class BoneBlockItem extends BlockItem {
  readonly id = 'bone_block'
  readonly name = 'bone_block'
  readonly blockName = 'bone'

  override get displayName(): string {
    return 'Bone Block'
  }
}
