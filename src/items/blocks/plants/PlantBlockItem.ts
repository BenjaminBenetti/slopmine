import { BlockItem } from '../../BlockItem.ts'

/**
 * The block item of a wild plant or ground doodad (the Nature Update's
 * grasses, flowers, bushes, ...): `<block name>_block`, placing that block.
 * One class for the whole family - each plant differs only in its block name
 * and display name (see items/nature/registerNatureItems.ts).
 */
export class PlantBlockItem extends BlockItem {
  readonly id: string
  readonly name: string

  constructor(
    readonly blockName: string,
    private readonly label: string,
  ) {
    super()
    this.id = `${blockName}_block`
    this.name = this.id
  }

  override get displayName(): string {
    return this.label
  }
}
