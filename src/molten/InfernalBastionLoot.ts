import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { ChestLootTable, LootRoll, LootStack } from '../world/loot/ChestLootRegistry.ts'
import { createItemFromId, isItemRegistered } from '../persistence/ItemRegistry.ts'

/**
 * Infernal Bastion chest loot, by tier. The castle kit puts a tier block
 * under every chest (`lootTierBlocks`): infernal tiles (0, outer rooms),
 * charred planks (1, deeper rooms), gilded infernal bricks (2, treasury and
 * war forge) and obsidian bricks (3, the vault and the Throne Crucible).
 * Signature radius 1 with rising priority: the richest tier block touching a
 * chest decides its table.
 *
 * Main thread only (uses the item registry); registered from setupMolten.
 * Items owned by other streams are created by id and simply skipped when
 * that stream's item isn't registered.
 */

interface LootEntry {
  readonly id: string
  readonly chance: number
  readonly min: number
  readonly max: number
}

interface TierSpec {
  readonly entries: readonly LootEntry[]
  /** Single-roll relics: one piece of gear from the list. */
  readonly relics?: readonly string[]
  readonly relicChance?: number
  /** Never fewer stacks than this: top up from `guaranteed`, in order. */
  readonly minStacks: number
  readonly guaranteed: readonly LootEntry[]
}

function stackOf(id: string, count: number): LootStack | null {
  if (count <= 0 || !isItemRegistered(id)) return null
  const item = createItemFromId(id)
  return item ? { item, count } : null
}

function rollTier(spec: TierSpec, roll: LootRoll): LootStack[] {
  const stacks: LootStack[] = []
  spec.entries.forEach((entry, i) => {
    if (roll(10 + i) >= entry.chance) return
    const stack = stackOf(entry.id, entry.min + Math.floor(roll(40 + i) * (entry.max - entry.min + 1)))
    if (stack) stacks.push(stack)
  })
  if (spec.relics && roll(90) < (spec.relicChance ?? 0)) {
    const relic = stackOf(spec.relics[Math.floor(roll(91) * spec.relics.length) % spec.relics.length], 1)
    if (relic) stacks.push(relic)
  }
  // Never a bare chest: top up when the dice were cruel
  spec.guaranteed.forEach((g, i) => {
    if (stacks.length >= spec.minStacks || stacks.some((st) => st.item.id === g.id)) return
    const stack = stackOf(g.id, g.min + Math.floor(roll(95 + i) * (g.max - g.min + 1)))
    if (stack) stacks.push(stack)
  })
  return stacks
}

/** Tier 0 - garrison stores in the outer rooms. */
const TIER_0: TierSpec = {
  entries: [
    { id: 'coal', chance: 0.6, min: 3, max: 8 },
    { id: 'bone', chance: 0.5, min: 2, max: 5 },
    { id: 'magma_cream', chance: 0.4, min: 1, max: 2 },
    { id: 'raw_infernium', chance: 0.3, min: 1, max: 2 },
    { id: 'gold_bar', chance: 0.25, min: 1, max: 2 },
    { id: 'iron_bar', chance: 0.3, min: 1, max: 3 },
    { id: 'health_potion_1', chance: 0.3, min: 1, max: 1 },
    { id: 'infernal_bricks_block', chance: 0.3, min: 4, max: 10 },
  ],
  minStacks: 2,
  guaranteed: [
    { id: 'coal', chance: 1, min: 2, max: 5 },
    { id: 'bone', chance: 1, min: 1, max: 3 },
  ],
}

/** Tier 1 - deeper rooms: smelting stock and soldiers' kit. */
const TIER_1: TierSpec = {
  entries: [
    { id: 'raw_infernium', chance: 0.6, min: 2, max: 4 },
    { id: 'infernium_ingot', chance: 0.3, min: 1, max: 1 },
    { id: 'gold_bar', chance: 0.5, min: 1, max: 3 },
    { id: 'steel_bar', chance: 0.4, min: 1, max: 3 },
    { id: 'magma_cream', chance: 0.5, min: 1, max: 3 },
    { id: 'fire_resistance_potion', chance: 0.4, min: 1, max: 1 },
    { id: 'health_potion_2', chance: 0.3, min: 1, max: 1 },
    { id: 'coal', chance: 0.4, min: 4, max: 8 },
  ],
  minStacks: 3,
  guaranteed: [
    { id: 'raw_infernium', chance: 1, min: 1, max: 2 },
    { id: 'gold_bar', chance: 1, min: 1, max: 2 },
    { id: 'coal', chance: 1, min: 3, max: 6 },
  ],
}

