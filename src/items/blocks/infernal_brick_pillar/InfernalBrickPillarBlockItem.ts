import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Brick Pillar block item.
 */
export class InfernalBrickPillarBlockItem extends BlockItem {
  readonly id = 'infernal_brick_pillar_block'
  readonly name = 'infernal_brick_pillar_block'
  readonly blockName = 'infernal_brick_pillar'

  override get displayName(): string {
    return 'Infernal Brick Pillar'
  }
}
