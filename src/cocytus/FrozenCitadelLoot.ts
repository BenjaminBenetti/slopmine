import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { ChestLootTable, LootStack, LootRoll } from '../world/loot/ChestLootRegistry.ts'
import { createItemFromId, isItemRegistered } from '../persistence/ItemRegistry.ts'

/**
 * Frozen Citadel chest loot, one table per tier. The castle kit puts the
 * tier's signature block directly under each chest (`lootTierBlocks`):
 *   tier 0 glacial brick   - guard posts, alcoves near the gate
 *   tier 1 frozen magma    - guard rooms, cells, the great hall, cisterns
 *   tier 2 glacial ice     - the library, the warden's room, the spire
 *   tier 3 rime glyph      - the vaults deep under the lake
 * Radius 1 and rising priority: walls of glacial brick touch most chests,
 * but a chest's own (higher) tier block always wins. No glacial brick in any
 * table (it needs infernium tools to remove - a trap to build with). Items
 * owned by other streams are created by string id and skipped while
 * unregistered.
 */

type Add = (id: string, count: number) => void
type Range = (salt: number, min: number, max: number) => number

function table(id: string, signature: number, priority: number, fill: (add: Add, range: Range, roll: LootRoll) => void): ChestLootTable {
  return {
    id,
    signatureBlocks: [signature],
    signatureRadius: 1,
    priority,
    roll(roll: LootRoll): LootStack[] {
      const stacks: LootStack[] = []
      const add: Add = (itemId, count) => {
        if (count <= 0 || !isItemRegistered(itemId)) return
        const item = createItemFromId(itemId)
        if (item) stacks.push({ item, count })
      }
      const range: Range = (salt, min, max) => min + Math.floor(roll(salt) * (max - min + 1))
      fill(add, range, roll)
      return stacks
    },
  }
}

export const frozenCitadelLootTables: readonly ChestLootTable[] = [
  // Tier 0: what the gate guards keep
  table('frozen-citadel-t0', BlockIds.GLACIAL_BRICK, 10, (add, range, roll) => {
    add('iron_bar', range(1, 1, 3))
    if (roll(2) < 0.5) add('rime_crystal', range(3, 1, 2))
    if (roll(4) < 0.35) add('health_potion_1', 1)
    if (roll(5) < 0.4) add('frostbound_planks_block', range(6, 4, 8))
    else if (roll(7) < 0.5) add('polished_ice_block', range(8, 4, 10))
    if (roll(9) < 0.25) add('frost_lantern_block', range(10, 1, 2))
  }),
  // Tier 1: barracks and cells
  table('frozen-citadel-t1', BlockIds.FROZEN_MAGMA, 11, (add, range, roll) => {
    add('rime_crystal', range(1, 2, 4))
    add(roll(2) < 0.5 ? 'steel_bar' : 'iron_bar', range(3, 2, 4))
    if (roll(4) < 0.5) add('gold_bar', range(5, 1, 3))
    if (roll(6) < 0.5) add('health_potion_2', 1)
    if (roll(7) < 0.25) add('iceskin_potion', 1)
    if (roll(8) < 0.35) add('frost_lantern_block', range(9, 1, 3))
    if (roll(10) < 0.12) add('diamond', 1)
  }),
  // Tier 2: the warden's keys, the library's secrets, the spire's hoard
  table('frozen-citadel-t2', BlockIds.GLACIAL_ICE, 12, (add, range, roll) => {
    add('rime_crystal', range(1, 3, 6))
    add('gold_bar', range(2, 2, 5))
    if (roll(3) < 0.6) add('diamond', range(4, 1, 2))
    if (roll(5) < 0.25) add('infernium_ingot', 1)
    if (roll(6) < 0.5) add('iceskin_potion', 1)
    if (roll(7) < 0.5) add('health_potion_2', range(8, 1, 2))
    if (roll(9) < 0.2) add('strength_potion', 1)
    if (roll(10) < 0.4) add('steel_bar', range(11, 2, 4))
  }),
  // Tier 3: the Sovereign's treasury under the lake
  table('frozen-citadel-t3', BlockIds.RIME_GLYPH, 13, (add, range, roll) => {
    add('diamond', range(1, 2, 5))
    add('rime_crystal', range(2, 5, 10))
    add('gold_bar', range(3, 3, 7))
    if (roll(4) < 0.75) add('infernium_ingot', range(5, 1, 3))
    if (roll(6) < 0.6) add('health_potion_3', range(7, 1, 2))
    if (roll(8) < 0.5) add('regeneration_potion', 1)
    if (roll(9) < 0.5) add('strength_potion', 1)
    if (roll(10) < 0.6) add('iceskin_potion', range(11, 1, 2))
    if (roll(12) < 0.4) add('frost_lantern_block', range(13, 2, 4))
    if (roll(14) < 0.12) add('diamond_sword', 1)
  }),
]
