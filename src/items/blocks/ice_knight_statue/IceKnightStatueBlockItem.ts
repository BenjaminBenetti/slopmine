import { BlockItem } from '../../BlockItem.ts'

/**
 * Ice Knight Statue block item.
 */
export class IceKnightStatueBlockItem extends BlockItem {
  readonly id = 'ice_knight_statue_block'
  readonly name = 'ice_knight_statue_block'
  readonly blockName = 'ice_knight_statue'

  override get displayName(): string {
    return 'Ice Knight Statue'
  }
}
