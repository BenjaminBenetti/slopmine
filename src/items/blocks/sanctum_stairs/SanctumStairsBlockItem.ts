import { BlockItem } from '../../BlockItem.ts'

/** Sanctum Stairs block item (Prism Sanctum). */
export class SanctumStairsBlockItem extends BlockItem {
  readonly id = 'sanctum_stairs_block'
  readonly name = 'sanctum_stairs_block'
  readonly blockName = 'sanctum_stairs'

  override get displayName(): string {
    return 'Sanctum Stairs'
  }
}
