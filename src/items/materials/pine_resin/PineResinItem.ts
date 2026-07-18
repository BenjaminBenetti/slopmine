import { Item } from '../../Item.ts'

/**
 * Pine resin harvested from felled pine logs (bonus drop).
 * A sticky, flammable amber sap used to craft resin torches,
 * and burnable as low-grade forge fuel.
 */
export class PineResinItem extends Item {
  readonly id = 'pine_resin'
  readonly name = 'pine_resin'

  override get displayName(): string {
    return 'Pine Resin'
  }

  override get iconUrl(): string {
    return new URL('./assets/pine-resin-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'resin']
  }
}