/** Tier 2 - treasury and war forge: ingots, gold, gems, good potions. */
const TIER_2: TierSpec = {
  entries: [
    { id: 'infernium_ingot', chance: 0.7, min: 1, max: 3 },
    { id: 'raw_infernium', chance: 0.5, min: 2, max: 5 },
    { id: 'gold_bar', chance: 0.8, min: 3, max: 6 },
    { id: 'diamond', chance: 0.5, min: 1, max: 2 },
    { id: 'magma_cream', chance: 0.5, min: 2, max: 4 },
    { id: 'fire_resistance_potion_long', chance: 0.35, min: 1, max: 1 },
    { id: 'strength_potion', chance: 0.25, min: 1, max: 1 },
    { id: 'health_potion_2', chance: 0.5, min: 1, max: 2 },
    { id: 'infernal_brazier_block', chance: 0.25, min: 1, max: 2 },
    { id: 'ember_lantern_block', chance: 0.3, min: 2, max: 4 },
  ],
  relics: ['infernium_sword', 'infernium_pickaxe', 'infernium_helmet', 'infernium_boots'],
  relicChance: 0.06,
  minStacks: 4,
  guaranteed: [
    { id: 'infernium_ingot', chance: 1, min: 1, max: 2 },
    { id: 'gold_bar', chance: 1, min: 2, max: 4 },
    { id: 'diamond', chance: 1, min: 1, max: 1 },
    { id: 'health_potion_2', chance: 1, min: 1, max: 1 },
  ],
}

/** Tier 3 - the vault and the Throne Crucible: the Tyrant's hoard. */
const TIER_3: TierSpec = {
  entries: [
    { id: 'infernium_ingot', chance: 1, min: 3, max: 6 },
    { id: 'diamond', chance: 0.8, min: 2, max: 4 },
    { id: 'gold_bar', chance: 0.9, min: 4, max: 8 },
    { id: 'ember_sight_potion_long', chance: 0.3, min: 1, max: 1 },
    { id: 'health_potion_3', chance: 0.5, min: 1, max: 2 },
    { id: 'fire_resistance_potion_long', chance: 0.6, min: 1, max: 2 },
    { id: 'regeneration_potion', chance: 0.4, min: 1, max: 1 },
    { id: 'strength_potion', chance: 0.4, min: 1, max: 1 },
    { id: 'magma_cream', chance: 0.5, min: 3, max: 6 },
  ],
  relics: [
    'infernium_sword', 'infernium_pickaxe', 'infernium_axe',
    'infernium_helmet', 'infernium_chestplate', 'infernium_leggings', 'infernium_boots',
  ],
  relicChance: 0.35,
  minStacks: 6,
  guaranteed: [
    { id: 'diamond', chance: 1, min: 1, max: 2 },
    { id: 'gold_bar', chance: 1, min: 3, max: 5 },
    { id: 'health_potion_3', chance: 1, min: 1, max: 1 },
    { id: 'fire_resistance_potion_long', chance: 1, min: 1, max: 1 },
    { id: 'magma_cream', chance: 1, min: 2, max: 4 },
    { id: 'raw_infernium', chance: 1, min: 3, max: 6 },
  ],
}

const TIER_TABLES: readonly [string, number, TierSpec][] = [
  ['bastion-t0', BlockIds.INFERNAL_TILES, TIER_0],
  ['bastion-t1', BlockIds.CHARRED_PLANKS, TIER_1],
  ['bastion-t2', BlockIds.GILDED_INFERNAL_BRICKS, TIER_2],
  ['bastion-t3', BlockIds.OBSIDIAN_BRICKS, TIER_3],
]

/** The four tier tables (priorities 11-14: the richest tier block touching a chest wins). */
export const bastionTierLootTables: readonly ChestLootTable[] = TIER_TABLES.map(([id, block, spec], tier) => ({
  id,
  signatureBlocks: [block],
  signatureRadius: 1,
  priority: 11 + tier,
  roll: (roll: LootRoll) => rollTier(spec, roll),
}))

