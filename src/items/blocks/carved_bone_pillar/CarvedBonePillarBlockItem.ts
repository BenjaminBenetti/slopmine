import { BlockItem } from '../../BlockItem.ts'

/**
 * Carved Bone Pillar block item (Catacombs).
 */
export class CarvedBonePillarBlockItem extends BlockItem {
  readonly id = 'carved_bone_pillar_block'
  readonly name = 'carved_bone_pillar_block'
  readonly blockName = 'carved_bone_pillar'

  override get displayName(): string {
    return 'Carved Bone Pillar'
  }
}
