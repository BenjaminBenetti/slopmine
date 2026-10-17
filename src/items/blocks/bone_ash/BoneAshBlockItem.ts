import { BlockItem } from '../../BlockItem.ts'

/**
 * Bone ash block item - the pale soil of the Ossuary.
 */
export class BoneAshBlockItem extends BlockItem {
  readonly id = 'bone_ash_block'
  readonly name = 'bone_ash_block'
  readonly blockName = 'bone_ash'

  override get displayName(): string {
    return 'Bone Ash'
  }
}
