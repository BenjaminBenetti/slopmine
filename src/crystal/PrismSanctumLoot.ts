import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { ChestLootTable, LootStack } from '../world/loot/ChestLootRegistry.ts'
import { createItemFromId } from '../persistence/ItemRegistry.ts'

/** Push `count` of an item by id; items of streams not merged yet are skipped. */
function addById(stacks: LootStack[], id: string, count: number): void {
  if (count <= 0) return
  const item = createItemFromId(id)
  if (item) stacks.push({ item, count })
}

/**
 * Prism Sanctum chest tiers. The kit (PrismSanctumKit, `lootTierBlocks`)
 * puts a signature block directly under every chest; each table scans
 * radius 1 and the deeper tier outranks the shallower one. The modules keep
 * mirror panels and inlaid tiles out of reach of lower-tier chests, so a
 * chest only ever sees its own tier's signature (plus sanctum brick walls).
 * Rolls are deterministic per chest position.
 */

/**
 * Tier 1 - cells, quarters, the scriptorium, hub halls (sanctum brick under
 * the chest; also catches any sanctum chest next to a wall).
 */
export const prismSanctumTier1LootTable: ChestLootTable = {
  id: 'prism-sanctum-t1',
  signatureBlocks: [BlockIds.SANCTUM_BRICK],
  signatureRadius: 1,
  priority: 11,
  roll(roll) {
    const stacks: LootStack[] = []
    addById(stacks, 'prism_shard', 2 + Math.floor(roll(1) * 4))
    addById(stacks, 'gold_bar', 1 + Math.floor(roll(2) * 3))
    if (roll(3) < 0.5) addById(stacks, 'health_potion_1', 1 + Math.floor(roll(4) * 2))
    if (roll(5) < 0.3) addById(stacks, 'iron_bar', 2 + Math.floor(roll(6) * 4))
    if (roll(7) < 0.25) addById(stacks, 'crystal_lamp_block', 1 + Math.floor(roll(8) * 2))
    if (roll(9) < 0.2) addById(stacks, 'diamond', 1)
    return stacks
  },
}

/** Tier 2 - reliquaries, the observatory, deep halls (mirror panel under the chest). */
export const prismSanctumTier2LootTable: ChestLootTable = {
  id: 'prism-sanctum-t2',
  signatureBlocks: [BlockIds.MIRROR_PANEL],
  signatureRadius: 1,
  priority: 12,
  roll(roll) {
    const stacks: LootStack[] = []
    addById(stacks, 'prism_shard', 5 + Math.floor(roll(1) * 6))
    addById(stacks, 'diamond', 1 + Math.floor(roll(2) * 3))
    addById(stacks, 'gold_bar', 2 + Math.floor(roll(3) * 4))
    if (roll(4) < 0.4) addById(stacks, 'infernium_ingot', 1 + Math.floor(roll(5) * 2))
    if (roll(6) < 0.5) addById(stacks, 'health_potion_2', 1 + Math.floor(roll(7) * 2))
    if (roll(8) < 0.3) addById(stacks, 'strength_potion', 1)
    if (roll(9) < 0.35) addById(stacks, 'crystal_lamp_block', 2 + Math.floor(roll(10) * 3))
    if (roll(11) < 0.25) addById(stacks, 'prism_lantern_block', 1 + Math.floor(roll(12) * 2))
    return stacks
  },
}

/**
 * Tier 3 - the grand reliquary and the deepest vaults (inlaid sanctum tile
 * under the chest, lens apparatus beside it): the sanctum's treasure.
 */
export const prismSanctumTier3LootTable: ChestLootTable = {
  id: 'prism-sanctum-t3',
  signatureBlocks: [BlockIds.INLAID_SANCTUM_TILE],
  signatureRadius: 1,
  priority: 13,
  roll(roll) {
    const stacks: LootStack[] = []
    addById(stacks, 'prism_shard', 10 + Math.floor(roll(1) * 9))
    addById(stacks, 'diamond', 3 + Math.floor(roll(2) * 4))
    addById(stacks, 'infernium_ingot', 2 + Math.floor(roll(3) * 3))
    if (roll(4) < 0.45) addById(stacks, 'diamond_block', 1 + Math.floor(roll(5) * 2))
    addById(stacks, 'strength_potion', 1 + Math.floor(roll(6) * 2))
    if (roll(7) < 0.5) addById(stacks, 'regeneration_potion', 1)
    if (roll(8) < 0.6) addById(stacks, 'health_potion_3', 1 + Math.floor(roll(9) * 2))
    if (roll(10) < 0.35) addById(stacks, 'gold_block', 1 + Math.floor(roll(11) * 2))
    if (roll(12) < 0.4) addById(stacks, 'lens_apparatus_block', 1)
    if (roll(13) < 0.12) addById(stacks, 'diamond_sword', 1)
    return stacks
  },
}

export const PRISM_SANCTUM_LOOT_TABLES: readonly ChestLootTable[] = [
  prismSanctumTier1LootTable,
  prismSanctumTier2LootTable,
  prismSanctumTier3LootTable,
]
