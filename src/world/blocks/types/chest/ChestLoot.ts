import { BlockIds } from '../../BlockIds.ts'
import { CoalItem } from '../../../../items/ores/coal/CoalItem.ts'
import { IronOreItem } from '../../../../items/ores/iron/IronOreItem.ts'
import { CopperOreItem } from '../../../../items/ores/copper/CopperOreItem.ts'
import { GoldOreItem } from '../../../../items/ores/gold/GoldOreItem.ts'
import { DiamondItem } from '../../../../items/ores/diamond/DiamondItem.ts'
import { SulfurItem } from '../../../../items/ores/sulfur/SulfurItem.ts'
import type { ChestLootTable, LootStack } from '../../../loot/ChestLootRegistry.ts'

/**
 * Metadata bit 6: this chest's worldgen loot has been resolved (filled, or
 * decided to be empty). Set on player placement (a player chest never holds
 * worldgen loot) and on a worldgen chest's first E-interaction; because the
 * bit is block metadata it persists with the chunk, so a looted or resolved
 * chest can never re-roll its loot after save/load. Bits 0-2 are facing,
 * bit 3 is 3D rotation, bit 4 is vertical flip, bit 7 is
 * PERSISTENT_PLACED_METADATA_BIT (see BlockFacing.ts); bit 5 remains free.
 */
export const CHEST_LOOT_RESOLVED_METADATA_BIT = 0b0100_0000

/**
 * Charred mining camp cache (volcanic biome). Signature: a CHARRED_LOG within
 * 6 blocks - the camp's shelter posts sit 1-3 blocks from its chest, so 6 has
 * generous margin without reaching into neighboring player builds.
 * - 6-10 coal, 4-7 raw iron, 3-5 raw copper, 2-4 raw gold, 2-4 sulfur
 * - 30% chance of 1-2 diamonds
 */
export const charredCampLootTable: ChestLootTable = {
  id: 'charred-camp',
  signatureBlocks: [BlockIds.CHARRED_LOG],
  signatureRadius: 6,
  roll(roll) {
    const stacks: LootStack[] = [
      { item: new CoalItem(), count: 6 + Math.floor(roll(1) * 5) }, // 6-10
      { item: new IronOreItem(), count: 4 + Math.floor(roll(2) * 4) }, // 4-7
      { item: new CopperOreItem(), count: 3 + Math.floor(roll(3) * 3) }, // 3-5
      { item: new GoldOreItem(), count: 2 + Math.floor(roll(4) * 3) }, // 2-4
      { item: new SulfurItem(), count: 2 + Math.floor(roll(5) * 3) }, // 2-4
    ]
    if (roll(6) < 0.3) {
      stacks.push({ item: new DiamondItem(), count: 1 + Math.floor(roll(7) * 2) }) // 1-2
    }
    return stacks
  },
}
