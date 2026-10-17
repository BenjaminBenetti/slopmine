import { BlockItem } from '../../BlockItem.ts'

/** Sanctum Pillar block item (Prism Sanctum). */
export class SanctumPillarBlockItem extends BlockItem {
  readonly id = 'sanctum_pillar_block'
  readonly name = 'sanctum_pillar_block'
  readonly blockName = 'sanctum_pillar'

  override get displayName(): string {
    return 'Sanctum Pillar'
  }
}
