import { ArmorItem } from './ArmorItem.ts'
import { ARMOR_TIERS, armorItemId, type ArmorSlot, type ArmorTierId } from './ArmorTiers.ts'
import { ARMOR_ICON_URLS } from './ArmorIcons.ts'

/**
 * One armor piece of a tier (leather ... hellbane), e.g. `iron_helmet`.
 * All 28 pieces are data-driven from ARMOR_TIERS.
 */
export class TieredArmorItem extends ArmorItem {
  readonly id: string
  readonly name: string
  readonly armorSlot: ArmorSlot
  readonly armorPoints: number
  readonly armorTier: number
  readonly armorSetId: ArmorTierId

  constructor(tier: ArmorTierId, slot: ArmorSlot) {
    super()
    const info = ARMOR_TIERS[tier]
    this.id = armorItemId(tier, slot)
    this.name = this.id
    this.armorSlot = slot
    this.armorPoints = info.points[slot]
    this.armorTier = info.tier
    this.armorSetId = tier
  }

  override get displayName(): string {
    return ARMOR_TIERS[this.armorSetId].names[this.armorSlot]
  }

  override get iconUrl(): string | undefined {
    return ARMOR_ICON_URLS[this.id]
  }
}
