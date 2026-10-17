import { BlockItem } from '../../BlockItem.ts'

export class RootLatticeBlockItem extends BlockItem {
  readonly id = 'root_lattice_block'
  readonly name = 'root_lattice_block'
  readonly blockName = 'root_lattice'

  override get displayName(): string {
    return 'Root Lattice'
  }
}
