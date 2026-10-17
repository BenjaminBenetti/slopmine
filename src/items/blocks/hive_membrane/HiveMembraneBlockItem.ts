import { BlockItem } from '../../BlockItem.ts'

export class HiveMembraneBlockItem extends BlockItem {
  readonly id = 'hive_membrane_block'
  readonly name = 'hive_membrane_block'
  readonly blockName = 'hive_membrane'

  override get displayName(): string {
    return 'Hive Membrane'
  }
}
