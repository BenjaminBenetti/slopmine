import { BlockIds } from '../world/blocks/BlockIds.ts'
import { registerChestLootTable, type ChestLootTable, type LootRoll, type LootStack } from '../world/loot/ChestLootRegistry.ts'
import { createItemFromId, isItemRegistered } from '../persistence/ItemRegistry.ts'

/**
 * Sporeheart Hive chest loot, one table per loot tier. The hive kit puts the
 * tier's signature block directly under every chest (`lootTierBlocks`):
 * tier 0 hive root brick (rooms near the gate), tier 1 brood comb, tier 2
 * glowing sap (deep chambers, cisterns), tier 3 root lattice (sap vaults
 * and the Sporemother's reward). Priorities rise with the tier, so a chest
 * that happens to stand next to a higher tier's block never loses loot.
 * Main thread only (uses the item registry).
 */

function stack(id: string, count: number): LootStack | null {
  if (count <= 0 || !isItemRegistered(id)) return null
  const item = createItemFromId(id)
  return item ? { item, count } : null
}

function pick<T>(roll: LootRoll, salt: number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(roll(salt) * list.length))]
}

function between(roll: LootRoll, salt: number, min: number, max: number): number {
  return min + Math.floor(roll(salt) * (max - min + 1))
}

const COMMON_POTIONS = ['health_potion_1', 'health_potion_2', 'slow_falling_potion', 'fire_resistance_potion', 'ember_sight_potion']
const GOOD_POTIONS = ['health_potion_2', 'regeneration_potion', 'ember_sight_potion_long', 'strength_potion', 'fire_resistance_potion_long']
const RARE_POTIONS = ['regeneration_potion', 'strength_potion', 'health_potion_3', 'ember_sight_potion_long', 'fire_resistance_potion_long']

function table(id: string, tierBlock: number, priority: number, roll: ChestLootTable['roll']): ChestLootTable {
  return { id, signatureBlocks: [tierBlock], signatureRadius: 1, priority, roll }
}

/** Tier 0: the outer tunnels - forage and wood. */
const tier0 = table('sporeheart-t0', BlockIds.HIVE_ROOTBRICK, 10, (roll) => {
  const stacks: Array<LootStack | null> = [
    roll(1) < 0.5 ? stack('emberwood_planks_block', between(roll, 2, 6, 14)) : stack('emberwood_stem_block', between(roll, 3, 3, 6)),
    stack('glowcap', between(roll, 4, 3, 8)),
    roll(5) < 0.6 ? stack('cooked_ember_hog', between(roll, 6, 1, 3)) : stack('roasted_glowcap', between(roll, 7, 2, 4)),
    stack('gold_bar', between(roll, 8, 1, 3)),
  ]
  if (roll(9) < 0.35) stacks.push(stack('iron_bar', between(roll, 10, 2, 4)))
  if (roll(11) < 0.3) stacks.push(stack(pick(roll, 12, COMMON_POTIONS), 1))
  if (roll(13) < 0.2) stacks.push(stack('glow_bulb_block', between(roll, 14, 1, 2)))
  return stacks.filter((s): s is LootStack => s !== null)
})

/** Tier 1: nurseries and galleries - brood comb chests. */
const tier1 = table('sporeheart-t1', BlockIds.BROOD_COMB, 11, (roll) => {
  const stacks: Array<LootStack | null> = [
    stack('glowcap', between(roll, 1, 4, 10)),
    stack('cooked_ember_hog', between(roll, 2, 2, 4)),
    stack('gold_bar', between(roll, 3, 2, 5)),
    roll(4) < 0.5 ? stack('steel_bar', between(roll, 5, 1, 3)) : stack('iron_bar', between(roll, 6, 3, 6)),
    stack(pick(roll, 7, COMMON_POTIONS), 1),
  ]
  if (roll(8) < 0.3) stacks.push(stack('diamond', 1))
  if (roll(9) < 0.4) stacks.push(stack('spore_sac_block', between(roll, 10, 2, 4)))
  if (roll(11) < 0.3) stacks.push(stack(roll(12) < 0.5 ? 'brood_comb_block' : 'hive_membrane_block', between(roll, 13, 4, 10)))
  return stacks.filter((s): s is LootStack => s !== null)
})

/** Tier 2: the deep chambers and sap cisterns. */
const tier2 = table('sporeheart-t2', BlockIds.GLOWING_SAP, 12, (roll) => {
  const stacks: Array<LootStack | null> = [
    stack('gold_bar', between(roll, 1, 3, 6)),
    stack('steel_bar', between(roll, 2, 2, 4)),
    stack(pick(roll, 3, GOOD_POTIONS), 1),
    stack('glowing_sap_block', between(roll, 4, 2, 4)),
  ]
  if (roll(5) < 0.65) stacks.push(stack('diamond', between(roll, 6, 1, 3)))
  if (roll(7) < 0.3) stacks.push(stack('infernium_ingot', 1))
  if (roll(8) < 0.35) stacks.push(stack(pick(roll, 9, COMMON_POTIONS), 1))
  if (roll(10) < 0.35) stacks.push(stack('glow_bulb_block', between(roll, 11, 1, 3)))
  if (roll(12) < 0.25) stacks.push(stack('chitin_plate_block', between(roll, 13, 4, 8)))
  return stacks.filter((s): s is LootStack => s !== null)
})

/** Tier 3: sap vaults behind root lattice, and the throne's hoard. */
const tier3 = table('sporeheart-t3', BlockIds.ROOT_LATTICE, 13, (roll) => {
  const stacks: Array<LootStack | null> = [
    stack('diamond', between(roll, 1, 2, 5)),
    stack('infernium_ingot', between(roll, 2, 1, 3)),
    stack('gold_bar', between(roll, 3, 4, 8)),
    stack(pick(roll, 4, RARE_POTIONS), 1),
    stack(pick(roll, 5, RARE_POTIONS), 1),
    stack('spore_sac_block', between(roll, 6, 2, 5)),
  ]
  if (roll(7) < 0.5) stacks.push(stack('glow_bulb_block', between(roll, 8, 2, 4)))
  if (roll(9) < 0.35) stacks.push(stack('raw_infernium', between(roll, 10, 1, 3)))
  if (roll(11) < 0.15) stacks.push(stack('diamond_block', 1))
  if (roll(12) < 0.1) stacks.push(stack(pick(roll, 13, ['diamond_sword', 'diamond_pickaxe', 'diamond_axe']), 1))
  if (roll(14) < 0.4) stacks.push(stack('emberwood_stairs_block', between(roll, 15, 4, 8)))
  return stacks.filter((s): s is LootStack => s !== null)
})

export const SPOREHEART_LOOT_TABLES: readonly ChestLootTable[] = [tier0, tier1, tier2, tier3]

export function registerSporeheartLoot(): void {
  for (const t of SPOREHEART_LOOT_TABLES) registerChestLootTable(t)
}
