import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { ChestLootTable, LootRoll, LootStack } from '../world/loot/ChestLootRegistry.ts'
import { createItemFromId, isItemRegistered } from '../persistence/ItemRegistry.ts'

/**
 * Catacombs chest loot, four tiers. The kit (CatacombsKit.ts,
 * `lootTierBlocks`) puts the tier's signature block directly under every
 * chest: tier 0 catacomb tile (graves, cap alcoves), tier 1 skull brick
 * (ossuary halls, sarcophagus chambers, annex tombs), tier 2 crypt altar
 * (shrines, the deep crypts), tier 3 gilded reliquary (the reliquary vaults
 * behind the grates). Radius 1 and rising priority: a chest reads the
 * richest signature touching it (tile floors are everywhere, so tier 0 has
 * the lowest priority).
 *
 * Items owned by other streams are created by string id and skipped if not
 * registered.
 */
function stack(id: string, count: number): LootStack | null {
  if (count <= 0 || !isItemRegistered(id)) return null
  const item = createItemFromId(id)
  return item ? { item, count } : null
}

function ranger(roll: LootRoll): (salt: number, min: number, max: number) => number {
  return (salt, min, max) => min + Math.floor(roll(salt) * (max - min + 1))
}

function keep(picks: Array<LootStack | null>): LootStack[] {
  return picks.filter((s): s is LootStack => s !== null)
}

/** Tier 0 - grave goods: bones, a little iron and gold, soul torches. */
export const catacombsGraveLoot: ChestLootTable = {
  id: 'catacombs-t0',
  signatureBlocks: [BlockIds.CATACOMB_TILE],
  signatureRadius: 1,
  priority: 10,
  roll(roll) {
    const range = ranger(roll)
    return keep([
      stack('bone', range(1, 3, 8)),
      roll(2) < 0.6 ? stack('iron_bar', range(3, 1, 3)) : null,
      roll(4) < 0.45 ? stack('gold_bar', range(5, 1, 2)) : null,
      roll(6) < 0.5 ? stack('soul_shard', range(7, 1, 2)) : null,
      roll(8) < 0.5 ? stack('soul_torch_block', range(9, 3, 6)) : null,
      roll(10) < 0.35 ? stack('health_potion_1', 1) : null,
      roll(11) < 0.3 ? stack('bone_meal', range(12, 2, 5)) : null,
    ])
  },
}

/** Tier 1 - ossuary offerings: gold, soul shards, ectoplasm, potions. */
export const catacombsOssuaryLoot: ChestLootTable = {
  id: 'catacombs-t1',
  signatureBlocks: [BlockIds.CATACOMB_SKULL_BRICK],
  signatureRadius: 1,
  priority: 11,
  roll(roll) {
    const range = ranger(roll)
    return keep([
      stack('gold_bar', range(1, 2, 5)),
      stack('soul_shard', range(2, 2, 4)),
      stack('bone', range(3, 4, 10)),
      roll(4) < 0.6 ? stack('ectoplasm', range(5, 1, 2)) : null,
      roll(6) < 0.5 ? stack('iron_bar', range(7, 2, 5)) : null,
      roll(8) < 0.25 ? stack('diamond', 1) : null,
      roll(9) < 0.5 ? stack('health_potion_2', 1) : null,
      roll(10) < 0.25 ? stack('fire_resistance_potion', 1) : null,
      roll(11) < 0.35 ? stack('soul_lantern_block', range(12, 2, 4)) : null,
    ])
  },
}

/** Tier 2 - altar treasures: steel, diamonds, soul shards, stronger potions. */
export const catacombsAltarLoot: ChestLootTable = {
  id: 'catacombs-t2',
  signatureBlocks: [BlockIds.CRYPT_ALTAR],
  signatureRadius: 1,
  priority: 12,
  roll(roll) {
    const range = ranger(roll)
    return keep([
      stack('gold_bar', range(1, 4, 8)),
      stack('soul_shard', range(2, 3, 6)),
      stack('ectoplasm', range(3, 1, 3)),
      roll(4) < 0.65 ? stack('diamond', range(5, 1, 2)) : null,
      roll(6) < 0.55 ? stack('steel_bar', range(7, 2, 4)) : null,
      roll(8) < 0.25 ? stack('infernium_ingot', 1) : null,
      roll(9) < 0.5 ? stack('regeneration_potion', 1) : null,
      roll(10) < 0.55 ? stack('health_potion_2', range(11, 1, 2)) : null,
      roll(12) < 0.3 ? stack('fire_resistance_potion_long', 1) : null,
      roll(13) < 0.1 ? stack('return_idol', 1) : null,
    ])
  },
}

/** Tier 3 - the reliquaries of the dead kings: diamonds, infernium, rare potions, relics. */
export const catacombsReliquaryLoot: ChestLootTable = {
  id: 'catacombs-t3',
  signatureBlocks: [BlockIds.GILDED_RELIQUARY],
  signatureRadius: 1,
  priority: 13,
  roll(roll) {
    const range = ranger(roll)
    return keep([
      stack('diamond', range(1, 2, 4)),
      stack('gold_bar', range(2, 6, 10)),
      stack('soul_shard', range(3, 4, 8)),
      stack('ectoplasm', range(4, 2, 4)),
      roll(5) < 0.6 ? stack('infernium_ingot', range(6, 1, 3)) : null,
      roll(7) < 0.6 ? stack('strength_potion', 1) : null,
      roll(8) < 0.6 ? stack('regeneration_potion', range(9, 1, 2)) : null,
      roll(10) < 0.7 ? stack('health_potion_3', range(11, 1, 2)) : null,
      roll(12) < 0.3 ? stack('return_idol', 1) : null,
      roll(13) < 0.25 ? stack('diamond_sword', 1) : null,
      roll(14) < 0.35 ? stack('soul_candelabra_block', range(15, 1, 2)) : null,
    ])
  },
}

export const catacombsLootTables: readonly ChestLootTable[] = [
  catacombsGraveLoot,
  catacombsOssuaryLoot,
  catacombsAltarLoot,
  catacombsReliquaryLoot,
]
