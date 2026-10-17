import { BlockItem } from '../../BlockItem.ts'

/**
 * Weapon Rack block item (Infernal Bastion).
 */
export class WeaponRackBlockItem extends BlockItem {
  readonly id = 'weapon_rack_block'
  readonly name = 'weapon_rack_block'
  readonly blockName = 'weapon_rack'

  override get displayName(): string {
    return 'Weapon Rack'
  }
}
